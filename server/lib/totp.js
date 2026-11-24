/**
 * TOTP (RFC 6238) primitives — pure functions, Node's built-in crypto only.
 *
 * Standard parameters so mainstream authenticator apps work unchanged:
 * 30-second steps, 6 digits, HMAC-SHA1. The HOTP core follows RFC 4226
 * (8-byte big-endian counter, dynamic truncation on the low 31 bits).
 *
 * Replay protection is the caller's job: findMatchingStep only reports a
 * matching step that is strictly greater than the last one already used.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
export const TOTP_WINDOW_STEPS = 1;
export const TOTP_SECRET_BYTES = 20;
export const OTPAUTH_ISSUER = 'Debate Timer';

export const RECOVERY_CODE_COUNT = 10;
export const RECOVERY_CODE_LENGTH = 10;
// 0 / O / 1 / I are left out so a code read off one screen and typed on
// another survives the ambiguous glyphs.
export const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret() {
    return randomBytes(TOTP_SECRET_BYTES);
}

export function toBase32(buffer) {
    const bytes = [...buffer];
    let bits = 0;
    let value = 0;
    let output = '';
    for (const byte of bytes) {
        value = (value << 8) | byte;
        bits += 8;
        while (bits >= 5) {
            output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
            bits -= 5;
        }
    }
    if (bits > 0) {
        output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
    }
    return output;
}

export function currentStep(now = Date.now()) {
    return Math.floor(now / 1000 / TOTP_STEP_SECONDS);
}

/** HOTP: the code for one counter value, zero-padded to `digits`. */
export function hotp(key, counter, digits = TOTP_DIGITS) {
    const message = Buffer.alloc(8);
    message.writeBigUInt64BE(BigInt(counter));
    const digest = createHmac('sha1', key).update(message).digest();
    const offset = digest[digest.length - 1] & 0x0f;
    const binary = ((digest[offset] & 0x7f) << 24)
        | (digest[offset + 1] << 16)
        | (digest[offset + 2] << 8)
        | digest[offset + 3];
    return String(binary % 10 ** digits).padStart(digits, '0');
}

function sameText(a, b) {
    const left = Buffer.from(String(a));
    const right = Buffer.from(String(b));
    return left.length === right.length && timingSafeEqual(left, right);
}

export function isSixDigitCode(raw) {
    return /^\d{6}$/.test(String(raw ?? '').replace(/\s+/g, ''));
}

/**
 * The time step whose code equals `code`, or null. Steps at or below
 * `minStepExclusive` are never accepted, which is what stops a captured code
 * from being replayed inside its own validity window.
 */
export function findMatchingStep(key, code, { now = Date.now(), minStepExclusive = -Infinity } = {}) {
    const normalized = String(code ?? '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized)) {
        return null;
    }
    const step = currentStep(now);
    // Current step first, then the neighbours (clock drift tolerance).
    const candidates = [step];
    for (let offset = 1; offset <= TOTP_WINDOW_STEPS; offset += 1) {
        candidates.push(step + offset, step - offset);
    }
    for (const candidate of candidates) {
        if (candidate <= minStepExclusive) {
            continue;
        }
        if (sameText(hotp(key, candidate), normalized)) {
            return candidate;
        }
    }
    return null;
}

export function buildOtpauthUri(username, secretBase32) {
    // Issuer and account are encoded separately; the ":" between them stays
    // literal, as every mainstream authenticator expects.
    const label = `${encodeURIComponent(OTPAUTH_ISSUER)}:${encodeURIComponent(username)}`;
    const query = [
        ['secret', secretBase32],
        ['issuer', OTPAUTH_ISSUER],
        ['algorithm', 'SHA1'],
        ['digits', String(TOTP_DIGITS)],
        ['period', String(TOTP_STEP_SECONDS)],
    ].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&');
    return `otpauth://totp/${label}?${query}`;
}

export function normalizeRecoveryCode(raw) {
    return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function isValidRecoveryCode(code) {
    return /^[A-Z0-9]{10}$/.test(code);
}

export function formatRecoveryCode(code) {
    return `${code.slice(0, 5)}-${code.slice(5)}`;
}

export function hashRecoveryCode(code) {
    return createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');
}

function randomAlphabetChar(alphabet) {
    // Rejection sampling keeps the distribution uniform (no modulo bias).
    const limit = Math.floor(256 / alphabet.length) * alphabet.length;
    for (;;) {
        const [byte] = randomBytes(1);
        if (byte < limit) {
            return alphabet[byte % alphabet.length];
        }
    }
}

/** Fresh recovery codes, unique within the set, in their normalized form. */
export function generateRecoveryCodes(count = RECOVERY_CODE_COUNT, length = RECOVERY_CODE_LENGTH) {
    const codes = new Set();
    while (codes.size < count) {
        let code = '';
        for (let i = 0; i < length; i += 1) {
            code += randomAlphabetChar(RECOVERY_ALPHABET);
        }
        codes.add(code);
    }
    return [...codes];
}
