import bcrypt from 'bcryptjs';

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
const BCRYPT_ROUNDS = 12;

export function normalizeUsername(raw) {
    return String(raw || '').trim().toLowerCase();
}

export function validateUsername(username) {
    if (!USERNAME_RE.test(username)) {
        return 'Username must be 3–32 characters: lowercase letters, numbers, underscore';
    }
    return null;
}

export function validatePassword(password) {
    if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
        return 'Password must be 8–200 characters';
    }
    return null;
}

export async function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
    if (!passwordHash) {
        return false;
    }
    return bcrypt.compare(password, passwordHash);
}
