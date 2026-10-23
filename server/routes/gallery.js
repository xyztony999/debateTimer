import { Router } from 'express';
import { toDisplayResponse } from '../lib/configDocs.js';
import { parseObjectId } from '../lib/ids.js';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

function modeSummary(timerSettings = {}) {
    const counts = { single: 0, double: 0, free: 0 };
    for (const mode of Object.values(timerSettings)) {
        if (counts[mode] !== undefined) {
            counts[mode] += 1;
        }
    }
    return ['single', 'double', 'free']
        .filter((mode) => counts[mode] > 0)
        .map((mode) => `${mode}×${counts[mode]}`)
        .join(' · ') || '—';
}

function toGalleryItem(doc) {
    const stages = doc.debateStages || {};
    const totalSeconds = Object.values(stages).reduce((sum, seconds) => sum + (Number(seconds) || 0), 0);
    return {
        id: String(doc._id),
        name: doc.name,
        stageCount: Object.keys(stages).length,
        totalSeconds,
        modeSummary: modeSummary(doc.timerSettings),
        updatedAt: doc.updatedAt,
        copies: Number(doc.galleryCopyCount) || 0,
        ...(doc.creditName ? { creditName: doc.creditName } : {}),
    };
}

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Public template gallery: anonymous read-only view over configurations
 * flagged isPublic. Responses never include owner identity or share tokens
 * (a self-chosen creditName is the only attribution, opt-in by the owner).
 */
export function createGalleryRouter({ configurations, requireAuth, requireAdmin }) {
    const router = Router();

    router.get('/', async (req, res) => {
        try {
            const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));
            const before = Number(req.query.before);
            const query = {
                isPublic: true,
                ...(Number.isFinite(before) && before > 0 ? { updatedAt: { $lt: before } } : {}),
            };
            // Free-text search over template names (case-insensitive).
            const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 50) : '';
            if (q) {
                query.name = { $regex: escapeRegex(q), $options: 'i' };
            }
            // Sort whitelist — never derive Mongo sort keys from user input.
            const SORTS = {
                updated: { updatedAt: -1 },
                copies: { galleryCopyCount: -1, updatedAt: -1 },
            };
            const sort = SORTS[req.query.sort] || SORTS.updated;
            const docs = await configurations
                .find(query, {
                    projection: {
                        name: 1, debateStages: 1, timerSettings: 1, updatedAt: 1,
                        galleryCopyCount: 1, creditName: 1,
                    },
                })
                .sort(sort)
                .limit(limit + 1)
                .toArray();
            const hasMore = docs.length > limit;
            const page = hasMore ? docs.slice(0, limit) : docs;
            res.json({
                success: true,
                data: {
                    items: page.map(toGalleryItem),
                    nextBefore: hasMore ? page[page.length - 1].updatedAt : null,
                },
            });
        } catch (error) {
            console.error('GET /api/gallery', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/:id', async (req, res) => {
        try {
            const id = parseObjectId(req.params.id);
            // Unpublished and missing templates are indistinguishable (404).
            const doc = id
                ? await configurations.findOne(
                    { _id: id, isPublic: true },
                    { projection: { ownerId: 0, shareToken: 0, shareEnabled: 0 } },
                )
                : null;
            if (!doc) {
                res.status(404).json({ success: false, message: 'Template not found' });
                return;
            }
            res.json({
                success: true,
                data: { ...toGalleryItem(doc), ...toDisplayResponse(doc) },
            });
        } catch (error) {
            console.error('GET /api/gallery/:id', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Popularity signal: clients call this after a successful copy. Count
    // only (no copier identity); login required to blunt casual inflation.
    router.post('/:id/copy', requireAuth, async (req, res) => {
        try {
            const id = parseObjectId(req.params.id);
            if (!id) {
                res.status(404).json({ success: false, message: 'Template not found' });
                return;
            }
            const result = await configurations.updateOne(
                { _id: id, isPublic: true },
                { $inc: { galleryCopyCount: 1 } },
            );
            if (result.modifiedCount === 0) {
                res.status(404).json({ success: false, message: 'Template not found' });
                return;
            }
            res.json({ success: true, data: { counted: true } });
        } catch (error) {
            console.error('POST /api/gallery/:id/copy', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/:id/unpublish', requireAuth, requireAdmin, async (req, res) => {        try {
            const id = parseObjectId(req.params.id);
            if (!id) {
                res.status(404).json({ success: false, message: 'Template not found' });
                return;
            }
            const result = await configurations.updateOne(
                { _id: id, isPublic: true },
                { $set: { isPublic: false, updatedAt: Date.now() } },
            );
            res.json({ success: true, data: { unpublished: result.modifiedCount > 0 } });
        } catch (error) {
            console.error('POST /api/gallery/:id/unpublish', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}
