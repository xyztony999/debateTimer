import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import {
    decryptSecret,
    encryptSecret,
    isTotpReady,
    parseTotpKey,
    reportTotpKeyStatus,
    TOTP_KEY_ENV,
} from './totpCrypto.js';

const KEY = randomBytes(32).toString('base64');
const OTHER_KEY = randomBytes(32).toString('base64');
const userId = new ObjectId();

const saved = {};

beforeEach(() => {
    saved[TOTP_KEY_ENV] = process.env[TOTP_KEY_ENV];
});

afterEach(() => {
    if (saved[TOTP_KEY_ENV] === undefined) {
        delete process.env[TOTP_KEY_ENV];
    } else {
        process.env[TOTP_KEY_ENV] = saved[TOTP_KEY_ENV];
    }
});

test('parseTotpKey accepts a 32-byte base64 key, strict in length', () => {
    expect(parseTotpKey(KEY)).toEqual(Buffer.from(KEY, 'base64'));
    expect(parseTotpKey(`  ${KEY}  `)).toHaveLength(32);
    // base64url spelling of the same bytes
    expect(parseTotpKey(Buffer.from(KEY, 'base64').toString('base64url'))).toHaveLength(32);
});

test('parseTotpKey rejects anything that is not exactly 32 bytes', () => {
    expect(parseTotpKey(undefined)).toBeNull();
    expect(parseTotpKey('')).toBeNull();
    expect(parseTotpKey('   ')).toBeNull();
    expect(parseTotpKey(12345)).toBeNull();
    expect(parseTotpKey(randomBytes(16).toString('base64'))).toBeNull(); // AES-128 size
    expect(parseTotpKey(randomBytes(24).toString('base64'))).toBeNull(); // AES-192 size
    expect(parseTotpKey(randomBytes(64).toString('hex'))).toBeNull(); // 64 bytes
    expect(parseTotpKey('not base64 at all!')).toBeNull();
    expect(parseTotpKey('truncated-key')).toBeNull();
});

test('isTotpReady follows the environment', () => {
    delete process.env[TOTP_KEY_ENV];
    expect(isTotpReady()).toBe(false);
    process.env[TOTP_KEY_ENV] = KEY;
    expect(isTotpReady()).toBe(true);
    process.env[TOTP_KEY_ENV] = 'too-short';
    expect(isTotpReady()).toBe(false);
});

test('reportTotpKeyStatus is loud but not fatal when the key is missing', () => {
    const lines = [];
    const logger = { error: (line) => lines.push(line) };
    delete process.env[TOTP_KEY_ENV];
    expect(reportTotpKeyStatus(logger)).toBe(false);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain(TOTP_KEY_ENV);
    expect(lines[0]).toContain('randomBytes(32)');

    process.env[TOTP_KEY_ENV] = KEY;
    expect(reportTotpKeyStatus(logger)).toBe(true);
    expect(lines).toHaveLength(1); // nothing logged when configured
});

describe('secret envelope', () => {
    beforeEach(() => {
        process.env[TOTP_KEY_ENV] = KEY;
    });

    test('round-trips for the account it was encrypted for', () => {
        const secret = randomBytes(20);
        const envelope = encryptSecret(userId, secret);
        expect(decryptSecret(userId, envelope)).toEqual(secret);
    });

    test('never stores the secret or the key in plain text', () => {
        const secret = Buffer.from('plain-secret-value');
        const envelope = encryptSecret(userId, secret);
        const serialized = JSON.stringify(envelope);
        expect(serialized).not.toContain(secret.toString());
        expect(serialized).not.toContain(secret.toString('base64'));
        expect(serialized).not.toContain(KEY);
        expect(Object.keys(envelope).sort()).toEqual(['authTag', 'iv', 'secretEnc']);
        // A fresh IV every time: the same secret encrypts differently twice.
        expect(encryptSecret(userId, secret).iv).not.toBe(envelope.iv);
    });

    test('fails to decrypt when copied onto another account (AAD binding)', () => {
        const envelope = encryptSecret(userId, randomBytes(20));
        expect(() => decryptSecret(new ObjectId(), envelope)).toThrow();
    });

    test('fails to decrypt under another key or with a tampered ciphertext', () => {
        const envelope = encryptSecret(userId, randomBytes(20));
        process.env[TOTP_KEY_ENV] = OTHER_KEY;
        expect(() => decryptSecret(userId, envelope)).toThrow();

        process.env[TOTP_KEY_ENV] = KEY;
        const tampered = Buffer.from(envelope.secretEnc, 'base64url');
        tampered[0] ^= 0x01;
        expect(() => decryptSecret(userId, { ...envelope, secretEnc: tampered.toString('base64url') })).toThrow();
        expect(() => decryptSecret(userId, { ...envelope, authTag: Buffer.alloc(16).toString('base64url') })).toThrow();
        expect(() => decryptSecret(userId, { ...envelope, iv: 'AAAA' })).toThrow('Malformed');
    });

    test('refuses to encrypt when no key is configured — no plain-text fallback', () => {
        delete process.env[TOTP_KEY_ENV];
        expect(() => encryptSecret(userId, randomBytes(20))).toThrow(TOTP_KEY_ENV);
        expect(() => decryptSecret(userId, { iv: '', secretEnc: '', authTag: '' })).toThrow(TOTP_KEY_ENV);
    });
});
