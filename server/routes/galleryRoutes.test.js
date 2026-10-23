import { afterAll, beforeAll, expect, test } from 'bun:test';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createGalleryRouter } from './gallery.js';
import { createConfigurationsRouter } from './configurations.js';
import { createSseHub } from '../lib/sseHub.js';
import { createTimerSessionRegistry } from '../lib/timerSessions.js';

const OWNER_ID = '111111111111111111111111';

function fakeConfigs() {
    const docs = new Map();
    return {
        docs,
        async findOne(query, { projection } = {}) {
            let doc = null;
            if (query._id) {
                doc = docs.get(String(query._id)) || null;
            } else if (query.ownerId && query.name) {
                doc = [...docs.values()].find(
                    (d) => String(d.ownerId) === String(query.ownerId) && d.name === query.name,
                ) || null;
            }
            if (!doc) return null;
            if (query.isPublic === true && !doc.isPublic) return null;
            if (projection) {
                const picked = { ...doc };
                for (const key of Object.keys(projection)) {
                    if (projection[key] === 0) delete picked[key];
                }
                return picked;
            }
            return doc;
        },
        find(query, { projection } = {}) {
            let all = [...docs.values()].filter((doc) => {
                if (query.isPublic === true && !doc.isPublic) return false;
                if (query.updatedAt?.$lt && !(doc.updatedAt < query.updatedAt.$lt)) return false;
                if (query.name?.$regex) {
                    try {
                        if (!new RegExp(query.name.$regex, query.name.$options || '').test(doc.name)) return false;
                    } catch {
                        return false;
                    }
                }
                return true;
            });
            if (projection) {
                all = all.map((doc) => {
                    const picked = {};
                    for (const key of Object.keys(projection)) {
                        if (projection[key] !== 0) picked[key] = doc[key];
                    }
                    return picked;
                });
            }
            const cursor = {
                sort(spec) {
                    if (spec && spec.galleryCopyCount !== undefined) {
                        all.sort((a, b) => ((b.galleryCopyCount || 0) - (a.galleryCopyCount || 0))
                            || ((b.updatedAt ?? 0) - (a.updatedAt ?? 0)));
                    } else {
                        all.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
                    }
                    return cursor;
                },
                limit() { return cursor; },
                toArray: async () => all,
            };
            return cursor;
        },
        async updateOne(filter, update) {
            for (const [id, doc] of docs.entries()) {
                const matches = (filter._id && String(filter._id) === id)
                    || (filter.ownerId && String(doc.ownerId) === String(filter.ownerId)
                        && filter.name === doc.name);
                if (!matches) continue;
                if (filter.isPublic === true && !doc.isPublic) continue;
                Object.assign(doc, update.$set || {});
                if (update.$inc) {
                    for (const [key, delta] of Object.entries(update.$inc)) {
                        doc[key] = (doc[key] || 0) + delta;
                    }
                }
                return { modifiedCount: 1 };
            }
            return { modifiedCount: 0 };
        },
    };
}

let server;
let base;
let configs;
let publicId;

beforeAll(async () => {
    configs = fakeConfigs();
    const sse = createSseHub();
    const timerSessions = createTimerSessionRegistry({ sse });
    const app = express();
    app.use(express.json());
    app.use('/api/gallery', createGalleryRouter({
        configurations: configs,
        requireAuth: (req, res, next) => {
            if (req.headers['x-test-anon']) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }
            req.user = { id: req.headers['x-test-user'] || OWNER_ID, role: req.headers['x-test-role'] || 'user' };
            next();
        },
        requireAdmin: (req, res, next) => {
            if (req.user.role !== 'admin') {
                res.status(403).json({ success: false, message: 'Admin only' });
                return;
            }
            next();
        },
    }));
    app.use('/api/configurations', createConfigurationsRouter({
        configurations: configs,
        sse,
        requireAuth: (req, res, next) => {
            if (req.headers['x-test-anon']) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }
            req.user = { id: req.headers['x-test-user'] || OWNER_ID, role: req.headers['x-test-role'] || 'user' };
            next();
        },
        timerSessions,
    }));
    server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
    server?.close();
});

async function seedConfig(name, { isPublic }) {
    const id = new ObjectId();
    configs.docs.set(String(id), {
        _id: id,
        ownerId: OWNER_ID,
        name,
        schemaVersion: 2,
        debateStages: { a: 120, b: 60 },
        timerSettings: { a: 'single', b: 'free' },
        stageOrder: ['a', 'b'],
        stageLabels: {},
        stageGrace: {},
        stageAutoAdvance: {},
        teamNames: { aff: 'A', neg: 'B' },
        shareEnabled: true,
        shareToken: 'secret-token',
        isPublic,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    return id;
}

test('gallery lists public templates without owner identity or share token', async () => {
    publicId = await seedConfig('公开赛制', { isPublic: true });
    await seedConfig('私藏赛制', { isPublic: false });

    const list = await fetch(`${base}/api/gallery`).then((r) => r.json());
    expect(list.data.items).toHaveLength(1);
    const item = list.data.items[0];
    expect(item).toMatchObject({ name: '公开赛制', stageCount: 2, totalSeconds: 180 });
    expect(item.modeSummary).toBe('single×1 · free×1');
    expect(Object.keys(item)).not.toContain('ownerId');
    expect(Object.keys(item)).not.toContain('shareToken');

    const detail = await fetch(`${base}/api/gallery/${publicId}`).then((r) => r.json());
    expect(detail.success).toBe(true);
    expect(detail.data.debateStages).toEqual({ a: 120, b: 60 });
    const raw = JSON.stringify(detail);
    expect(raw).not.toContain('secret-token');
    expect(raw).not.toContain('ownerId');
});

test('unpublished templates 404 on detail', async () => {
    const privateId = [...configs.docs.entries()]
        .find(([, doc]) => doc.name === '私藏赛制')[0];
    const res = await fetch(`${base}/api/gallery/${privateId}`);
    expect(res.status).toBe(404);
});

test('visibility endpoint publishes and unpublishes for the owner', async () => {
    const id = await seedConfig('待发布', { isPublic: false });
    const on = await fetch(`${base}/api/configurations/待发布/visibility`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ public: true }),
    }).then((r) => r.json());
    expect(on.data.isPublic).toBe(true);

    const list = await fetch(`${base}/api/gallery`).then((r) => r.json());
    expect(list.data.items.map((i) => i.name)).toContain('待发布');

    const off = await fetch(`${base}/api/configurations/待发布/visibility`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ public: false }),
    }).then((r) => r.json());
    expect(off.data.isPublic).toBe(false);
    expect(String(id)).toBeTruthy();
});

test('unpublish (admin) requires admin role', async () => {
    const asUser = await fetch(`${base}/api/gallery/${publicId}/unpublish`, {
        method: 'POST',
        headers: { 'x-test-role': 'user' },
    });
    expect(asUser.status).toBe(403);

    const asAdmin = await fetch(`${base}/api/gallery/${publicId}/unpublish`, {
        method: 'POST',
        headers: { 'x-test-role': 'admin' },
    }).then((r) => r.json());
    expect(asAdmin.data.unpublished).toBe(true);

    const after = await fetch(`${base}/api/gallery/${publicId}`);
    expect(after.status).toBe(404);
});

test('copy counting: auth required, increments, unseen for unpublished', async () => {
    const id = await seedConfig('计数赛制', { isPublic: true });

    const anonymous = await fetch(`${base}/api/gallery/${id}/copy`, {
        method: 'POST',
        headers: { 'x-test-anon': '1' },
    });
    expect(anonymous.status).toBe(401);

    const first = await fetch(`${base}/api/gallery/${id}/copy`, {
        method: 'POST',
        headers: { 'x-test-user': OWNER_ID },
    }).then((r) => r.json());
    expect(first.success).toBe(true);

    const list = await fetch(`${base}/api/gallery?q=计数`).then((r) => r.json());
    expect(list.data.items).toHaveLength(1);
    expect(list.data.items[0].copies).toBe(1);

    await fetch(`${base}/api/configurations/计数赛制/visibility`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ public: false }),
    });
    const gone = await fetch(`${base}/api/gallery/${id}/copy`, {
        method: 'POST',
        headers: { 'x-test-user': OWNER_ID },
    });
    expect(gone.status).toBe(404);
});

test('search matches names case-insensitively and misses safely', async () => {
    await seedConfig('BP Style Sample', { isPublic: true });
    await seedConfig('奥瑞冈制（样例）', { isPublic: true });

    const hit = await fetch(`${base}/api/gallery?q=bp%20style`).then((r) => r.json());
    expect(hit.data.items.map((i) => i.name)).toContain('BP Style Sample');

    const chinese = await fetch(`${base}/api/gallery?q=%E5%A5%A5%E7%91%9E%E5%86%88`).then((r) => r.json());
    expect(chinese.data.items).toHaveLength(1);

    const regexInjection = await fetch(`${base}/api/gallery?q=..`).then((r) => r.json());
    expect(regexInjection.success).toBe(true);
});

test('sort=copies orders by popularity and creditName shows in list/detail', async () => {
    const hot = await seedConfig('热门赛制', { isPublic: true });
    const cold = await seedConfig('冷门赛制', { isPublic: true });
    for (let i = 0; i < 3; i += 1) {
        await fetch(`${base}/api/gallery/${hot}/copy`, {
            method: 'POST',
            headers: { 'x-test-user': OWNER_ID },
        });
    }

    // Owner opts into a credit name via the visibility endpoint.
    await fetch(`${base}/api/configurations/热门赛制/visibility`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ public: true, creditName: 'UOMDC 组委会' }),
    }).then((r) => r.json());

    const sorted = await fetch(`${base}/api/gallery?sort=copies`).then((r) => r.json());
    expect(sorted.data.items[0].name).toBe('热门赛制');
    expect(sorted.data.items[0].copies).toBeGreaterThanOrEqual(3);
    expect(sorted.data.items[0].creditName).toBe('UOMDC 组委会');
    expect(sorted.data.items.find((i) => i.name === '冷门赛制').copies).toBe(0);

    const detail = await fetch(`${base}/api/gallery/${hot}`).then((r) => r.json());
    expect(detail.data.creditName).toBe('UOMDC 组委会');
    expect(JSON.stringify(detail)).not.toContain('ownerId');
});
