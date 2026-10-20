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
    // Machine-readable cause for clients that arbitrate on it (D29 §18).
    const body = { success: false, message: error.message || fallback };
    if (error.code) {
        body.code = error.code;
    }
    res.status(status).json(body);
}

export function createConfigurationsRouter({ configurations, sse, requireAuth, timerSessions }) {
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
                        shareToken,
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

            // Disabling sharing or rotating the token kills the live session
            // keyed by the old token (displays fall back to standalone mode).
            if (existing.shareToken && existing.shareToken !== shareToken) {
                timerSessions.end(existing.shareToken, 'share_disabled');
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

    // --- Control session (timer state sync) -------------------------------
    // Strictly the configuration owner may drive a session; admins do not
    // control on behalf of others.

    async function findOwnConfig(req, res) {
        const ownerId = ownerObjectId(req.user, req.query.ownerId);
        const existing = await configurations.findOne({ ownerId, name: req.params.name });
        if (!existing) {
            res.status(404).json({
                success: false,
                message: `Configuration "${req.params.name}" not found`,
            });
            return null;
        }
        if (String(existing.ownerId) !== String(req.user.id)) {
            res.status(403).json({
                success: false,
                message: 'Cannot control another user\'s configuration',
            });
            return null;
        }
        return existing;
    }

    router.post('/:name/session', async (req, res) => {
        try {
            const existing = await findOwnConfig(req, res);
            if (!existing) {
                return;
            }
            const session = timerSessions.create({ doc: existing });
            res.json({
                success: true,
                data: {
                    sessionId: session.sessionId,
                    shareToken: session.shareToken,
                    pairingCode: session.pairingCode,
                    displayUrl: `/display/${session.shareToken}`,
                    status: 'active',
                    startedAt: session.startedAt,
                    snapshot: session.lastSnapshot,
                },
            });
        } catch (error) {
            sendError(res, error, 'POST /api/configurations/:name/session');
        }
    });

    router.put('/:name/session/state', async (req, res) => {
        try {
            const existing = await findOwnConfig(req, res);
            if (!existing) {
                return;
            }
            const session = timerSessions.report(existing.shareToken, req.body);
            res.json({
                success: true,
                // D32 (PageSpec §19): server clock for the host's NTP-lite
                // offset measurement (sample = serverTime − (t0 + RTT/2)).
                data: { accepted: true, seq: session.lastSeq, serverTime: Date.now() },
            });
        } catch (error) {
            sendError(res, error, 'PUT /api/configurations/:name/session/state');
        }
    });

    // C-02-08: transparent WebRTC signaling relay (owner-only; one-shot frames).
    router.post('/:name/session/signal', async (req, res) => {
        try {
            const existing = await findOwnConfig(req, res);
            if (!existing) {
                return;
            }
            timerSessions.relaySignal(existing.shareToken, req.body);
            res.json({ success: true, data: { relayed: true } });
        } catch (error) {
            sendError(res, error, 'POST /api/configurations/:name/session/signal');
        }
    });

    // C-02-07: thin-remote command relay (owner-only; the host executes).
    router.post('/:name/session/command', async (req, res) => {
        try {
            const existing = await findOwnConfig(req, res);
            if (!existing) {
                return;
            }
            const command = timerSessions.pushCommand(existing.shareToken, req.body);
            res.json({
                success: true,
                data: { commandSeq: command.commandSeq },
            });
        } catch (error) {
            sendError(res, error, 'POST /api/configurations/:name/session/command');
        }
    });

    router.delete('/:name/session', async (req, res) => {
        try {
            const existing = await findOwnConfig(req, res);
            if (!existing) {
                return;
            }
            timerSessions.end(existing.shareToken, 'closed_by_operator');
            res.json({ success: true, data: { ended: true } });
        } catch (error) {
            sendError(res, error, 'DELETE /api/configurations/:name/session');
        }
    });

    // Publish / unpublish the template to the public gallery (owner only).
    router.post('/:name/visibility', async (req, res) => {
        try {
            const existing = await findOwnConfig(req, res);
            if (!existing) {
                return;
            }
            const isPublic = req.body?.public === true;
            await configurations.updateOne(
                { _id: existing._id },
                { $set: { isPublic, updatedAt: Date.now() } },
            );
            sse.broadcast({
                ownerId: String(existing.ownerId),
                name: existing.name,
            });
            res.json({ success: true, data: { isPublic } });
        } catch (error) {
            sendError(res, error, 'POST /api/configurations/:name/visibility');
        }
    });

    return router;
}
