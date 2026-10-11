import { Router } from 'express';
import { parseObjectId } from '../lib/ids.js';
import { resolveOwnerId } from '../lib/authPolicy.js';
import { buildMatchRecord, exportFilename, toDetail, toListItem } from '../lib/matchLogs.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function createMatchLogsRouter({ matchLogs, requireAuth }) {
    const router = Router();
    router.use(requireAuth);

    function sendError(res, error, fallback) {
        const status = error.status || 500;
        if (status >= 500) {
            console.error(fallback, error);
        }
        res.status(status).json({ success: false, message: error.message || fallback });
    }

    function ownerObjectId(req) {
        // Admins may read on behalf of an owner; writes are always self-scoped.
        const raw = req.query.ownerId && req.user.role === 'admin'
            ? resolveOwnerId(req.user, req.query.ownerId)
            : req.user.id;
        const parsed = parseObjectId(raw);
        if (!parsed) {
            const error = new Error('Invalid owner');
            error.status = 400;
            throw error;
        }
        return parsed;
    }

    async function findOwned(req, res) {
        const id = parseObjectId(req.params.id);
        if (!id) {
            res.status(404).json({ success: false, message: 'Match record not found' });
            return null;
        }
        // Non-admins always scope the query by their own ownerId (no
        // cross-tenant reads, even before the ownership check).
        const isAdmin = req.user.role === 'admin';
        const query = isAdmin
            ? { _id: id }
            : { _id: id, ownerId: parseObjectId(req.user.id) };
        const doc = await matchLogs.findOne(query);
        if (!doc) {
            res.status(404).json({ success: false, message: 'Match record not found' });
            return null;
        }
        return doc;
    }

    router.post('/', async (req, res) => {
        try {
            const doc = buildMatchRecord(req.body, parseObjectId(req.user.id));
            const inserted = await matchLogs.insertOne(doc);
            res.json({
                success: true,
                data: { id: String(inserted.insertedId), savedAt: doc.savedAt, summary: doc.summary },
            });
        } catch (error) {
            sendError(res, error, 'POST /api/match-logs');
        }
    });

    router.get('/', async (req, res) => {
        try {
            const ownerId = ownerObjectId(req);
            const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
            const before = Number(req.query.before);
            const query = {
                ownerId,
                ...(Number.isFinite(before) && before > 0 ? { savedAt: { $lt: before } } : {}),
            };
            const docs = await matchLogs
                .find(query)
                .sort({ savedAt: -1 })
                .limit(limit + 1)
                .toArray();
            const hasMore = docs.length > limit;
            const page = hasMore ? docs.slice(0, limit) : docs;
            res.json({
                success: true,
                data: {
                    items: page.map(toListItem),
                    nextBefore: hasMore ? page[page.length - 1].savedAt : null,
                },
            });
        } catch (error) {
            sendError(res, error, 'GET /api/match-logs');
        }
    });

    // JSON attachment only. CSV export is assembled client-side from the
    // detail payload (BD-6: never compose user-sourced text on the server).
    router.get('/:id/export', async (req, res) => {
        try {
            const doc = await findOwned(req, res);
            if (!doc) {
                return;
            }
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${exportFilename(doc, 'json')}"`);
            res.json({ success: true, data: toDetail(doc) });
        } catch (error) {
            sendError(res, error, 'GET /api/match-logs/:id/export');
        }
    });

    router.get('/:id', async (req, res) => {
        try {
            const doc = await findOwned(req, res);
            if (!doc) {
                return;
            }
            res.json({ success: true, data: toDetail(doc) });
        } catch (error) {
            sendError(res, error, 'GET /api/match-logs/:id');
        }
    });

    router.delete('/:id', async (req, res) => {
        try {
            const doc = await findOwned(req, res);
            if (!doc) {
                return;
            }
            if (String(doc.ownerId) !== String(req.user.id)) {
                res.status(403).json({ success: false, message: 'Cannot delete another user\'s match record' });
                return;
            }
            await matchLogs.deleteOne({ _id: doc._id });
            res.json({ success: true, data: { deleted: true } });
        } catch (error) {
            sendError(res, error, 'DELETE /api/match-logs/:id');
        }
    });

    return router;
}
