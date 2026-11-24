/**
 * AES-256-GCM envelope for the TOTP shared secrets stored on the user doc.
 *
 * The key comes from the TOTP_SECRET_KEY environment variable (base64 of 32
 * random bytes). When it is missing or malformed every operation that needs
 * it throws or reports "not ready" — the secrets are never written in plain
 * text as a fallback. The account id is bound in as associated data, so a
 * ciphertext copied onto another user's document fails to decrypt.
 */
import { createDecipheriv, createCipheriv, randomBytes } from 'node:crypto';

export const TOTP_KEY_ENV = 'TOTP_SECRET_KEY';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

function toBase64url(buffer) {
    return Buffer.from(buffer).toString('base64url');
}

/** Decodes the configured key, or null when it is absent or not 32 bytes. */
export function parseTotpKey(value) {
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim();
    if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(trimmed)) {
        return null;
    }
    const decoded = Buffer.from(trimmed.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (decoded.length !== KEY_BYTES) {
        return null;
    }
    return decoded;
}

export function totpKey() {
    return parseTotpKey(process.env[TOTP_KEY_ENV]);
}

export function isTotpReady() {
    return totpKey() !== null;
}

/** Startup diagnostic: loud, but never fatal — see R20 design note D54. */
export function reportTotpKeyStatus(logger = console) {
    if (isTotpReady()) {
        return true;
    }
    logger.error(
        `${TOTP_KEY_ENV} is not configured or is not a 32-byte base64 key — `
        + 'two-factor verification is DISABLED on this server '
        + '(nothing is stored in plain text). Generate one with: '
        + 'node -e "console.log(require(\'node:crypto\').randomBytes(32).toString(\'base64\'))"',
    );
    return false;
}

function associatedData(userId) {
    return Buffer.from(`totp:${String(userId)}`);
}

/** Encrypts a secret for one account → { iv, secretEnc, authTag } (base64url). */
export function encryptSecret(userId, plaintext) {
    const key = totpKey();
    if (!key) {
        throw new Error(`${TOTP_KEY_ENV} is not configured`);
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(associatedData(userId));
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
        iv: toBase64url(iv),
        secretEnc: toBase64url(encrypted),
        authTag: toBase64url(cipher.getAuthTag()),
    };
}

/** Decrypts an envelope that was encrypted for `userId`. Throws on any mismatch. */
export function decryptSecret(userId, envelope) {
    const key = totpKey();
    if (!key) {
        throw new Error(`${TOTP_KEY_ENV} is not configured`);
    }
    const iv = Buffer.from(envelope.iv, 'base64url');
    const encrypted = Buffer.from(envelope.secretEnc, 'base64url');
    const authTag = Buffer.from(envelope.authTag, 'base64url');
    if (iv.length !== IV_BYTES || authTag.length !== TAG_BYTES) {
        throw new Error('Malformed TOTP secret envelope');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(associatedData(userId));
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
