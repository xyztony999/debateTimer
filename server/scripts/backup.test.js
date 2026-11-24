import { COLLECTIONS, docsToNdjson, restoreInto, reviveDeep } from './backup.js';
import { createFakeCollection } from '../test/fakeCollection.js';
import { encryptSecret, TOTP_KEY_ENV } from '../lib/totpCrypto.js';
import { toBase32 } from '../lib/totp.js';
import { ObjectId } from 'mongodb';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('COLLECTIONS backs up app_settings but never volatile sessions', () => {
    // The registration toggle lives in app_settings — without it a restore
    // would silently fall back to env. sessions are volatile by design.
    expect(COLLECTIONS).toContain('app_settings');
    expect(COLLECTIONS).not.toContain('sessions');
});

test('COLLECTIONS backs up the audit log and pre-login state stays out (R20)', () => {
    // The security trail must survive a disk failure; a restore re-scrubs
    // deleted accounts (runRestore → scrubOrphanAuditLogs). Second-factor
    // tickets and attempt counters live in process memory, so there is
    // nothing to back up for them — and `users` carries the secret only as
    // ciphertext (see totpCrypto.test.js).
    expect(COLLECTIONS).toContain('audit_logs');
    expect(COLLECTIONS).toEqual(['configurations', 'users', 'match_logs', 'app_settings', 'audit_logs']);
});

test('reviveDeep converts 24-hex owner ids back to ObjectId, leaves data alone', () => {
    const ownerId = '507f1f77bcf86cd799439011';
    const revived = reviveDeep({
        name: 'default',
        ownerId,
        nested: { ownerId, keep: '507f1f77bcf86cd799439011-x' },
        stages: [{ _id: ownerId, label: 'A' }],
        teamNames: { aff: '0123456789abcdef01234567' },
    });
    expect(revived.ownerId).toBeInstanceOf(ObjectId);
    expect(revived.nested.ownerId).toBeInstanceOf(ObjectId);
    expect(revived.stages[0]._id).toBeInstanceOf(ObjectId);
    // Values that merely look like ids (not keys) stay strings — team names win.
    expect(revived.teamNames.aff).toBe('0123456789abcdef01234567');
    expect(revived.nested.keep).toBe('507f1f77bcf86cd799439011-x');
    expect(revived.name).toBe('default');
});

test('docsToNdjson writes one JSON line per document (R20)', () => {
    const ownerId = new ObjectId();
    const text = docsToNdjson([{ _id: ownerId, ownerId }, { _id: 'x', n: 2 }]);
    const lines = text.split('\n');
    expect(lines.filter(Boolean)).toHaveLength(2);
    expect(lines[lines.length - 1]).toBe(''); // trailing newline after the last document
    expect(JSON.parse(lines[0])).toEqual({ _id: ownerId.toHexString(), ownerId: ownerId.toHexString() });
    expect(docsToNdjson([])).toBe('');
});

test('a backup never carries a two-step secret or the master key in plain text (R20)', () => {
    const savedKey = process.env[TOTP_KEY_ENV];
    const masterKey = randomBytes(32).toString('base64');
    process.env[TOTP_KEY_ENV] = masterKey;
    try {
        const userId = new ObjectId();
        // What the authenticator was shown; the database only ever holds it encrypted.
        const plainSecret = randomBytes(20);
        const user = {
            _id: userId,
            username: 'alice',
            totp: {
                enabled: true,
                ...encryptSecret(userId, plainSecret),
                recoveryCodeHashes: ['a'.repeat(64)],
            },
        };
        const text = docsToNdjson([user]);
        expect(text).toContain('"secretEnc"');
        expect(text).toContain('"authTag"');
        for (const spelling of [toBase32(plainSecret), plainSecret.toString('hex'), plainSecret.toString('base64')]) {
            expect(text).not.toContain(spelling);
        }
        expect(text).not.toContain(masterKey);
    } finally {
        if (savedKey === undefined) {
            delete process.env[TOTP_KEY_ENV];
        } else {
            process.env[TOTP_KEY_ENV] = savedKey;
        }
    }
});

async function withBackupDir(files, run) {
    const dir = await mkdtemp(join(tmpdir(), 'dt-backup-'));
    try {
        for (const [name, content] of Object.entries(files)) {
            await writeFile(join(dir, name), content, 'utf8');
        }
        return await run(dir);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
}

test('restoreInto puts the backup back, with the dates revived that the TTL index and the code rely on (R20)', async () => {
    const liveId = new ObjectId();
    const at = new Date('2026-11-20T10:00:00.000Z');
    const expireAt = new Date(at.getTime() + 184 * 86400000);
    const consentedAt = new Date('2026-11-01T09:00:00.000Z');
    const pendingExpiry = new Date('2026-11-20T10:10:00.000Z');
    const event = {
        _id: new ObjectId(), type: 'login_succeeded', result: 'success', at, expireAt,
        actorUserId: liveId, subjectUserId: liveId, ip: '203.0.113.7', detail: {},
    };
    await withBackupDir({
        'users.ndjson': docsToNdjson([{
            _id: liveId,
            username: 'alice',
            createdAt: 1761978000000,
            privacy: { version: '2026.11.1', consentedAt },
            totp: { pending: { secretEnc: 'cipher-text', expiresAt: pendingExpiry } },
        }]),
        'audit_logs.ndjson': docsToNdjson([event]),
    }, async (dir) => {
        const collections = {
            users: createFakeCollection([{ _id: 'stale-user', username: 'stale' }]),
            audit_logs: createFakeCollection([{ _id: 'stale-event', type: 'stale', subjectUserId: 'not-an-id' }]),
            configurations: createFakeCollection([{ _id: 'kept-template' }]),
        };
        const db = { collection: (name) => collections[name] };

        const { scrubbed } = await restoreInto(db, dir);

        expect(scrubbed).toBe(0);
        // What the backup holds replaces what was there; a collection without
        // a backup file is left alone.
        expect((await collections.users.find({}).toArray()).map((doc) => doc.username)).toEqual(['alice']);
        expect(await collections.configurations.find({}).toArray()).toHaveLength(1);

        const user = await collections.users.findOne({ username: 'alice' });
        expect(user._id).toBeInstanceOf(ObjectId);
        expect(user.createdAt).toBe(1761978000000); // a number stays a number
        expect(user.privacy.consentedAt).toBeInstanceOf(Date);
        expect(user.privacy.consentedAt.getTime()).toBe(consentedAt.getTime());
        expect(user.totp.pending.expiresAt).toBeInstanceOf(Date);

        const restored = await collections.audit_logs.find({}).toArray();
        expect(restored).toHaveLength(1);
        expect(restored[0]._id).toBeInstanceOf(ObjectId);
        // As BSON dates again: the TTL index removes a document by a date and
        // ignores text, so these decide whether the restored events ever expire.
        expect(restored[0].at).toBeInstanceOf(Date);
        expect(restored[0].at.getTime()).toBe(at.getTime());
        expect(restored[0].expireAt).toBeInstanceOf(Date);
        expect(restored[0].expireAt.getTime()).toBe(expireAt.getTime());
        expect(restored[0].actorUserId).toBeInstanceOf(ObjectId);
        expect(restored[0].subjectUserId).toBeInstanceOf(ObjectId);
        expect(restored[0].ip).toBe('203.0.113.7');
    });
});

test('restoreInto scrubs the audit log of an account deleted before the backup was taken (R20)', async () => {
    const liveId = new ObjectId();
    const goneId = new ObjectId();
    const at = new Date('2026-11-20T10:00:00.000Z');
    const expireAt = new Date(at.getTime() + 184 * 86400000);
    const event = (fields) => ({ _id: new ObjectId(), result: 'success', at, expireAt, detail: {}, ...fields });
    await withBackupDir({
        'users.ndjson': docsToNdjson([{ _id: liveId, username: 'alice' }]),
        'audit_logs.ndjson': docsToNdjson([
            event({ type: 'login_failed', result: 'failure', actorUserId: null, subjectUserId: goneId, ip: '198.51.100.9' }),
            event({
                type: 'role_changed', actorUserId: goneId, subjectUserId: liveId, ip: '198.51.100.9',
                detail: { from: 'user', to: 'admin' },
            }),
            event({ type: 'login_succeeded', actorUserId: liveId, subjectUserId: liveId, ip: '203.0.113.7' }),
        ]),
    }, async (dir) => {
        const auditLogs = createFakeCollection();
        const users = createFakeCollection();
        const db = { collection: (name) => ({ audit_logs: auditLogs, users })[name] };

        const { scrubbed } = await restoreInto(db, dir);

        expect(scrubbed).toBe(1);
        const types = (await auditLogs.find({}).toArray()).map((doc) => doc.type).sort();
        // The deleted account's own sign-in event is gone. What it did to
        // someone else stays — that is the other account's record — minus its
        // id and its IP.
        expect(types).toEqual(['login_succeeded', 'role_changed']);
        const kept = await auditLogs.findOne({ type: 'role_changed' });
        expect(kept.actorUserId).toBeNull();
        expect(kept.ip).toBeNull();
        expect(kept.subjectUserId.equals(liveId)).toBe(true);
        expect(kept.anonymizedAt).toBeInstanceOf(Date);
        const own = await auditLogs.findOne({ type: 'login_succeeded' });
        expect(own.ip).toBe('203.0.113.7');
    });
});
