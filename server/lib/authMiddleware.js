import { hashSessionToken, SESSION_COOKIE_NAME } from './session.js';
import { publicUser } from './authPolicy.js';

export function createAuthMiddleware({ users, sessions }) {
    /**
     * Resolves the session cookie to the full account document and attaches:
     *   req.user             — the public projection (id, username, role)
     *   req.authUser         — the full document, for gates and TOTP (never serialized)
     *   req.sessionTokenHash — identifies the current session
     *   req.sessionCreatedAt — when the current session was created
     */
    async function attachAccountFromRequest(req) {
        const token = req.cookies?.[SESSION_COOKIE_NAME];
        if (!token) {
            return null;
        }

        const tokenHash = hashSessionToken(token);
        const session = await sessions.findOne({
            tokenHash,
            expiresAt: { $gt: new Date() },
        });
        if (!session) {
            return null;
        }

        const user = await users.findOne({ _id: session.userId });
        if (!user || user.disabled) {
            return null;
        }

        req.authUser = user;
        req.sessionTokenHash = tokenHash;
        req.sessionCreatedAt = session.createdAt ?? null;
        req.user = publicUser(user);
        return req.user;
    }

    async function loadUserFromRequest(req) {
        if (req.user) {
            return req.user;
        }
        return attachAccountFromRequest(req);
    }

    async function attachUser(req, _res, next) {
        try {
            const user = await attachAccountFromRequest(req);
            if (!user) {
                req.user = null; // same shape as before R20: "no session" is null
            }
            next();
        } catch (error) {
            next(error);
        }
    }

    async function requireAuth(req, res, next) {
        try {
            if (!req.user) {
                await attachAccountFromRequest(req);
            }
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }
            next();
        } catch (error) {
            next(error);
        }
    }

    function requireAdmin(req, res, next) {
        if (!req.user || req.user.role !== 'admin') {
            res.status(403).json({ success: false, message: 'Admin access required' });
            return;
        }
        next();
    }

    return { attachUser, requireAuth, requireAdmin, loadUserFromRequest };
}
