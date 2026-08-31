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
import { publicUser } from '../lib/authPolicy.js';

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
    };
}

export function createAdminRouter({
    users,
    sessions,
    configurations,
    sse,
    requireAuth,
    requireAdmin,
}) {
    const router = Router();
    router.use(requireAuth, requireAdmin);

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
            res.json({
                success: true,
                message: `Configuration "${existing.name}" deleted`,
            });
        } catch (error) {
            sendError(res, error, 'DELETE /api/admin/configurations/:id');
        }
    });

    return router;
}
