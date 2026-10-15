import { Router } from 'express';
import { isShareVisible, toDisplayResponse } from '../lib/configDocs.js';
import { initSseResponse } from '../lib/sseHub.js';

export function createDisplayRouter({ configurations, sse, timerSessions }) {
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
            // Replay the current snapshot so late subscribers catch up
            // immediately instead of waiting for the next report. Stamped
            // fresh (serverTime) so the client's in-flight compensation
            // uses this delivery time, not the original report time.
            const snap = timerSessions.snapshotOf(doc.shareToken);
            if (snap) {
                const frame = JSON.stringify(snap);
                res.write(`event: state\ndata: ${frame}\n\n`);
            }
        } catch (error) {
            console.error('GET /api/display/:token/stream', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/:token/state', async (req, res) => {
        try {
            const doc = await findShared(req.params.token);
            if (!doc) {
                res.status(404).json({
                    success: false,
                    message: 'Display link not found',
                });
                return;
            }
            const session = timerSessions.get(doc.shareToken);
            if (!session) {
                res.json({ success: true, data: { active: false } });
                return;
            }
            res.json({
                success: true,
                data: {
                    active: true,
                    startedAt: session.startedAt,
                    snapshot: timerSessions.snapshotOf(doc.shareToken),
                },
            });
        } catch (error) {
            console.error('GET /api/display/:token/state', error);
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
