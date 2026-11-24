import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createFakeCollection } from '../test/fakeCollection.js';
import { hashRecoveryCode } from './totp.js';
import { decryptSecret, encryptSecret, TOTP_KEY_ENV } from './totpCrypto.js';
import {
    activateTotp,
    clearTotp,
    consumeRecoveryCode,
    consumeTotpStep,
    countRecoveryCodes,
    removeTotp,
    setPendingTotp,
} from './totpStore.js';

// Every state change on users.totp is one conditional update. These tests
// pin the conditions: a step is consumed only if newer than the last used
// one, a recovery code only while its hash is still listed, an enrolment
// only while the pending secret is still the confirmed one.

const KEY = randomBytes(32).toString('base64');
const userId = new ObjectId();
let savedKey;

beforeEach(() => {
    savedKey = process.env[TOTP_KEY_ENV];
    process.env[TOTP_KEY_ENV] = KEY;
});

afterEach(() => {
    if (savedKey === undefined) {
        delete process.env[TOTP_KEY_ENV];
    } else {
        process.env[TOTP_KEY_ENV] = savedKey;
    }
});

function userWithTotp(overrides = {}) {
    const secret = randomBytes(20);
    return {
        _id: userId,
        username: 'someone',
        totp: {
            enabled: true,
            ...encryptSecret(userId, secret),
            boundAt: new Date(),
            recoveryCodeHashes: [hashRecoveryCode('ABCDEFGHI0'), hashRecoveryCode('ABCDEFGHI1')],
            ...overrides,
        },
    };
}

test('setPendingTotp stores a pending enrolment without touching an enabled one', async () => {
    const users = createFakeCollection([userWithTotp()]);
    const pending = { ...encryptSecret(userId, randomBytes(20)), expiresAt: new Date(Date.now() + 1000) };
    expect(await setPendingTotp(users, userId, pending)).toBe(true);
    const doc = users.raw(userId);
    expect(doc.totp.pending.secretEnc).toBe(pending.secretEnc);
    expect(doc.totp.enabled).toBe(true); // unchanged
    // Unknown account: nothing to write.
    expect(await setPendingTotp(users, new ObjectId(), pending)).toBe(false);
});

test('activateTotp replaces the whole sub-document only for the confirmed pending secret', async () => {
    const first = { ...encryptSecret(userId, randomBytes(20)), expiresAt: new Date() };
    const users = createFakeCollection([{ _id: userId, username: 'someone', totp: { pending: first } }]);
    // The active document is built from the envelope only — the pending
    // expiry does not carry over (mirrors the route's construction).
    const { expiresAt, ...envelope } = first;
    const active = { enabled: true, ...envelope, boundAt: new Date(), lastUsedStep: 5, recoveryCodeHashes: ['h'] };

    expect(await activateTotp(users, userId, 'some-other-ciphertext', active)).toBe(false);
    expect(users.raw(userId).totp.pending.secretEnc).toBe(first.secretEnc); // untouched
    expect(users.raw(userId).totp.enabled).toBeUndefined();

    expect(await activateTotp(users, userId, first.secretEnc, active)).toBe(true);
    const doc = users.raw(userId).totp;
    expect(doc.enabled).toBe(true);
    expect(doc.lastUsedStep).toBe(5);
    expect(doc).not.toHaveProperty('pending'); // gone with the replacement
    expect(doc.expiresAt).toBeUndefined();
});

describe('consumeTotpStep', () => {
    test('records a step once; the same or an older step never again', async () => {
        const doc = userWithTotp();
        const users = createFakeCollection([doc]);
        const { secretEnc } = doc.totp;

        expect(await consumeTotpStep(users, userId, secretEnc, 1000)).toBe(true);
        expect(users.raw(userId).totp.lastUsedStep).toBe(1000);

        // Replay of the same step, or an older one: refused.
        expect(await consumeTotpStep(users, userId, secretEnc, 1000)).toBe(false);
        expect(await consumeTotpStep(users, userId, secretEnc, 999)).toBe(false);
        // A newer step is fine.
        expect(await consumeTotpStep(users, userId, secretEnc, 1001)).toBe(true);
        expect(users.raw(userId).totp.lastUsedStep).toBe(1001);
    });

    test('refuses when the secret changed underneath (re-binding) or 2FA is off', async () => {
        const doc = userWithTotp();
        const users = createFakeCollection([doc]);
        expect(await consumeTotpStep(users, userId, 'previous-secret', 1000)).toBe(false);
        await users.updateOne({ _id: userId }, { $set: { 'totp.enabled': false } });
        expect(await consumeTotpStep(users, userId, doc.totp.secretEnc, 1000)).toBe(false);
        expect(users.raw(userId).totp).not.toHaveProperty('lastUsedStep');
    });

    test('two concurrent calls for the same step: exactly one wins', async () => {
        const doc = userWithTotp();
        const users = createFakeCollection([doc]);
        const results = await Promise.all([
            consumeTotpStep(users, userId, doc.totp.secretEnc, 2000),
            consumeTotpStep(users, userId, doc.totp.secretEnc, 2000),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
    });
});

describe('consumeRecoveryCode', () => {
    test('each code works exactly once and leaves the others', async () => {
        const users = createFakeCollection([userWithTotp()]);
        expect(countRecoveryCodes(users.raw(userId))).toBe(2);

        expect(await consumeRecoveryCode(users, userId, hashRecoveryCode('ABCDEFGHI0'))).toBe(true);
        expect(users.raw(userId).totp.recoveryCodeHashes).toEqual([hashRecoveryCode('ABCDEFGHI1')]);
        // Same code again, an unknown one, or with 2FA off: refused.
        expect(await consumeRecoveryCode(users, userId, hashRecoveryCode('ABCDEFGHI0'))).toBe(false);
        expect(await consumeRecoveryCode(users, userId, hashRecoveryCode('ZZZZZZZZZZ'))).toBe(false);
        await users.updateOne({ _id: userId }, { $set: { 'totp.enabled': false } });
        expect(await consumeRecoveryCode(users, userId, hashRecoveryCode('ABCDEFGHI1'))).toBe(false);
        expect(users.raw(userId).totp.recoveryCodeHashes).toHaveLength(1);
    });

    test('two concurrent calls with the same code: exactly one wins', async () => {
        const users = createFakeCollection([userWithTotp()]);
        const hash = hashRecoveryCode('ABCDEFGHI0');
        const results = await Promise.all([
            consumeRecoveryCode(users, userId, hash),
            consumeRecoveryCode(users, userId, hash),
        ]);
        expect(results.filter(Boolean)).toHaveLength(1);
    });
});

test('the stored secret decrypts only for its own account', () => {
    const secret = randomBytes(20);
    const envelope = encryptSecret(userId, secret);
    expect(decryptSecret(userId, envelope)).toEqual(secret);
    expect(() => decryptSecret(new ObjectId(), envelope)).toThrow();
});

test('clearTotp removes the sub-document and keeps sessions; removeTotp also signs out', async () => {
    const doc = userWithTotp();
    const sessions = createFakeCollection([
        { tokenHash: 'a', userId, createdAt: new Date(), expiresAt: new Date() },
        { tokenHash: 'b', userId, createdAt: new Date(), expiresAt: new Date() },
        { tokenHash: 'c', userId: new ObjectId(), createdAt: new Date(), expiresAt: new Date() },
    ]);

    const selfDisable = createFakeCollection([doc]);
    expect(await clearTotp(selfDisable, userId)).toBe(true);
    expect(selfDisable.raw(userId)).not.toHaveProperty('totp');
    expect(await clearTotp(selfDisable, userId)).toBe(false); // nothing left to clear
    expect(await sessions.countDocuments({ userId })).toBe(2);

    const reset = createFakeCollection([userWithTotp()]);
    const result = await removeTotp(reset, sessions, userId);
    expect(result).toEqual({ removed: true, sessionsDestroyed: 2 });
    expect(reset.raw(userId)).not.toHaveProperty('totp');
    expect(await sessions.countDocuments({ userId })).toBe(0);
    expect(await sessions.countDocuments()).toBe(1); // somebody else's session is untouched
});
