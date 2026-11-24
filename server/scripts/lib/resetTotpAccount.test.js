import { beforeEach, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { createFakeCollection } from '../../test/fakeCollection.js';
import { hashRecoveryCode } from '../../lib/totp.js';
import { encryptSecret } from '../../lib/totpCrypto.js';
import { hashSessionToken } from '../../lib/session.js';
import { resetTotpByUsername } from './resetTotpAccount.js';

// The break-glass path for an account that lost its authenticator and used
// up its recovery codes: run on the server, signs the account out
// everywhere, and leaves the same trace as an administrator reset — except
// for the channel and the absence of any IP.

beforeEach(() => {
    process.env.TOTP_SECRET_KEY = randomBytes(32).toString('base64');
});

test('resets an enrolled account, signs it out everywhere, records a CLI reset', async () => {
    const id = new ObjectId();
    const users = createFakeCollection([{
        _id: id, username: 'stranded_admin', role: 'admin', disabled: false, createdAt: 1, // stored normalised, as sign-up does
        totp: {
            enabled: true, ...encryptSecret(id, randomBytes(20)), boundAt: new Date(),
            recoveryCodeHashes: [],
        },
    }]);
    const sessions = createFakeCollection([1, 2].map((n) => ({
        tokenHash: hashSessionToken(`token-${n}`), userId: id, createdAt: new Date(), expiresAt: new Date(),
    })));
    const auditLogs = createFakeCollection();

    // What the operator types is normalised the same way sign-in does.
    const result = await resetTotpByUsername({ users, sessions, auditLogs }, '  STRANDED_ADMIN ');
    expect(result).toMatchObject({ ok: true, username: 'stranded_admin', sessionsDestroyed: 2 });

    expect(users.raw(id).totp).toBeUndefined();
    expect(await sessions.countDocuments({ userId: id })).toBe(0);

    const events = await auditLogs.find({}).toArray();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
        type: 'totp_reset', result: 'success', actorUserId: null, subjectUserId: id,
        ip: null, detail: { channel: 'cli' },
    });
});

test('nothing to reset or nobody by that name: no change, no trace', async () => {
    const plain = new ObjectId();
    const users = createFakeCollection([{ _id: plain, username: 'plain', role: 'user', createdAt: 1 }]);
    const sessions = createFakeCollection();
    const auditLogs = createFakeCollection();

    expect(await resetTotpByUsername({ users, sessions, auditLogs }, 'plain'))
        .toEqual({ ok: false, reason: 'not_enabled', username: 'plain', userId: plain });
    expect(await resetTotpByUsername({ users, sessions, auditLogs }, 'nobody'))
        .toEqual({ ok: false, reason: 'not_found', username: 'nobody' });
    expect(await auditLogs.countDocuments()).toBe(0);
});

test('an administrator reset and a CLI reset produce the same audit shape except the channel', async () => {
    const id = new ObjectId();
    const users = createFakeCollection([{
        _id: id, username: 'whoever', role: 'user', disabled: false, createdAt: 1,
        totp: { enabled: true, ...encryptSecret(id, randomBytes(20)), boundAt: new Date(), recoveryCodeHashes: [hashRecoveryCode('ABCDEFGHI0')] },
    }]);
    const auditLogs = createFakeCollection();
    await resetTotpByUsername({ users, sessions: createFakeCollection(), auditLogs }, 'whoever');
    const [event] = await auditLogs.find({}).toArray();
    expect(Object.keys(event).sort()).toEqual(
        ['_id', 'actorUserId', 'at', 'detail', 'expireAt', 'ip', 'result', 'subjectUserId', 'type'].sort(),
    );
    expect(event.expireAt.getTime() - event.at.getTime()).toBe(184 * 24 * 3600_000);
});
