import { afterAll, beforeAll, expect, test } from 'bun:test';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createMatchLogsRouter } from './matchLogs.js';

const OWNER_ID = '111111111111111111111111';
const OTHER_ID = '222222222222222222222222';

function fakeCollection() {
    const docs = new Map();
    let counter = 0;
    return {
        docs,
        async insertOne(doc) {
            counter += 1;
            const id = new ObjectId();
            docs.set(String(id), { ...doc, _id: id });
            return { insertedId: id, count: counter };
        },
        find(query) {
            const all = [...docs.values()].filter((doc) => {
                if (query.ownerId && String(doc.ownerId) !== String(query.ownerId)) return false;
                if (query.savedAt?.$lt && !(doc.savedAt < query.savedAt.$lt)) return false;
                return true;
            });
            all.sort((a, b) => b.savedAt - a.savedAt);
            const cursor = {
                sort() { return cursor; },
                limit() { return cursor; },
                toArray: async () => all,
            };
            return cursor;
        },
        async findOne(query) {
            if (!query._id) return null;
            const doc = docs.get(String(query._id));
            if (!doc) return null;
            if (query.ownerId && String(doc.ownerId) !== String(query.ownerId)) return null;
            return doc;
        },
        async deleteOne(query) {
            return { deletedCount: docs.delete(String(query._id)) ? 1 : 0 };
        },
    };
}

let server;
let base;
let matchLogs;

function startApp(user) {
    const app = express();
    app.use(express.json());
    const requireAuth = (req, _res, next) => {
        req.user = user;
        next();
    };
    app.use('/api/match-logs', createMatchLogsRouter({ matchLogs, requireAuth }));
    return app;
}

beforeAll(async () => {
    matchLogs = fakeCollection();
    const app = startApp({ id: OWNER_ID, role: 'user' });
    server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
    server?.close();
});

function recordPayload(overrides = {}) {
    const now = Date.now();
    return {
        configName: 'default',
        teamNames: { aff: 'A', neg: 'B' },
        startedAt: now - 600_000,
        endedAt: now,
        stages: [{
            stageId: 'aff_c1',
            label: '正方一辩发言',
            mode: 'single',
            plannedSeconds: 180,
            graceSeconds: 0,
            actualAffSeconds: 185,
            actualNegSeconds: 0,
            overrunAff: 1,
            overrunNeg: 0,
            enteredAt: now - 600_000,
            exitedAt: now - 400_000,
        }],
        ...overrides,
    };
}

test('create → list → detail → export → delete lifecycle', async () => {
    const created = await fetch(`${base}/api/match-logs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(recordPayload()),
    }).then((r) => r.json());
    expect(created.success).toBe(true);
    expect(created.data.summary.overrunCount).toBe(1);

    const list = await fetch(`${base}/api/match-logs`).then((r) => r.json());
    expect(list.data.items).toHaveLength(1);
    expect(list.data.items[0]).toMatchObject({ configName: 'default', stageCount: 1, overrunCount: 1 });

    const detail = await fetch(`${base}/api/match-logs/${created.data.id}`).then((r) => r.json());
    expect(detail.data.stages[0].actualAffSeconds).toBe(185);

    const exported = await fetch(`${base}/api/match-logs/${created.data.id}/export`);
    expect(exported.headers.get('content-type')).toContain('application/json');
    expect(exported.headers.get('content-disposition')).toContain('attachment');
    expect(exported.headers.get('x-content-type-options')).toBe('nosniff');

    const deleted = await fetch(`${base}/api/match-logs/${created.data.id}`, { method: 'DELETE' }).then((r) => r.json());
    expect(deleted.data.deleted).toBe(true);

    const gone = await fetch(`${base}/api/match-logs/${created.data.id}`);
    expect(gone.status).toBe(404);
});

test('owner scoping: another user cannot read or delete', async () => {
    const created = await fetch(`${base}/api/match-logs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(recordPayload()),
    }).then((r) => r.json());

    const other = startApp({ id: OTHER_ID, role: 'user' });
    const otherServer = await new Promise((resolve) => {
        const s = other.listen(0, () => resolve(s));
    });
    const otherBase = `http://127.0.0.1:${otherServer.address().port}`;

    const read = await fetch(`${otherBase}/api/match-logs/${created.data.id}`);
    expect(read.status).toBe(404); // scoped query, not a 403 leak
    const del = await fetch(`${otherBase}/api/match-logs/${created.data.id}`, { method: 'DELETE' });
    expect(del.status).toBe(404);

    await new Promise((resolve) => otherServer.close(resolve));

    // cleanup by owner
    await fetch(`${base}/api/match-logs/${created.data.id}`, { method: 'DELETE' });
});

test('admin can read on behalf of an owner but not delete', async () => {
    const created = await fetch(`${base}/api/match-logs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(recordPayload()),
    }).then((r) => r.json());

    const admin = startApp({ id: '333333333333333333333333', role: 'admin' });
    const adminServer = await new Promise((resolve) => {
        const s = admin.listen(0, () => resolve(s));
    });
    const adminBase = `http://127.0.0.1:${adminServer.address().port}`;

    const read = await fetch(`${adminBase}/api/match-logs/${created.data.id}`);
    expect(read.status).toBe(200);

    const del = await fetch(`${adminBase}/api/match-logs/${created.data.id}`, { method: 'DELETE' });
    expect(del.status).toBe(403);

    await new Promise((resolve) => adminServer.close(resolve));
    await fetch(`${base}/api/match-logs/${created.data.id}`, { method: 'DELETE' });
});
