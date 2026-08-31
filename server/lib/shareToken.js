import { randomBytes } from 'node:crypto';

export function generateShareToken() {
    return randomBytes(18).toString('base64url');
}
