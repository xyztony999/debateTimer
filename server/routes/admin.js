import { Router } from 'express';
import { parseObjectId } from '../lib/ids.js';
import { toAdminListItem } from '../lib/configDocs.js';
import {
    hashPassword,
    normalizeUsername,
    validatePassword,
    validateUsername,
} from '../lib/password.js';
import { destroyUserSessions } from '../lib/session.js';
import { parseAllowRegistration, publicUser, REGISTRATION_SETTING_ID } from '../lib/authPolicy.js';
import { consentOf, createAuditRecorder, scrubUserAuditLogs } from '../lib/auditLog.js';
import { removeTotp } from '../lib/totpStore.js';

function sendError(res, error, fallback) {
    const status = error.status || 500;
    if (status >= 500) {
        console.error(fallback, error);
    }
    res.status(status).json({ success: false, message: error.message || fallback });
}

function toAdminUser(user) {
    return {
        ...publicUser(user),
        disabled: Boolean(user.disabled),
        createdAt: user.createdAt,
        // Boolean only: nothing else about the second factor leaves the server.
        totpEnabled: Boolean(user.totp?.enabled),
    };
}

export function createAdminRouter({
    users,
    sessions,
    configurations,
    appSettings,
    sse,
    requireAuth,
    requireAdmin,
    auditLogs,
}) {
    const router = Router();
    router.use(requireAuth, requireAdmin);
    const audit = createAuditRecorder(auditLogs);

    // Every governance write is recorded (R20). Whether the IP is kept depends
    // on the ADMIN's own privacy-notice consent — the IP belongs to the actor.
    function auditContext(req) {
        return { req, actorUserId: parseObjectId(req.user?.id), consent: consentOf(req.authUser) };
    }

    // Registration toggle: the singleton app_settings doc wins over the env
    // fallback once an admin has written it; until then env (default closed)
    // governs. The first-user short circuit is runtime semantics — it lives in
    // /api/auth/status, not in the values surfaced here.
    function toRegistrationPayload(setting) {
        const envDefault = parseAllowRegistration(process.env.ALLOW_REGISTRATION);
        if (!setting) {
            return {
                registrationOpen: envDefault,
                source: 'env',
                envDefault,
                updatedAt: null,
                updatedBy: null,
            };
        }
        return {
            registrationOpen: Boolean(setting.registrationOpen),
            source: 'admin',
            envDefault,
            updatedAt: setting.updatedAt ?? null,
            updatedBy: setting.updatedBy ?? null,
        };
    }

    router.get('/settings/registration', async (_req, res) => {
        try {
            const setting = appSettings
                ? await appSettings.findOne({ _id: REGISTRATION_SETTING_ID })
                : null;
            res.json({ success: true, data: toRegistrationPayload(setting) });
        } catch (error) {
            sendError(res, error, 'GET /api/admin/settings/registration');
        }
    });

    router.put('/settings/registration', async (req, res) => {
        try {
            if (typeof req.body?.registrationOpen !== 'boolean') {
                res.status(400).json({ success: false, message: 'registrationOpen must be a boolean' });
                return;
            }
            const updatedAt = Date.now();
            const updatedBy = req.user?.username ?? null;
            // Read first so a no-op rewrite (same value) writes no audit event.
            const previous = await appSettings.findOne({ _id: REGISTRATION_SETTING_ID });
            await appSettings.updateOne(
                { _id: REGISTRATION_SETTING_ID },
                { $set: { registrationOpen: req.body.registrationOpen, updatedAt, updatedBy } },
                { upsert: true },
            );
            if (previous?.registrationOpen !== req.body.registrationOpen) {
                await audit.record({
                    type: 'registration_setting_changed',
                    result: 'success',
                    ...auditContext(req),
                    subjectUserId: null,
                    detail: {
                        from: previous ? Boolean(previous.registrationOpen) : null,
                        to: req.body.registrationOpen,
                    },
                });
            }
            res.json({
                success: true,
                data: {
                    registrationOpen: req.body.registrationOpen,
                    source: 'admin',
                    envDefault: parseAllowRegistration(process.env.ALLOW_REGISTRATION),
                    updatedAt,
                    updatedBy,
                },
            });
        } catch (error) {
            sendError(res, error, 'PUT /api/admin/settings/registration');
        }
    });

    async function countAdmins(excludeId = null) {
        const filter = { role: 'admin', disabled: { $ne: true } };
        if (excludeId) {
            filter._id = { $ne: excludeId };
        }
        return users.countDocuments(filter);
    }

    router.get('/users', async (_req, res) => {
        try {
            const docs = await users.find({}).sort({ createdAt: 1 }).toArray();
            res.json({ success: true, data: docs.map(toAdminUser) });
        } catch (error) {
            sendError(res, error, 'GET /api/admin/users');
        }
    });

    router.post('/users', async (req, res) => {
        try {
            const username = normalizeUsername(req.body?.username);
            const password = req.body?.password;
            const role = req.body?.role === 'admin' ? 'admin' : 'user';
            const usernameError = validateUsername(username);
            const passwordError = validatePassword(password);
            if (usernameError || passwordError) {
                res.status(400).json({ success: false, message: usernameError || passwordError });
                return;
            }

            const existing = await users.findOne({ username });
            if (existing) {
                res.status(409).json({ success: false, message: 'Username already taken' });
                return;
            }

            const result = await users.insertOne({
                username,
                passwordHash: await hashPassword(password),
                role,
                disabled: false,
                createdAt: Date.now(),
            });
            const user = await users.findOne({ _id: result.insertedId });
            await audit.record({
                type: 'user_created',
                result: 'success',
                ...auditContext(req),
                subjectUserId: result.insertedId,
                detail: { role },
            });
            res.status(201).json({ success: true, data: toAdminUser(user) });
        } catch (error) {
            sendError(res, error, 'POST /api/admin/users');
        }
    });

    router.patch('/users/:id', async (req, res) => {
        try {
            const userId = parseObjectId(req.params.id);
            if (!userId) {
                res.status(400).json({ success: false, message: 'Invalid user id' });
                return;
            }
            const user = await users.findOne({ _id: userId });
            if (!user) {
                res.status(404).json({ success: false, message: 'User not found' });
                return;
            }

            const updates = {};
            if (typeof req.body?.disabled === 'boolean') {
                if (req.body.disabled && String(user._id) === String(req.user.id)) {
                    res.status(400).json({ success: false, message: 'You cannot disable your own account' });
                    return;
                }
                if (req.body.disabled && user.role === 'admin' && await countAdmins(userId) === 0) {
                    res.status(400).json({ success: false, message: 'Cannot disable the last admin' });
                    return;
                }
                updates.disabled = req.body.disabled;
            }

            if (req.body?.role === 'admin' || req.body?.role === 'user') {
                if (req.body.role === 'user' && user.role === 'admin' && await countAdmins(userId) === 0) {
                    res.status(400).json({ success: false, message: 'Cannot demote the last admin' });
                    return;
                }
                updates.role = req.body.role;
            }

            if (req.body?.password) {
                const passwordError = validatePassword(req.body.password);
                if (passwordError) {
                    res.status(400).json({ success: false, message: passwordError });
                    return;
                }
                updates.passwordHash = await hashPassword(req.body.password);
            }

            if (Object.keys(updates).length === 0) {
                res.json({ success: true, data: toAdminUser(user) });
                return;
            }

            await users.updateOne({ _id: userId }, { $set: updates });
            if (updates.disabled || updates.passwordHash) {
                await destroyUserSessions(sessions, userId);
            }
            // One event per fact that actually changed; an idempotent PATCH records nothing.
            const context = auditContext(req);
            if (Object.hasOwn(updates, 'role') && updates.role !== user.role) {
                await audit.record({
                    type: 'role_changed', result: 'success', ...context, subjectUserId: userId,
                    detail: { from: user.role, to: updates.role },
                });
            }
            if (Object.hasOwn(updates, 'disabled') && Boolean(updates.disabled) !== Boolean(user.disabled)) {
                await audit.record({
                    type: 'status_changed', result: 'success', ...context, subjectUserId: userId,
                    detail: {
                        from: user.disabled ? 'disabled' : 'enabled',
                        to: updates.disabled ? 'disabled' : 'enabled',
                    },
                });
            }
            if (Object.hasOwn(updates, 'passwordHash')) {
                await audit.record({
                    type: 'password_reset', result: 'success', ...context, subjectUserId: userId,
                });
            }
            const next = await users.findOne({ _id: userId });
            res.json({ success: true, data: toAdminUser(next) });
        } catch (error) {
            sendError(res, error, 'PATCH /api/admin/users/:id');
        }
    });

    router.delete('/users/:id', async (req, res) => {
        try {
            const userId = parseObjectId(req.params.id);
            if (!userId) {
                res.status(400).json({ success: false, message: 'Invalid user id' });
                return;
            }
            if (String(userId) === String(req.user.id)) {
                res.status(400).json({ success: false, message: 'You cannot delete your own account' });
                return;
            }
            const user = await users.findOne({ _id: userId });
            if (!user) {
                res.status(404).json({ success: false, message: 'User not found' });
                return;
            }
            if (user.role === 'admin' && await countAdmins(userId) === 0) {
                res.status(400).json({ success: false, message: 'Cannot delete the last admin' });
                return;
            }

            // Order matters (R20 D59): scrub the audit log BEFORE the account
            // is removed. If the scrub succeeds and a later step fails, the
            // admin simply retries (the scrub is idempotent); the reverse
            // order could leave an undeletable identifier behind forever.
            await audit.record({
                type: 'user_deleted', result: 'success', ...auditContext(req), subjectUserId: userId,
            });
            let scrubbed = { deleted: 0, anonymized: 0 };
            if (audit.enabled) {
                scrubbed = await scrubUserAuditLogs(auditLogs, userId);
            }
            await audit.record({
                type: 'audit_scrubbed', result: 'success', ...auditContext(req), subjectUserId: null,
                detail: scrubbed,
            });

            await destroyUserSessions(sessions, userId);
            await configurations.deleteMany({ ownerId: userId });
            await users.deleteOne({ _id: userId });
            sse.broadcast({ ownerId: String(userId) });
            res.json({ success: true, message: `User "${user.username}" deleted` });
        } catch (error) {
            sendError(res, error, 'DELETE /api/admin/users/:id');
        }
    });

    router.get('/configurations', async (_req, res) => {
        try {
            const docs = await configurations.find({}).sort({ updatedAt: -1 }).toArray();
            const ownerIds = [...new Set(docs.map((doc) => String(doc.ownerId)).filter(Boolean))]
                .map(parseObjectId)
                .filter(Boolean);
            const owners = ownerIds.length
                ? await users.find({ _id: { $in: ownerIds } }).toArray()
                : [];
            const usernames = Object.fromEntries(owners.map((owner) => [String(owner._id), owner.username]));
            res.json({
                success: true,
                data: docs.map((doc) => toAdminListItem(doc, usernames[String(doc.ownerId)])),
            });
        } catch (error) {
            sendError(res, error, 'GET /api/admin/configurations');
        }
    });

    router.delete('/configurations/:id', async (req, res) => {
        try {
            const configId = parseObjectId(req.params.id);
            if (!configId) {
                res.status(400).json({ success: false, message: 'Invalid configuration id' });
                return;
            }
            const existing = await configurations.findOne({ _id: configId });
            if (!existing) {
                res.status(404).json({ success: false, message: 'Configuration not found' });
                return;
            }
            await configurations.deleteOne({ _id: configId });
            sse.broadcast({
                ownerId: String(existing.ownerId),
                name: existing.name,
                shareToken: existing.shareEnabled ? existing.shareToken : undefined,
            });
            // The event names the template by id only — never its title.
            await audit.record({
                type: 'template_deleted_by_admin',
                result: 'success',
                ...auditContext(req),
                subjectUserId: parseObjectId(existing.ownerId),
                detail: { templateId: configId },
            });
            res.json({
                success: true,
                message: `Configuration "${existing.name}" deleted`,
            });
        } catch (error) {
            sendError(res, error, 'DELETE /api/admin/configurations/:id');
        }
    });

    // Administrator recovery path for an account that lost its authenticator
    // and used up its recovery codes (R20 D57). Not for one's own account:
    // re-binding in settings covers that. Signs the account out everywhere.
    router.post('/totp/reset', async (req, res) => {
        try {
            const userId = parseObjectId(req.body?.userId);
            if (!userId) {
                res.status(400).json({ success: false, message: 'Invalid user id' });
                return;
            }
            if (String(userId) === String(req.user.id)) {
                res.status(400).json({
                    success: false,
                    message: 'You cannot reset your own account; rebind instead',
                });
                return;
            }
            const user = await users.findOne({ _id: userId });
            if (!user) {
                res.status(404).json({ success: false, message: 'User not found' });
                return;
            }
            if (user.totp?.enabled !== true) {
                res.status(400).json({
                    success: false,
                    message: 'Two-factor authentication is not enabled for this user',
                });
                return;
            }

            await removeTotp(users, sessions, userId);
            await audit.record({
                type: 'totp_reset',
                result: 'success',
                ...auditContext(req),
                subjectUserId: userId,
                detail: { channel: 'admin' },
            });
            res.json({
                success: true,
                message: `Two-factor verification reset for "${user.username}"`,
            });
        } catch (error) {
            sendError(res, error, 'POST /api/admin/totp/reset');
        }
    });

    return router;
}
