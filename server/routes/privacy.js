import { Router } from 'express';
import { PRIVACY_NOTICE_VERSION, getNotice } from '../lib/privacyNotices.js';
import { CONSENT, consentOf, createAuditRecorder } from '../lib/auditLog.js';
import { pendingGates } from '../lib/authGates.js';

/**
 * Privacy notice (R20, S-01 PRD §5.6).
 *
 * GET  /notices/current   anonymous; the notice text in one of the three UI
 *                         languages (falls back to English).
 * POST /consent/accept    records that the signed-in account agreed to the
 *                         CURRENT notice version. A stale version is refused
 *                         with 409 so the client re-reads the notice first.
 */
export function createPrivacyRouter({ users, auditLogs, requireAuth }) {
    const router = Router();
    const audit = createAuditRecorder(auditLogs);

    router.get('/notices/current', (req, res) => {
        const lng = typeof req.query?.lng === 'string' ? req.query.lng : undefined;
        // Never cached: the version must always match what the server considers current.
        res.setHeader('Cache-Control', 'no-store');
        res.json({ success: true, data: getNotice(lng) });
    });

    router.post('/consent/accept', requireAuth, async (req, res) => {
        try {
            const user = req.authUser;
            if (!user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }
            const version = req.body?.version;
            if (typeof version !== 'string' || version.length === 0) {
                res.status(400).json({ success: false, message: 'Privacy notice version is required' });
                return;
            }
            if (version !== PRIVACY_NOTICE_VERSION) {
                res.status(409).json({
                    success: false,
                    code: 'PRIVACY_NOTICE_UPDATED',
                    message: 'Privacy notice has been updated, please review and consent again',
                });
                return;
            }

            const consentedAt = new Date();
            await users.updateOne({ _id: user._id }, { $set: { privacy: { version, consentedAt } } });
            await audit.record({
                type: 'privacy_consented',
                result: 'success',
                consent: CONSENT.CONSENTED,
                req,
                actorUserId: user._id,
                subjectUserId: user._id,
                detail: { version, channel: 'login_gate' },
            });

            const fresh = await users.findOne({ _id: user._id });
            res.json({
                success: true,
                data: {
                    version,
                    consentedAt: consentedAt.getTime(),
                    pending: pendingGates(fresh ?? user),
                },
            });
        } catch (error) {
            console.error('POST /api/privacy/consent/accept', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}
