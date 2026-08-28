import { Router } from 'express';
import { canAccessConfig, resolveOwnerId } from '../lib/authPolicy.js';
import { pickConfigFields, toConfigResponse, toListItem } from '../lib/configDocs.js';
import { parseObjectId } from '../lib/ids.js';
import { generateShareToken } from '../lib/shareToken.js';
import { initSseResponse } from '../lib/sseHub.js';

function ownerObjectId(user, requestedOwnerId) {
    const raw = resolveOwnerId(user, requestedOwnerId);
    const parsed = parseObjectId(raw);
    if (!parsed) {
        const err = new Error('Invalid owner');
        err.status = 400;
        throw err;
    }
    return parsed;
}

function sendError(res, error, fallback) {
    const status = error.status || 500;
    if (status >= 500) {
        console.error(fallback, error);
    }
    res.status(status).json({ success: false, message: error.message || fallback });
}

export function createConfigurationsRouter({ configurations, sse, requireAuth }) {
    const router = Router();
    router.use(requireAuth);

    router.get('/stream', (req, res) => {
        initSseResponse(res);
        sse.add({
            res,
            userId: String(req.user.id),
            isAdmin: req.user.role === 'admin',
        });
    });

    router.get('/', async (req, res) => {
        try {
            if (req.query.ownerId && req.user.role !== 'admin') {
                res.status(403).json({ success: false, message: 'Cannot list another user\'s configurations' });
                return;
            }
            const ownerId = ownerObjectId(req.user, req.query.ownerId);
            const docs = await configurations.find({ ownerId }).project({
                name: 1,
                createdAt: 1,
                updatedAt: 1,
                shareEnabled: 1,
            }).sort({ updatedAt: -1 }).toArray();
            res.json({ success: true, data: docs.map(toListItem) });
        } catch (error) {
            sendError(res, error, 'GET /api/configurations');
        }
    });

    router.get('/:name', async (req, res) => {
        try {
            if (req.query.ownerId && req.user.role !== 'admin') {
                res.status(403).json({ success: false, message: 'Cannot access another user\'s configurations' });
                return;
            }
            const ownerId = ownerObjectId(req.user, req.query.ownerId);
            const doc = await configurations.findOne({ ownerId, name: req.params.name });
            if (!doc) {
                res.status(404).json({
                    success: false,
                    message: `Configuration "${req.params.name}" not found`,
                });
                return;
            }
            res.json({
                success: true,
                data: toConfigResponse(doc, { includeShareToken: true }),
            });
        } catch (error) {
            sendError(res, error, 'GET /api/configurations/:name');
        }
    });

    router.put('/:name', async (req, res) => {
        try {
            if (req.query.ownerId && req.user.role !== 'admin') {
                res.status(403).json({ success: false, message: 'Cannot modify another user\'s configurations' });
                return;
            }
            const ownerId = ownerObjectId(req.user, req.query.ownerId);
            const name = req.params.name;
            const existing = await configurations.findOne({ ownerId, name });
            const now = Date.now();
            const payload = {
                ...pickConfigFields(req.body),
                ownerId,
                name,
                updatedAt: now,
                createdAt: existing?.createdAt ?? now,
                shareToken: existing?.shareToken ?? null,
                shareEnabled: existing?.shareEnabled ?? false,
            };

            if (existing) {
                await configurations.replaceOne(
                    { _id: existing._id },
                    { _id: existing._id, ...payload },
                );
            } else {
                await configurations.insertOne(payload);
            }

            sse.broadcast({
                ownerId: String(ownerId),
                name,
                shareToken: payload.shareEnabled ? payload.shareToken : undefined,
            });
            res.json({
                success: true,
                message: `Configuration "${name}" saved successfully`,
            });
        } catch (error) {
            sendError(res, error, 'PUT /api/configurations/:name');
        }
    });

    router.delete('/:name', async (req, res) => {
        try {
            if (req.query.ownerId && req.user.role !== 'admin') {
                res.status(403).json({ success: false, message: 'Cannot delete another user\'s configurations' });
                return;
            }
            const ownerId = ownerObjectId(req.user, req.query.ownerId);
            const existing = await configurations.findOne({ ownerId, name: req.params.name });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    message: `Configuration "${req.params.name}" not found`,
                });
                return;
            }
            await configurations.deleteOne({ _id: existing._id });
            sse.broadcast({
                ownerId: String(ownerId),
                name: req.params.name,
                shareToken: existing.shareEnabled ? existing.shareToken : undefined,
            });
            res.json({
                success: true,
                message: `Configuration "${req.params.name}" deleted successfully`,
            });
        } catch (error) {
            sendError(res, error, 'DELETE /api/configurations/:name');
        }
    });

    router.post('/:name/share', async (req, res) => {
        try {
            if (req.query.ownerId && req.user.role !== 'admin') {
                res.status(403).json({ success: false, message: 'Cannot share another user\'s configurations' });
                return;
            }
            const ownerId = ownerObjectId(req.user, req.query.ownerId);
            const existing = await configurations.findOne({ ownerId, name: req.params.name });
            if (!existing || !canAccessConfig(req.user, existing)) {
                res.status(404).json({
                    success: false,
                    message: `Configuration "${req.params.name}" not found`,
                });
                return;
            }

            const rotate = Boolean(req.body?.rotate);
            const enabled = req.body?.enabled;
            let shareEnabled = existing.shareEnabled;
            let shareToken = existing.shareToken || null;

            if (typeof enabled === 'boolean') {
                shareEnabled = enabled;
            }
            if (shareEnabled && (!shareToken || rotate)) {
                shareToken = generateShareToken();
            }
            if (!shareEnabled && rotate) {
                shareToken = generateShareToken();
            }

            await configurations.updateOne(
                { _id: existing._id },
                {
                    $set: {
                        shareEnabled,
                        shareToken: shareEnabled ? shareToken : shareToken,
                        updatedAt: Date.now(),
                    },
                },
            );

            sse.broadcast({
                ownerId: String(ownerId),
                name: req.params.name,
                shareToken: existing.shareToken,
            });
            if (shareToken && shareToken !== existing.shareToken) {
                sse.broadcast({
                    ownerId: String(ownerId),
                    name: req.params.name,
                    shareToken,
                });
            }

            res.json({
                success: true,
                data: {
                    shareEnabled,
                    shareToken: shareEnabled ? shareToken : null,
                },
            });
        } catch (error) {
            sendError(res, error, 'POST /api/configurations/:name/share');
        }
    });

    return router;
}
