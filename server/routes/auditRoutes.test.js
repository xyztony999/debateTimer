import { beforeAll, expect, test } from 'bun:test';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createFakeCollection } from '../test/fakeCollection.js';
import { createAuditRouter } from './audit.js';

// Read side of the audit log: who may read what, filters, pagination and the
// two projections (admin: full detail; own history: sign-in events only with
// masked IPs on failures). Auth is simulated with an x-user header that
// resolves to a seeded account, so the event set stays exactly what the test
// inserts.

const adminId = new ObjectId();
const memberId = new ObjectId();
const goneId = new ObjectId(); // an account that no longer exists
const templateId = new ObjectId();
const T0 = Date.UTC(2026, 10, 1); // 2026-11-01T00:00:00Z

let world;
let server;
let base;

function event(index, overrides = {}) {
    return {
        _id: new ObjectId(),
        type: 'login_succeeded',
        result: 'success',
        at: new Date(T0 + index * 60_000),
        expireAt: new Date(T0 + index * 60_000 + 184 * 24 * 3600_000),
        actorUserId: adminId,
        subjectUserId: adminId,
        ip: '198.51.100.10',
        detail: {},
        ...overrides,
    };
}

const EVENTS = [
    event(0, {}),
    event(1, { actorUserId: memberId, subjectUserId: memberId }),
    event(2, { type: 'login_failed', result: 'failure', actorUserId: null, subjectUserId: memberId, ip: '203.0.113.5', detail: { reason: 'invalid_credentials' } }),
    event(3, { type: 'login_failed', result: 'failure', actorUserId: null, subjectUserId: null, ip: '203.0.113.6', detail: { reason: 'invalid_credentials', attemptedUsername: 'ghost_user' } }),
    event(4, { type: 'role_changed', subjectUserId: memberId, ip: '198.51.100.11', detail: { from: 'user', to: 'admin' } }),
    event(5, { type: 'totp_failed', result: 'failure', actorUserId: null, subjectUserId: memberId, ip: '203.0.113.7', detail: { method: 'code' } }),
    event(6, { type: 'user_deleted', subjectUserId: null, ip: '198.51.100.12', anonymizedAt: new Date(T0 + 7 * 60_000) }),
    event(7, { type: 'gallery_published', subjectUserId: memberId, ip: null, detail: { templateId } }),
    event(8, { actorUserId: goneId, subjectUserId: goneId }), // account since deleted, not yet re-scrubbed
    event(9, { type: 'privacy_consented', subjectUserId: adminId, ip: '198.51.100.13', detail: { version: '2026.11.1', channel: 'login_gate' } }),
];

beforeAll(async () => {
    world = {
        users: createFakeCollection([
            { _id: adminId, username: 'auditor', role: 'admin' },
            { _id: memberId, username: 'watched', role: 'user' },
        ]),
        auditLogs: createFakeCollection(EVENTS),
    };
    const load = (req) => {
        const id = req.headers['x-user'];
        const doc = id ? world.users.raw(id) : null;
        if (!doc) {
            return false;
        }
        req.authUser = doc;
        req.user = { id: String(doc._id), username: doc.username, role: doc.role };
        return true;
    };
    const requireAuth = (req, res, next) => (load(req) ? next() : res.status(401).json({ success: false, message: 'Authentication required' }));
    const requireAdmin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ success: false, message: 'Admin access required' }));

    const app = express();
    app.use('/api/audit', createAuditRouter({ auditLogs: world.auditLogs, users: world.users, requireAuth, requireAdmin }));
    server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

async function list(query = '', user) {
    const res = await fetch(`${base}/api/audit/logs/list${query}`, { headers: user ? { 'x-user': user } : {} });
    return { status: res.status, body: await res.json() };
}

async function logins(query = '', user) {
    const res = await fetch(`${base}/api/audit/logins/list${query}`, { headers: user ? { 'x-user': user } : {} });
    return { status: res.status, body: await res.json() };
}

const ADMIN = String(adminId);
const MEMBER = String(memberId);

test('both read endpoints refuse anonymous callers', async () => {
    expect((await list()).status).toBe(401);
    expect((await logins()).status).toBe(401);
});

test('the full log is for administrators only', async () => {
    expect((await list('', MEMBER)).status).toBe(403);
});

test('admin list: newest first, paginated, usernames resolved, no expireAt', async () => {
    const { status, body } = await list('', ADMIN);
    expect(status).toBe(200);
    expect(body.data.total).toBe(EVENTS.length);
    expect(body.data.page).toBe(1);
    expect(body.data.pageSize).toBe(20);
    const items = body.data.items;
    expect(items).toHaveLength(EVENTS.length);
    expect(items.map((item) => item.type)).toEqual([...EVENTS].reverse().map((e) => e.type));
    // The newest event first.
    expect(items[0]).toEqual({
        id: expect.any(String),
        type: 'privacy_consented',
        result: 'success',
        at: T0 + 9 * 60_000,
        actor: { id: ADMIN, username: 'auditor' },
        subject: { id: ADMIN, username: 'auditor' },
        ip: '198.51.100.13',
        detail: { version: '2026.11.1', channel: 'login_gate' },
        anonymized: false,
    });
    for (const item of items) {
        expect(item).not.toHaveProperty('expireAt');
        expect(item).not.toHaveProperty('actorUserId');
        expect(item).not.toHaveProperty('subjectUserId');
    }
    // Anonymous actor, unknown account: both null.
    expect(items.find((item) => item.type === 'login_failed' && item.detail.attemptedUsername)).toMatchObject({
        actor: null, subject: null, ip: '203.0.113.6',
    });
    // An account that no longer exists resolves to a null username, id kept.
    expect(items.find((item) => item.actor?.id === String(goneId)).actor).toEqual({ id: String(goneId), username: null });
    // The anonymised deletion record is flagged.
    const deletion = items.find((item) => item.type === 'user_deleted');
    expect(deletion).toMatchObject({ subject: null, anonymized: true, ip: '198.51.100.12' });
    expect(deletion.actor).toEqual({ id: ADMIN, username: 'auditor' });
    // Admins see full IPs, failures included.
    expect(items.find((item) => item.type === 'login_failed' && item.subject?.id === MEMBER).ip).toBe('203.0.113.5');
});

test('admin list: pagination slices the result set and keeps the real total', async () => {
    const first = await list('?pageSize=4', ADMIN);
    expect(first.body.data.total).toBe(EVENTS.length);
    expect(first.body.data.items.map((item) => item.type)).toEqual(['privacy_consented', 'login_succeeded', 'gallery_published', 'user_deleted']);
    const second = await list('?pageSize=4&page=2', ADMIN);
    expect(second.body.data.items.map((item) => item.type)).toEqual(['totp_failed', 'role_changed', 'login_failed', 'login_failed']);
    const beyond = await list('?pageSize=4&page=5', ADMIN);
    expect(beyond.body.data.items).toEqual([]);
    expect(beyond.body.data.total).toBe(EVENTS.length);
});

test('admin list: pageSize is clamped to 1..100 and invalid numbers are refused', async () => {
    expect((await list('?pageSize=500', ADMIN)).body.data.pageSize).toBe(100);
    expect((await list('?pageSize=0', ADMIN)).body.data.pageSize).toBe(1);
    expect((await list('?pageSize=-3', ADMIN)).body.data.pageSize).toBe(1);
    expect((await list('?pageSize=abc', ADMIN)).status).toBe(400);
    expect((await list('?page=1.5', ADMIN)).status).toBe(400);
    expect((await list('?from=abc', ADMIN)).status).toBe(400);
    expect((await list('?from=1&to=y', ADMIN)).status).toBe(400);
});

test('admin list: filter by event type and by result', async () => {
    const failures = await list('?result=failure', ADMIN);
    expect(failures.body.data.total).toBe(3);
    expect(failures.body.data.items.every((item) => item.result === 'failure')).toBe(true);

    const loginFailures = await list('?type=login_failed', ADMIN);
    expect(loginFailures.body.data.total).toBe(2);
    expect(loginFailures.body.data.items.every((item) => item.type === 'login_failed')).toBe(true);

    const both = await list('?type=login_failed&result=success', ADMIN);
    expect(both.body.data).toMatchObject({ total: 0, items: [] });

    expect((await list('?type=page_viewed', ADMIN)).status).toBe(400);
    expect((await list('?result=maybe', ADMIN)).status).toBe(400);
});

test('admin list: time range is start-inclusive and end-exclusive; an empty range is refused', async () => {
    // Events 2..5 minutes after T0 → indices 2, 3, 4, 5.
    const ranged = await list(`?from=${T0 + 2 * 60_000}&to=${T0 + 6 * 60_000}`, ADMIN);
    expect(ranged.body.data.items.map((item) => item.at - T0)).toEqual([5, 4, 3, 2].map((m) => m * 60_000));
    const fromOnly = await list(`?from=${T0 + 8 * 60_000}`, ADMIN);
    expect(fromOnly.body.data.total).toBe(2);
    const toOnly = await list(`?to=${T0 + 2 * 60_000}`, ADMIN);
    expect(toOnly.body.data.total).toBe(2);
    expect((await list(`?from=${T0 + 60_000}&to=${T0 + 60_000}`, ADMIN)).status).toBe(400);
    expect((await list(`?from=${T0 + 60_000}&to=${T0}`, ADMIN)).status).toBe(400);
});

test('admin list: username filter matches the actor OR the subject, exactly', async () => {
    const watched = await list('?username=Watched', ADMIN); // normalized like sign-in
    // Events 1, 2, 4, 5, 7 have the member as actor or subject.
    expect(watched.body.data.total).toBe(5);
    for (const item of watched.body.data.items) {
        expect(item.actor?.id === MEMBER || item.subject?.id === MEMBER).toBe(true);
    }
    expect((await list('?username=watch', ADMIN)).body.data.total).toBe(0); // no partial match
    expect((await list('?username=nobody_here', ADMIN)).body.data).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    // Of those, one is a failed sign-in.
    const combined = await list('?username=watched&type=login_failed', ADMIN);
    expect(combined.body.data.total).toBe(1);
});

test('the full log is never filtered by IP', async () => {
    const res = await list('?ip=203.0.113.5', ADMIN);
    expect(res.body.data.total).toBe(EVENTS.length); // parameter ignored
});

test('own history: only the caller\'s sign-in events, failures with a masked IP', async () => {
    const { status, body } = await logins('', MEMBER);
    expect(status).toBe(200);
    expect(body.data.total).toBe(3); // events 5, 2, 1 concern the member and are sign-in types
    expect(body.data.items.map((item) => [item.type, item.ip])).toEqual([
        ['totp_failed', '203.0.113.*'],
        ['login_failed', '203.0.113.*'],
        ['login_succeeded', '198.51.100.10'],
    ]);
    for (const item of body.data.items) {
        // No account identifiers in the own-history projection.
        expect(item).not.toHaveProperty('actor');
        expect(item).not.toHaveProperty('subject');
        expect(item).not.toHaveProperty('actorUserId');
        expect(item).not.toHaveProperty('subjectUserId');
        expect(item).not.toHaveProperty('expireAt');
    }
    expect(body.data.items[1].detail).toEqual({ reason: 'invalid_credentials' });
});

test('own history: parameters cannot point it at someone else, and non-sign-in events stay hidden', async () => {
    const own = await logins(`?subjectUserId=${ADMIN}&userId=${ADMIN}&type=role_changed`, MEMBER);
    expect(own.body.data.total).toBe(3);
    expect(own.body.data.items.some((item) => item.type === 'role_changed')).toBe(false);
    // An administrator reading "own history" sees only their own sign-ins too.
    const asAdmin = await logins('', ADMIN);
    expect(asAdmin.body.data.items.every((item) => item.ip === '198.51.100.10' || item.ip === null)).toBe(true);
    expect(asAdmin.body.data.items.some((item) => item.type === 'role_changed')).toBe(false);
});

test('own history: pageSize is clamped to 1..50', async () => {
    expect((await logins('?pageSize=500', MEMBER)).body.data.pageSize).toBe(50);
    expect((await logins('?pageSize=2', MEMBER)).body.data.items).toHaveLength(2);
    expect((await logins('?page=x', MEMBER)).status).toBe(400);
});
