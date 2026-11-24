import { afterEach, beforeEach, expect, test } from 'bun:test';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createFakeCollection } from '../test/fakeCollection.js';
import { hashRecoveryCode } from '../lib/totp.js';
import { encryptSecret } from '../lib/totpCrypto.js';
import { hashSessionToken } from '../lib/session.js';
import { PRIVACY_NOTICE_VERSION } from '../lib/privacyNotices.js';
import { createAdminRouter } from './admin.js';
import { createConfigurationsRouter } from './configurations.js';
import { createGalleryRouter } from './gallery.js';

// What the governance endpoints leave behind in the audit log (R20 D-01 PRD
// FR-7), the "scrub before delete" order with its retry behaviour (FR-4),
// and the administrator two-factor reset (FR-6). Auth is simulated with a
// header that resolves to the acting administrator's document, so consent
// state (which decides whether IPs are recorded) is under the test's control.

const bossId = new ObjectId();
const templateId = new ObjectId();
const TOTP_KEY = Buffer.alloc(32, 3).toString('base64');
let savedKey;

beforeEach(() => {
    savedKey = process.env.TOTP_SECRET_KEY;
    process.env.TOTP_SECRET_KEY = TOTP_KEY;
});

afterEach(() => {
    if (savedKey === undefined) {
        delete process.env.TOTP_SECRET_KEY;
    } else {
        process.env.TOTP_SECRET_KEY = savedKey;
    }
});

async function start() {
    const world = {
        users: createFakeCollection([{
            _id: bossId, username: 'boss', role: 'admin', disabled: false, createdAt: 1,
            passwordHash: 'x', privacy: { version: PRIVACY_NOTICE_VERSION, consentedAt: new Date() },
        }]),
        sessions: createFakeCollection(),
        configurations: createFakeCollection(),
        appSettings: createFakeCollection(),
        auditLogs: createFakeCollection(),
    };
    const broadcasts = [];
    const sse = { broadcast: (payload) => broadcasts.push(payload) };
    const asBoss = (req, _res, next) => {
        if (req.headers['x-anon']) {
            return;
        }
        req.authUser = world.users.raw(bossId);
        req.user = { id: String(bossId), username: 'boss', role: req.headers['x-role'] || 'admin' };
        next();
    };
    const requireAuth = (req, res, next) => {
        asBoss(req, res, next);
        if (!req.user) {
            res.status(401).json({ success: false, message: 'Authentication required' });
        }
    };
    const requireAdmin = (req, res, next) => (req.user?.role === 'admin'
        ? next()
        : res.status(403).json({ success: false, message: 'Admin access required' }));

    const app = express();
    app.use(express.json());
    app.use('/api/admin', createAdminRouter({
        users: world.users, sessions: world.sessions, configurations: world.configurations,
        appSettings: world.appSettings, sse, requireAuth, requireAdmin, auditLogs: world.auditLogs,
    }));
    // S-03 endpoints whose state change is audited: publish (owner) and takedown (admin).
    app.use('/api/configurations', createConfigurationsRouter({
        configurations: world.configurations, sse, requireAuth, timerSessions: {}, auditLogs: world.auditLogs,
    }));
    app.use('/api/gallery', createGalleryRouter({
        configurations: world.configurations, requireAuth, requireAdmin, auditLogs: world.auditLogs,
    }));
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    const call = (method, path, body, headers = {}) => fetch(`${base}${path}`, {
        method,
        headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const trail = async () => (await world.auditLogs.find({}).sort({ at: 1, _id: 1 }).toArray());
    const types = async () => (await trail()).map((event) => event.type);

    async function seedUser({ username, role = 'user', totp = false, sessions = 0 }) {
        const id = new ObjectId();
        const doc = {
            _id: id, username, role, disabled: false, createdAt: Date.now(),
            passwordHash: 'not-a-real-hash',
        };
        if (totp) {
            doc.totp = {
                enabled: true, ...encryptSecret(id, Buffer.alloc(20, 1)), boundAt: new Date(),
                recoveryCodeHashes: [hashRecoveryCode('ABCDEFGHI0')],
            };
        }
        await world.users.insertOne(doc);
        for (let index = 0; index < sessions; index += 1) {
            await world.sessions.insertOne({
                tokenHash: hashSessionToken(`${username}-device-${index}`), userId: id,
                createdAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000),
            });
        }
        return id;
    }

    return {
        world, call, trail, types, seedUser, broadcasts,
        stop: () => server.close(),
    };
}

// ------------------------------------------------------------------- users

test('user list reports two-factor status as a boolean and nothing more', async () => {
    const w = await start();
    try {
        const plain = await w.seedUser({ username: 'plain' });
        const enrolled = await w.seedUser({ username: 'enrolled', totp: true });
        const res = await w.call('GET', '/api/admin/users');
        expect(res.status).toBe(200);
        const { data } = await res.json();
        const byId = Object.fromEntries(data.map((row) => [row.id, row]));
        expect(byId[String(plain)]).toEqual({
            id: String(plain), username: 'plain', role: 'user', disabled: false,
            createdAt: expect.any(Number), totpEnabled: false,
        });
        expect(byId[String(enrolled)].totpEnabled).toBe(true);
        // The secret envelope, recovery hashes and consent record never leave.
        expect(JSON.stringify(data)).not.toContain('secretEnc');
        expect(JSON.stringify(data)).not.toContain('recoveryCodeHashes');
        expect(JSON.stringify(data)).not.toContain('privacy');
    } finally {
        w.stop();
    }
});

test('creating an account is recorded, without the password', async () => {
    const w = await start();
    try {
        const res = await w.call('POST', '/api/admin/users', { username: 'opened', password: 'password123', role: 'admin' });
        expect(res.status).toBe(201);
        expect(await w.types()).toEqual(['user_created']);
        const created = (await res.json()).data.id;
        const [event] = await w.trail();
        expect(event.actorUserId).toEqual(bossId);
        expect(event.subjectUserId).toEqual(new ObjectId(created));
        // The administrator has consented, so their own IP is kept. Requests in
        // this harness carry no forwarded address, hence the loopback one.
        expect(event.ip).toBe('127.0.0.1');
        expect(event.detail).toEqual({ role: 'admin' });
        expect(JSON.stringify(event)).not.toContain('password123');
        // A duplicate is not a creation.
        const dup = await w.call('POST', '/api/admin/users', { username: 'opened', password: 'password123' });
        expect(dup.status).toBe(409);
        expect(await w.types()).toEqual(['user_created']);
    } finally {
        w.stop();
    }
});

test('PATCH records each fact that actually changed — and nothing for a no-op', async () => {
    const w = await start();
    try {
        const target = await w.seedUser({ username: 'target', sessions: 2 });
        // No-op: same values.
        const noop = await w.call('PATCH', `/api/admin/users/${target}`, { role: 'user', disabled: false });
        expect(noop.status).toBe(200);
        expect(await w.types()).toEqual([]);

        const promote = await w.call('PATCH', `/api/admin/users/${target}`, { role: 'admin' });
        expect(promote.status).toBe(200);
        const disable = await w.call('PATCH', `/api/admin/users/${target}`, { disabled: true });
        expect(disable.status).toBe(200);
        const reset = await w.call('PATCH', `/api/admin/users/${target}`, { password: 'another-pass-1' });

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual(['role_changed', 'status_changed', 'password_reset']);
        expect(trail[0]).toMatchObject({ actorUserId: bossId, subjectUserId: target, detail: { from: 'user', to: 'admin' } });
        expect(trail[1].detail).toEqual({ from: 'enabled', to: 'disabled' });
        expect(trail[2].detail).toEqual({});
        for (const event of trail) {
            expect(JSON.stringify(event)).not.toContain('another-pass-1');
            expect(JSON.stringify(event)).not.toContain('passwordHash');
        }
        // Disabling signs the account out.
        expect(await w.world.sessions.countDocuments({ userId: target })).toBe(0);

        // An invalid id records nothing.
        expect((await w.call('PATCH', '/api/admin/users/not-an-id', { role: 'admin' })).status).toBe(400);
        expect(await w.trail()).toHaveLength(3);
    } finally {
        w.stop();
    }
});

// -------------------------------------------------------- registration switch

test('the registration switch is recorded when its stored value changes, not on a rewrite', async () => {
    const w = await start();
    try {
        const first = await w.call('PUT', '/api/admin/settings/registration', { registrationOpen: true });
        expect(first.status).toBe(200);
        // Same value again: no event.
        await w.call('PUT', '/api/admin/settings/registration', { registrationOpen: true });
        const flipped = await w.call('PUT', '/api/admin/settings/registration', { registrationOpen: false });
        expect(flipped.status).toBe(200);

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual(['registration_setting_changed', 'registration_setting_changed']);
        expect(trail[0].detail).toEqual({ from: null, to: true }); // first write ever
        expect(trail[1].detail).toEqual({ from: true, to: false });
        expect(trail[0]).toMatchObject({ actorUserId: bossId, subjectUserId: null });
    } finally {
        w.stop();
    }
});

// ------------------------------------------------------------------ deletion

test('deleting an account scrubs the audit log first, then removes everything', async () => {
    const w = await start();
    try {
        const victim = await w.seedUser({ username: 'victim', role: 'admin', sessions: 1 });
        const other = await w.seedUser({ username: 'other' });
        // The victim's own history, something it did to someone else, and the admin's own event.
        await w.world.auditLogs.insertMany([
            { type: 'login_succeeded', result: 'success', at: new Date(1), expireAt: new Date(), actorUserId: victim, subjectUserId: victim, ip: '203.0.113.9', detail: {} },
            { type: 'totp_bound', result: 'success', at: new Date(2), expireAt: new Date(), actorUserId: victim, subjectUserId: victim, ip: '203.0.113.9', detail: { channel: 'self', rebind: false, recoveryCodeCount: 10 } },
            { type: 'role_changed', result: 'success', at: new Date(3), expireAt: new Date(), actorUserId: victim, subjectUserId: other, ip: '203.0.113.9', detail: { from: 'user', to: 'admin' } },
            { type: 'login_succeeded', result: 'success', at: new Date(4), expireAt: new Date(), actorUserId: bossId, subjectUserId: bossId, ip: '198.51.100.4', detail: {} },
        ]);
        await w.world.configurations.insertOne({ _id: templateId, ownerId: victim, name: 'The Template', debateStages: {} });

        const res = await w.call('DELETE', `/api/admin/users/${victim}`);
        expect(res.status).toBe(200);

        expect(await w.world.users.countDocuments({ _id: victim })).toBe(0);
        expect(await w.world.sessions.countDocuments({ userId: victim })).toBe(0);
        expect(await w.world.configurations.countDocuments({ ownerId: victim })).toBe(0);
        expect(w.broadcasts).toEqual([{ ownerId: String(victim) }]);

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual([
            'role_changed', 'login_succeeded', 'user_deleted', 'audit_scrubbed',
        ]);
        // Nothing points at the deleted account any more, and its IP is gone.
        for (const event of trail) {
            expect(String(event.actorUserId)).not.toBe(String(victim));
            expect(String(event.subjectUserId)).not.toBe(String(victim));
            if (event.type === 'role_changed') {
                expect(event.ip).toBeNull();
                expect(event.detail).toEqual({ from: 'user', to: 'admin' }); // the fact survives
                expect(event.subjectUserId).toEqual(other); // the OTHER account is kept
            }
        }
        const scrubbed = trail.at(-1);
        expect(scrubbed.detail).toEqual({ deleted: 2, anonymized: 2 });
        expect(scrubbed.subjectUserId).toBeNull();
        // The deletion record survives: who did it and from where stays, whom
        // it was done to does not. (This harness has no forwarded client IP,
        // so the recorded address is the loopback one, never the victim's.)
        const deletion = trail.find((event) => event.type === 'user_deleted');
        expect(deletion.actorUserId).toEqual(bossId);
        expect(deletion.subjectUserId).toBeNull();
        expect(deletion.ip).not.toBe('203.0.113.9');
        expect(deletion.anonymizedAt).toBeInstanceOf(Date);
    } finally {
        w.stop();
    }
});

test('deleting an account is retryable when a later step fails: the log is already scrubbed', async () => {
    const w = await start();
    try {
        const victim = await w.seedUser({ username: 'flaky', sessions: 1 });
        await w.world.auditLogs.insertOne({
            type: 'login_succeeded', result: 'success', at: new Date(1), expireAt: new Date(),
            actorUserId: victim, subjectUserId: victim, ip: '203.0.113.9', detail: {},
        });

        // The step AFTER the scrub blows up once.
        const realDeleteMany = w.world.configurations.deleteMany.bind(w.world.configurations);
        let failures = 1;
        w.world.configurations.deleteMany = async (filter) => {
            if (failures > 0) {
                failures -= 1;
                throw new Error('disk hiccup');
            }
            return realDeleteMany(filter);
        };

        const failed = await w.call('DELETE', `/api/admin/users/${victim}`);
        expect(failed.status).toBe(500);
        // The account still exists (deletion never happened)…
        expect(await w.world.users.countDocuments({ _id: victim })).toBe(1);
        // …but its trace is already gone from the log.
        const afterFailure = await w.trail();
        expect(afterFailure.map((event) => event.type)).toEqual(['user_deleted', 'audit_scrubbed']);
        expect(afterFailure[0].actorUserId).toEqual(bossId);
        expect(afterFailure[0].subjectUserId).toBeNull(); // anonymised, not the account's id
        expect(afterFailure[0].ip).not.toBe('203.0.113.9');
        expect(afterFailure[1].detail).toEqual({ deleted: 1, anonymized: 1 });
        expect(w.broadcasts).toEqual([]);

        // Retrying completes the deletion.
        const retried = await w.call('DELETE', `/api/admin/users/${victim}`);
        expect(retried.status).toBe(200);
        expect(await w.world.users.countDocuments({ _id: victim })).toBe(0);
        expect(w.broadcasts).toEqual([{ ownerId: String(victim) }]);
        for (const event of await w.trail()) {
            expect(String(event.actorUserId)).not.toBe(String(victim));
            expect(String(event.subjectUserId)).not.toBe(String(victim));
        }
    } finally {
        w.stop();
    }
});

test('deleting the last administrator or oneself is refused and records nothing', async () => {
    const w = await start();
    try {
        // The administrator cannot delete their own account.
        const self = await w.call('DELETE', `/api/admin/users/${bossId}`);
        expect(self.status).toBe(400);
        expect((await self.json()).message).toBe('You cannot delete your own account');

        // boss is gone from the database: `second` is now the last administrator.
        const second = await w.seedUser({ username: 'second', role: 'admin' });
        await w.world.users.deleteOne({ _id: bossId });
        const last = await w.call('DELETE', `/api/admin/users/${second}`);
        expect(last.status).toBe(400);
        expect((await last.json()).message).toBe('Cannot delete the last admin');
        expect(await w.world.users.countDocuments({ _id: second })).toBe(1);

        // Refusals never reach the audit log.
        expect(await w.types()).toEqual([]);
        expect(w.broadcasts).toEqual([]);
    } finally {
        w.stop();
    }
});

// ------------------------------------------------------------------ templates

test('deleting a template as administrator is recorded by id, never by title', async () => {
    const w = await start();
    try {
        const owner = await w.seedUser({ username: 'author' });
        await w.world.configurations.insertOne({
            _id: templateId, ownerId: owner, name: 'Secret Title', debateStages: {}, createdAt: 1, updatedAt: 1,
        });
        const res = await w.call('DELETE', `/api/admin/configurations/${templateId}`);
        expect(res.status).toBe(200);
        const [event] = await w.trail();
        expect(event.type).toBe('template_deleted_by_admin');
        expect(event).toMatchObject({ actorUserId: bossId, subjectUserId: owner, detail: { templateId } });
        expect(JSON.stringify(event)).not.toContain('Secret Title');
    } finally {
        w.stop();
    }
});

test('publishing, withdrawing and forced takedown are recorded; same-state requests are not', async () => {
    const w = await start();
    try {
        const owner = await w.seedUser({ username: 'owner' });
        // boss publishes their own template through the owner endpoint.
        await w.world.configurations.insertOne({
            _id: templateId, ownerId: bossId, name: 'Mine', debateStages: {}, createdAt: 1, updatedAt: 1, isPublic: false,
        });
        const other = await w.seedUser({ username: 'someoneelse' });
        const otherTemplate = new ObjectId();
        await w.world.configurations.insertOne({
            _id: otherTemplate, ownerId: other, name: 'Theirs', debateStages: {}, createdAt: 1, updatedAt: 1, isPublic: true,
        });

        // Same state → no event.
        await w.call('POST', '/api/configurations/Mine/visibility', { public: false });
        expect(await w.types()).toEqual([]);

        await w.call('POST', '/api/configurations/Mine/visibility', { public: true });
        await w.call('POST', '/api/configurations/Mine/visibility', { public: true }); // still public → nothing
        await w.call('POST', '/api/configurations/Mine/visibility', { public: false });
        // Forced takedown of a public template; repeating it records nothing new.
        await w.call('POST', `/api/gallery/${otherTemplate}/unpublish`, {});
        await w.call('POST', `/api/gallery/${otherTemplate}/unpublish`, {});

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual(['gallery_published', 'gallery_unpublished', 'gallery_unpublished']);
        expect(trail[0]).toMatchObject({ actorUserId: bossId, subjectUserId: bossId, detail: { templateId } });
        expect(trail[1].detail).toEqual({ templateId, by: 'owner' });
        expect(trail[2]).toMatchObject({ actorUserId: bossId, subjectUserId: other, detail: { templateId: otherTemplate, by: 'admin' } });
        for (const event of trail) {
            expect(JSON.stringify(event)).not.toContain('Theirs');
            expect(JSON.stringify(event)).not.toContain('Mine');
        }
    } finally {
        w.stop();
    }
});

// -------------------------------------------------------- two-factor reset

test('an administrator resets another account\'s two-factor verification; never their own', async () => {
    const w = await start();
    try {
        const member = await w.seedUser({ username: 'locked_out', totp: true, sessions: 2 });
        const plain = await w.seedUser({ username: 'no_2fa' });

        expect((await w.call('POST', '/api/admin/totp/reset', { userId: String(bossId) })).status).toBe(400);
        expect((await w.call('POST', '/api/admin/totp/reset', { userId: 'garbage' })).status).toBe(400);
        expect((await w.call('POST', '/api/admin/totp/reset', { userId: String(new ObjectId()) })).status).toBe(404);
        expect((await w.call('POST', '/api/admin/totp/reset', { userId: String(plain) })).status).toBe(400);
        expect(await w.types()).toEqual([]);

        const res = await w.call('POST', '/api/admin/totp/reset', { userId: String(member) });
        expect(res.status).toBe(200);
        expect((await w.world.users.raw(member)).totp).toBeUndefined();
        expect(await w.world.sessions.countDocuments({ userId: member })).toBe(0);
        const [event] = await w.trail();
        expect(event).toMatchObject({ type: 'totp_reset', actorUserId: bossId, subjectUserId: member, detail: { channel: 'admin' } });

        // Nothing left to reset.
        expect((await w.call('POST', '/api/admin/totp/reset', { userId: String(member) })).status).toBe(400);
    } finally {
        w.stop();
    }
});
