import { Router } from 'express';
import { isShareVisible, toDisplayResponse } from '../lib/configDocs.js';
import { initSseResponse } from '../lib/sseHub.js';

export function createDisplayRouter({ configurations, sse }) {
    const router = Router();

    async function findShared(token) {
        if (!token) {
            return null;
        }
        const doc = await configurations.findOne({ shareToken: token });
        if (!isShareVisible(doc)) {
            return null;
        }
        return doc;
    }

    router.get('/:token/stream', async (req, res) => {
        try {
            const doc = await findShared(req.params.token);
            if (!doc) {
                res.status(404).json({
                    success: false,
                    message: 'Display link not found',
                });
                return;
            }
            initSseResponse(res);
            sse.add({ res, shareToken: req.params.token });
        } catch (error) {
            console.error('GET /api/display/:token/stream', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/:token', async (req, res) => {
        try {
            const doc = await findShared(req.params.token);
            if (!doc) {
                res.status(404).json({
                    success: false,
                    message: 'Display link not found',
                });
                return;
            }
            res.json({ success: true, data: toDisplayResponse(doc) });
        } catch (error) {
            console.error('GET /api/display/:token', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}
