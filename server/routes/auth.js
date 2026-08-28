import { Router } from 'express';
import {
    hashPassword,
    normalizeUsername,
    validatePassword,
    validateUsername,
    verifyPassword,
} from '../lib/password.js';
import {
    isRegistrationOpen,
    parseAllowRegistration,
    publicUser,
} from '../lib/authPolicy.js';
import { migrateLegacyConfigurations } from '../lib/migrateConfigurations.js';
import {
    createSession,
    destroySession,
    getCookieOptions,
    SESSION_COOKIE_NAME,
} from '../lib/session.js';

export function createAuthRouter({ users, sessions, configurations }) {
    const router = Router();

    async function registrationState() {
        const userCount = await users.countDocuments();
        return {
            hasUsers: userCount > 0,
            registrationOpen: isRegistrationOpen(
                userCount,
                parseAllowRegistration(process.env.ALLOW_REGISTRATION),
            ),
        };
    }

    router.get('/status', async (_req, res) => {
        try {
            res.json({ success: true, data: await registrationState() });
        } catch (error) {
            console.error('GET /api/auth/status', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/register', async (req, res) => {
        try {
            const state = await registrationState();
            if (!state.registrationOpen) {
                res.status(403).json({ success: false, message: 'Registration is closed' });
                return;
            }

            const username = normalizeUsername(req.body?.username);
            const password = req.body?.password;
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

            const isFirstUser = !state.hasUsers;
            const now = Date.now();
            const result = await users.insertOne({
                username,
                passwordHash: await hashPassword(password),
                role: isFirstUser ? 'admin' : 'user',
                disabled: false,
                createdAt: now,
            });

            if (isFirstUser && configurations) {
                const migrated = await migrateLegacyConfigurations(configurations, users);
                if (migrated.migrated) {
                    console.log(`Migrated ${migrated.migrated} legacy configuration(s) to first admin`);
                }
            }

            const user = await users.findOne({ _id: result.insertedId });
            const token = await createSession(sessions, user._id);
            res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
            res.status(201).json({ success: true, data: publicUser(user) });
        } catch (error) {
            console.error('POST /api/auth/register', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/login', async (req, res) => {
        try {
            const username = normalizeUsername(req.body?.username);
            const password = req.body?.password;
            const user = await users.findOne({ username });
            if (!user || !(await verifyPassword(password, user.passwordHash))) {
                res.status(401).json({ success: false, message: 'Invalid username or password' });
                return;
            }
            if (user.disabled) {
                res.status(403).json({ success: false, message: 'Account is disabled' });
                return;
            }

            const token = await createSession(sessions, user._id);
            res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
            res.json({ success: true, data: publicUser(user) });
        } catch (error) {
            console.error('POST /api/auth/login', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/logout', async (req, res) => {
        try {
            await destroySession(sessions, req.cookies?.[SESSION_COOKIE_NAME]);
            res.clearCookie(SESSION_COOKIE_NAME, { ...getCookieOptions(), maxAge: 0 });
            res.json({ success: true });
        } catch (error) {
            console.error('POST /api/auth/logout', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/me', async (req, res) => {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }
            res.json({ success: true, data: req.user });
        } catch (error) {
            console.error('GET /api/auth/me', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}
