import { Router } from 'express';
import { resolveOwnerId } from '../lib/authPolicy.js';
import { parseObjectId } from '../lib/ids.js';

function sendError(res, error, fallback) {
    const status = error.status || 500;
    if (status >= 500) {
        console.error(fallback, error);
    }
    // Machine-readable cause for clients that arbitrate on it (D29 §18).
    const body = { success: false, message: error.message || fallback };
    if (error.code) {
        body.code = error.code;
    }
    res.status(status).json(body);
}

/**
 * D40 (v1.1): host operation intent — the console reports each engine
 * operation the moment it dispatches it, carrying absolute wall-clock
 * anchors. The registry validates, stamps a shared commandSeq, and
 * broadcasts an intent frame to displays over the token stream (never the
 * owner stream — the host must not replay its own operation).
 *
 * Path: three-segment form /api/session/:name/intent (api-path-rules).
 * Auth + ownership identical to the control-session endpoints: strictly the
 * configuration owner; admins do not control on behalf of others.
 */
export function createIntentRouter({ configurations, timerSessions, requireAuth }) {
    const router = Router();
    router.use(requireAuth);

    router.post('/:name/intent', async (req, res) => {
        try {
            const ownerId = parseObjectId(resolveOwnerId(req.user, req.query.ownerId));
            if (!ownerId) {
                res.status(400).json({ success: false, message: 'Invalid owner' });
                return;
            }
            const existing = await configurations.findOne({ ownerId, name: req.params.name });
            if (!existing) {
                res.status(404).json({
                    success: false,
                    message: `Configuration "${req.params.name}" not found`,
                });
                return;
            }
            if (String(existing.ownerId) !== String(req.user.id)) {
                res.status(403).json({
                    success: false,
                    message: 'Cannot control another user\'s configuration',
                });
                return;
            }
            const intent = timerSessions.reportIntent(existing.shareToken, req.body);
            res.json({
                success: true,
                // serverTime for the anchor clock-domain sampling (same
                // NTP-lite use as the report endpoint).
                data: { commandSeq: intent.commandSeq, serverTime: Date.now() },
            });
        } catch (error) {
            sendError(res, error, 'POST /api/session/:name/intent');
        }
    });

    return router;
}
