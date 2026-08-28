import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'dt_session';
export const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS) || 30 * 24 * 60 * 60 * 1000;

export function generateSessionToken() {
    return randomBytes(32).toString('hex');
}

export function hashSessionToken(token) {
    return createHash('sha256').update(String(token)).digest('hex');
}

export function getCookieOptions() {
    const sameSiteRaw = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
    const sameSite = sameSiteRaw === 'none' || sameSiteRaw === 'strict' ? sameSiteRaw : 'lax';
    const secure = process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === 'true'
        : process.env.NODE_ENV === 'production' || sameSite === 'none';

    return {
        httpOnly: true,
        secure,
        sameSite,
        maxAge: SESSION_TTL_MS,
        path: '/',
    };
}

export async function createSession(sessions, userId) {
    const token = generateSessionToken();
    const now = new Date();
    await sessions.insertOne({
        tokenHash: hashSessionToken(token),
        userId,
        createdAt: now,
        expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    });
    return token;
}

export async function destroySession(sessions, token) {
    if (!token) {
        return;
    }
    await sessions.deleteOne({ tokenHash: hashSessionToken(token) });
}

export async function destroyUserSessions(sessions, userId) {
    await sessions.deleteMany({ userId });
}
