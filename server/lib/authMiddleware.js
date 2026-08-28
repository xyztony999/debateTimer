import { hashSessionToken, SESSION_COOKIE_NAME } from './session.js';
import { publicUser } from './authPolicy.js';

export function createAuthMiddleware({ users, sessions }) {
    async function loadUserFromRequest(req) {
        const token = req.cookies?.[SESSION_COOKIE_NAME];
        if (!token) {
            return null;
        }

        const session = await sessions.findOne({
            tokenHash: hashSessionToken(token),
            expiresAt: { $gt: new Date() },
        });
        if (!session) {
            return null;
        }

        const user = await users.findOne({ _id: session.userId });
        if (!user || user.disabled) {
            return null;
        }

        return publicUser(user);
    }

    async function requireAuth(req, res, next) {
        try {
            const user = await loadUserFromRequest(req);
            if (!user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }
            req.user = user;
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

    return { requireAuth, requireAdmin, loadUserFromRequest };
}
