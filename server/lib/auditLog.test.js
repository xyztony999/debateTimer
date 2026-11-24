import { describe, expect, test } from 'bun:test';
import { ObjectId } from 'mongodb';
import { createFakeCollection } from '../test/fakeCollection.js';
import {
    AUDIT_DETAIL_KEYS,
    AUDIT_EVENT_TYPES,
    AUDIT_RETENTION_DAYS,
    AUDIT_SELF_TYPES,
    AuditShapeError,
    CONSENT,
    buildAuditEvent,
    clientIp,
    consentOf,
    createAuditRecorder,
    ipFor,
    maskIp,
    recordAudit,
    scrubOrphanAuditLogs,
    scrubUserAuditLogs,
    toAuditItem,
    toLoginItem,
} from './auditLog.js';
import { PRIVACY_NOTICE_VERSION } from './privacyNotices.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const alice = new ObjectId();
const bob = new ObjectId();
const admin = new ObjectId();
const request = (ip) => ({ ip });
const consentedDoc = { privacy: { version: PRIVACY_NOTICE_VERSION } };

test('the whitelist covers the 20 agreed event types, each mapped to its allowed detail keys', () => {
    expect([...AUDIT_EVENT_TYPES].sort()).toEqual([...AUDIT_SELF_TYPES, ...[
        'audit_scrubbed', 'gallery_published', 'gallery_unpublished', 'password_reset',
        'privacy_consented', 'registered', 'role_changed', 'status_changed',
        'template_deleted_by_admin', 'totp_bound', 'totp_reset', 'totp_unbound',
        'user_created', 'user_deleted', 'registration_setting_changed',
    ]].sort());
    for (const type of AUDIT_EVENT_TYPES) {
        expect(Array.isArray(AUDIT_DETAIL_KEYS[type])).toBe(true);
    }
    // "Before / after" values exist for exactly three event types.
    const withFromTo = AUDIT_EVENT_TYPES.filter((type) => AUDIT_DETAIL_KEYS[type].includes('from'));
    expect(withFromTo.sort()).toEqual(['registration_setting_changed', 'role_changed', 'status_changed']);
});

test('retention is 184 days, expressed once', () => {
    expect(AUDIT_RETENTION_DAYS).toBe(184);
    const at = new Date('2026-11-24T12:00:00.000Z');
    const event = buildAuditEvent({ type: 'login_succeeded', result: 'success', consent: CONSENT.CONSENTED, now: at });
    expect(event.expireAt.getTime() - event.at.getTime()).toBe(184 * DAY_MS);
    expect(event.expireAt.toISOString()).toBe('2027-05-27T12:00:00.000Z');
});

describe('consentOf / ipFor — the single place that decides whether an IP is kept', () => {
    test('consent is only valid for the current notice version', () => {
        expect(consentOf(consentedDoc)).toBe(CONSENT.CONSENTED);
        expect(consentOf({ privacy: { version: '2000.01.1' } })).toBe(CONSENT.NOT_CONSENTED);
        expect(consentOf({ role: 'admin' })).toBe(CONSENT.NOT_CONSENTED);
        expect(consentOf(undefined)).toBe(CONSENT.NOT_CONSENTED);
    });

    test('anonymous attempts and consented accounts record the IP', () => {
        expect(ipFor(CONSENT.ANONYMOUS_ATTEMPT, request('203.0.113.7'))).toBe('203.0.113.7');
        expect(ipFor(CONSENT.CONSENTED, request('203.0.113.7'))).toBe('203.0.113.7');
    });

    test('an account that has not confirmed the current notice does NOT get its IP recorded', () => {
        expect(ipFor(CONSENT.NOT_CONSENTED, request('203.0.113.7'))).toBeNull();
        expect(ipFor(CONSENT.SYSTEM, request('203.0.113.7'))).toBeNull();
    });
});

test('clientIp normalises IPv4-mapped addresses and tolerates a missing request', () => {
    expect(clientIp(request('::ffff:203.0.113.7'))).toBe('203.0.113.7');
    expect(clientIp(request('::FFFF:198.51.100.4'))).toBe('198.51.100.4');
    expect(clientIp(request('2001:db8::1'))).toBe('2001:db8::1');
    expect(clientIp(request(undefined))).toBeNull();
    expect(clientIp(undefined)).toBeNull();
});

test('maskIp hides the identifying tail', () => {
    expect(maskIp('203.0.113.7')).toBe('203.0.113.*');
    expect(maskIp('2001:db8:1234:5678:abcd:efff:12:34')).toBe('2001:db8:1234:5678::/64');
    expect(maskIp('2001:db8::1')).toBe('2001:db8::1'); // too short to mask meaningfully
    expect(maskIp(null)).toBeNull();
    expect(maskIp(undefined)).toBeNull();
});

describe('buildAuditEvent validation', () => {
    test('builds a well-formed document', () => {
        const at = new Date('2026-11-24T12:00:00.000Z');
        const event = buildAuditEvent({
            type: 'login_failed',
            result: 'failure',
            consent: CONSENT.ANONYMOUS_ATTEMPT,
            req: request('::ffff:203.0.113.7'),
            actorUserId: null,
            subjectUserId: alice,
            detail: { reason: 'invalid_credentials', attemptedUsername: 'ghost_user' },
            now: at,
        });
        expect(event).toEqual({
            type: 'login_failed',
            at,
            expireAt: new Date('2027-05-27T12:00:00.000Z'),
            result: 'failure',
            actorUserId: null,
            subjectUserId: alice,
            ip: '203.0.113.7',
            detail: { reason: 'invalid_credentials', attemptedUsername: 'ghost_user' },
        });
    });

    test('rejects event types outside the whitelist', () => {
        expect(() => buildAuditEvent({ type: 'page_viewed', result: 'success', consent: CONSENT.SYSTEM }))
            .toThrow(AuditShapeError);
    });

    test('only login_failed and totp_failed may be failures', () => {
        expect(() => buildAuditEvent({ type: 'login_succeeded', result: 'failure', consent: CONSENT.SYSTEM }))
            .toThrow(AuditShapeError);
        expect(() => buildAuditEvent({ type: 'login_failed', result: 'success', consent: CONSENT.SYSTEM }))
            .toThrow(AuditShapeError);
    });

    test('rejects detail keys that are not whitelisted for the event', () => {
        expect(() => buildAuditEvent({ type: 'login_succeeded', result: 'success', consent: CONSENT.SYSTEM, detail: { password: 'x' } }))
            .toThrow(/detail key "password" is not allowed/);
        expect(() => buildAuditEvent({ type: 'user_deleted', result: 'success', consent: CONSENT.SYSTEM, detail: { username: 'alice' } }))
            .toThrow(/detail key "username"/);
        expect(() => buildAuditEvent({
            type: 'gallery_published', result: 'success', consent: CONSENT.SYSTEM, detail: { templateId: alice, templateName: 'My template' },
        })).toThrow(/templateName/);
    });

    test('the "channel" vocabulary depends on the event: consent channels vs two-factor channels', () => {
        for (const channel of ['register', 'login_gate']) {
            expect(buildAuditEvent({
                type: 'privacy_consented', result: 'success', consent: CONSENT.CONSENTED,
                detail: { version: '2026.11.1', channel },
            }).detail.channel).toBe(channel);
        }
        for (const [type, channel] of [
            ['totp_bound', 'self'], ['totp_bound', 'forced_enrollment'],
            ['totp_unbound', 'self'], ['totp_reset', 'admin'], ['totp_reset', 'cli'],
        ]) {
            expect(buildAuditEvent({ type, result: 'success', consent: CONSENT.SYSTEM, detail: { channel } }).detail.channel)
                .toBe(channel);
        }
        // Crossed vocabularies are refused.
        for (const [type, channel] of [
            ['privacy_consented', 'self'], ['privacy_consented', 'admin'],
            ['totp_reset', 'register'], ['totp_unbound', 'login_gate'],
        ]) {
            expect(() => buildAuditEvent({ type, result: 'success', consent: CONSENT.SYSTEM, detail: { channel } }))
                .toThrow(AuditShapeError);
        }
    });

    test('rejects values outside the agreed vocabularies', () => {
        const bad = [
            { type: 'login_failed', result: 'failure', detail: { reason: 'because' } },
            { type: 'totp_failed', result: 'failure', detail: { method: 'sms' } },
            { type: 'totp_reset', result: 'success', detail: { channel: 'phone_call' } },
            { type: 'registered', result: 'success', detail: { role: 'superadmin' } },
            { type: 'status_changed', result: 'success', detail: { from: 'enabled', to: 'deleted' } },
            { type: 'registration_setting_changed', result: 'success', detail: { from: true, to: 'open' } },
            { type: 'privacy_consented', result: 'success', detail: { version: 'v1\n' } },
            { type: 'recovery_code_used', result: 'success', detail: { remaining: -1 } },
            { type: 'audit_scrubbed', result: 'success', detail: { deleted: 1.5 } },
            { type: 'gallery_unpublished', result: 'success', detail: { templateId: alice, by: 'system' } },
        ];
        for (const { type, result, detail } of bad) {
            expect(() => buildAuditEvent({ type, result, consent: CONSENT.SYSTEM, detail })).toThrow(AuditShapeError);
        }
    });

    test('a typed username is kept only when it is a well-formed username', () => {
        // Something like an e-mail address typed into the username box is not stored.
        expect(() => buildAuditEvent({
            type: 'login_failed', result: 'failure', consent: CONSENT.ANONYMOUS_ATTEMPT,
            detail: { reason: 'invalid_credentials', attemptedUsername: 'someone@example.com' },
        })).toThrow(AuditShapeError);
        expect(() => buildAuditEvent({
            type: 'login_failed', result: 'failure', consent: CONSENT.ANONYMOUS_ATTEMPT, detail: { attemptedUsername: 'ab' },
        })).toThrow(AuditShapeError);
        expect(buildAuditEvent({
            type: 'login_failed', result: 'failure', consent: CONSENT.ANONYMOUS_ATTEMPT, detail: { attemptedUsername: 'somebody' },
        }).detail.attemptedUsername).toBe('somebody');
    });

    test('rejects actor/subject values that are not ObjectIds or null', () => {
        expect(() => buildAuditEvent({ type: 'user_deleted', result: 'success', consent: CONSENT.SYSTEM, actorUserId: 'admin' }))
            .toThrow(AuditShapeError);
        expect(() => buildAuditEvent({ type: 'user_deleted', result: 'success', consent: CONSENT.SYSTEM, subjectUserId: 42 }))
            .toThrow(AuditShapeError);
    });

    test('undefined detail values are dropped; arrays are not accepted as detail', () => {
        const event = buildAuditEvent({
            type: 'login_failed', result: 'failure', consent: CONSENT.SYSTEM, detail: { reason: 'invalid_credentials', attemptedUsername: undefined },
        });
        expect(event.detail).toEqual({ reason: 'invalid_credentials' });
        expect(() => buildAuditEvent({ type: 'user_deleted', result: 'success', consent: CONSENT.SYSTEM, detail: [] })).toThrow(AuditShapeError);
        expect(() => buildAuditEvent({ type: 'user_deleted', result: 'success', consent: CONSENT.SYSTEM, detail: null })).toThrow(AuditShapeError);
    });
});

describe('recordAudit and the recorder', () => {
    test('appends exactly the validated document', async () => {
        const auditLogs = createFakeCollection();
        const doc = await recordAudit(auditLogs, {
            type: 'role_changed', result: 'success', consent: CONSENT.CONSENTED, req: request('198.51.100.4'),
            actorUserId: admin, subjectUserId: bob, detail: { from: 'user', to: 'admin' },
        });
        const stored = auditLogs.raw(doc._id);
        expect(stored).toEqual(doc);
        expect(await auditLogs.countDocuments()).toBe(1);
    });

    test('a failed insert propagates so the caller can fail the request', async () => {
        const broken = { async insertOne() { throw new Error('db down'); } };
        await expect(recordAudit(broken, { type: 'user_deleted', result: 'success', consent: CONSENT.SYSTEM }))
            .rejects.toThrow('db down');
    });

    test('the recorder is a no-op without a collection (isolated harnesses only)', async () => {
        const recorder = createAuditRecorder(undefined);
        expect(recorder.enabled).toBe(false);
        expect(await recorder.record({ type: 'nope', result: 'wrong' })).toBeNull(); // not even validated
        expect(createAuditRecorder(createFakeCollection()).enabled).toBe(true);
    });
});

describe('scrubUserAuditLogs', () => {
    async function seed() {
        const auditLogs = createFakeCollection();
        const events = [
            { type: 'login_succeeded', result: 'success', actorUserId: bob, subjectUserId: bob, ip: '203.0.113.9' },
            { type: 'totp_bound', result: 'success', actorUserId: bob, subjectUserId: bob, ip: '203.0.113.9', detail: { channel: 'self' } },
            { type: 'privacy_consented', result: 'success', actorUserId: bob, subjectUserId: bob, ip: null, detail: { version: 'x', channel: 'login_gate' } },
            // Other people's events that merely concern bob.
            { type: 'role_changed', result: 'success', actorUserId: admin, subjectUserId: bob, ip: '198.51.100.4', detail: { from: 'user', to: 'admin' } },
            { type: 'status_changed', result: 'success', actorUserId: admin, subjectUserId: bob, ip: '198.51.100.4', detail: { from: 'enabled', to: 'disabled' } },
            // Events bob performed on someone else (bob was an admin).
            { type: 'role_changed', result: 'success', actorUserId: bob, subjectUserId: alice, ip: '203.0.113.9', detail: { from: 'user', to: 'admin' } },
            { type: 'gallery_unpublished', result: 'success', actorUserId: bob, subjectUserId: alice, ip: '203.0.113.9', detail: { templateId: new ObjectId(), by: 'admin' } },
            // Unrelated.
            { type: 'login_succeeded', result: 'success', actorUserId: alice, subjectUserId: alice, ip: '192.0.2.1' },
            { type: 'login_succeeded', result: 'success', actorUserId: admin, subjectUserId: admin, ip: '198.51.100.4' },
            // The deletion itself.
            { type: 'user_deleted', result: 'success', actorUserId: admin, subjectUserId: bob, ip: '198.51.100.4' },
        ];
        for (const event of events) {
            await auditLogs.insertOne({ _id: new ObjectId(), at: new Date(), expireAt: new Date(), detail: event.detail ?? {}, ...event });
        }
        return auditLogs;
    }

    test('deletes bob\'s own events, anonymises the rest, keeps the deletion record', async () => {
        const auditLogs = await seed();
        const result = await scrubUserAuditLogs(auditLogs, bob, { now: () => new Date('2026-11-24T00:00:00Z') });
        // Deleted: 5 events with bob as subject other than user_deleted.
        expect(result.deleted).toBe(5);
        // Anonymised: 2 events bob acted out on alice + the user_deleted event.
        expect(result.anonymized).toBe(3);

        const remaining = await auditLogs.find({}).sort({ at: 1 }).toArray();
        expect(remaining).toHaveLength(5);

        const refsBob = remaining.filter((doc) => String(doc.actorUserId) === String(bob) || String(doc.subjectUserId) === String(bob));
        expect(refsBob).toHaveLength(0);

        const byType = Object.fromEntries(remaining.map((doc) => [doc.type, doc]));
        // Unrelated events are untouched, IP included.
        const alices = remaining.filter((doc) => String(doc.actorUserId) === String(alice));
        expect(alices).toHaveLength(1);
        expect(alices[0]).toMatchObject({ subjectUserId: alice, ip: '192.0.2.1' });
        expect(alices[0]).not.toHaveProperty('anonymizedAt');
        // bob acting on alice: identity and bob's IP gone, the fact remains.
        expect(byType.role_changed.actorUserId).toBeNull();
        expect(byType.role_changed.subjectUserId).toEqual(alice);
        expect(byType.role_changed.ip).toBeNull();
        expect(byType.role_changed.detail).toEqual({ from: 'user', to: 'admin' });
        expect(byType.role_changed.anonymizedAt).toEqual(new Date('2026-11-24T00:00:00Z'));
        expect(byType.gallery_unpublished.actorUserId).toBeNull();
        expect(byType.gallery_unpublished.ip).toBeNull();
        // The deletion record survives: who deleted, when, from where — but not whom.
        const deletion = remaining.find((doc) => doc.type === 'user_deleted');
        expect(deletion.actorUserId).toEqual(admin);
        expect(deletion.subjectUserId).toBeNull();
        expect(deletion.ip).toBe('198.51.100.4');
        expect(deletion.anonymizedAt).toBeDefined();
    });

    test('is idempotent — a retried deletion matches nothing the second time', async () => {
        const auditLogs = await seed();
        await scrubUserAuditLogs(auditLogs, bob);
        const again = await scrubUserAuditLogs(auditLogs, bob);
        expect(again).toEqual({ deleted: 0, anonymized: 0 });
        expect(await auditLogs.countDocuments()).toBe(5);
    });

    test('leaves no IP behind anywhere bob was the actor', async () => {
        const auditLogs = await seed();
        await scrubUserAuditLogs(auditLogs, bob);
        const remaining = await auditLogs.find({ ip: '203.0.113.9' }).toArray();
        expect(remaining).toHaveLength(0);
    });
});

describe('scrubOrphanAuditLogs', () => {
    test('re-scrubs accounts that no longer exist and leaves live ones alone', async () => {
        const auditLogs = createFakeCollection();
        const users = createFakeCollection([{ _id: alice, username: 'alice' }]);
        await auditLogs.insertMany([
            { type: 'login_succeeded', result: 'success', at: new Date(), expireAt: new Date(), actorUserId: alice, subjectUserId: alice, ip: '192.0.2.1', detail: {} },
            { type: 'login_succeeded', result: 'success', at: new Date(), expireAt: new Date(), actorUserId: bob, subjectUserId: bob, ip: '203.0.113.9', detail: {} },
            { type: 'audit_scrubbed', result: 'success', at: new Date(), expireAt: new Date(), actorUserId: null, subjectUserId: null, ip: null, detail: { deleted: 1, anonymized: 0 } },
            // Legacy user documents may carry a string _id; ids are compared by value.
            { type: 'login_failed', result: 'failure', at: new Date(), expireAt: new Date(), actorUserId: null, subjectUserId: new ObjectId(), ip: '203.0.113.9', detail: { reason: 'invalid_credentials' } },
        ]);
        const result = await scrubOrphanAuditLogs({ auditLogs, users });
        expect(result.scrubbed).toBe(2);
        const remaining = await auditLogs.find({}).toArray();
        expect(remaining.map((doc) => doc.type).sort()).toEqual(['audit_scrubbed', 'login_succeeded']);
        expect(remaining.find((doc) => doc.type === 'login_succeeded').actorUserId).toEqual(alice);
    });
});

describe('read projections', () => {
    const at = new Date('2026-11-24T12:00:00.000Z');

    test('admin items carry full IP and resolved usernames; expireAt never leaves', () => {
        const doc = {
            _id: new ObjectId(), type: 'role_changed', result: 'success', at, expireAt: new Date(),
            actorUserId: admin, subjectUserId: bob, ip: '198.51.100.4', detail: { from: 'user', to: 'admin' },
        };
        expect(toAuditItem(doc, { [String(admin)]: 'boss' })).toEqual({
            id: String(doc._id),
            type: 'role_changed',
            result: 'success',
            at: at.getTime(),
            actor: { id: String(admin), username: 'boss' },
            subject: { id: String(bob), username: null }, // account gone (or never resolved)
            ip: '198.51.100.4',
            detail: { from: 'user', to: 'admin' },
            anonymized: false,
        });
    });

    test('own history shows the full IP on success and a masked one on failure', () => {
        const base = { _id: new ObjectId(), at, detail: {} };
        expect(toLoginItem({ ...base, type: 'login_succeeded', result: 'success', ip: '203.0.113.7' }).ip).toBe('203.0.113.7');
        expect(toLoginItem({ ...base, type: 'login_failed', result: 'failure', ip: '203.0.113.7' }).ip).toBe('203.0.113.*');
        expect(toLoginItem({ ...base, type: 'totp_failed', result: 'failure', ip: null }).ip).toBeNull();
        expect(toLoginItem({ ...base, type: 'login_succeeded', result: 'success' })).not.toHaveProperty('actorUserId');
        expect(toLoginItem({ ...base, type: 'login_succeeded', result: 'success' })).not.toHaveProperty('subjectUserId');
    });
});
