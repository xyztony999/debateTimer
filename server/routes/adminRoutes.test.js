import { afterAll, beforeAll, expect, test } from 'bun:test';
import express from 'express';
import { createAdminRouter } from './admin.js';

// Mount-level tests for the admin registration toggle (GET/PUT
// /api/admin/settings/registration), following the galleryRoutes.test.js
// harness: real router on a real ephemeral server driven with fetch, fake
// collections, and x-test-* headers standing in for real auth. Env keys are
// saved/deleted in beforeAll and restored in afterAll so host env can't leak
// in (the toggle's default is "env unset = closed" — that must hold here).

function fakeUsers() {
    return {
        async countDocuments() {
            return 0;
        },
        async findOne() {
            return null;
        },
    };
}

// Singleton app_settings docs keyed by their string _id, with the upsert
// semantics the PUT handler relies on (insert keeps the filter's _id).
function fakeAppSettings(seed = []) {
    const docs = new Map(seed);
    return {
        docs,
        async findOne(query) {
            return docs.get(String(query._id)) || null;
        },
        async updateOne(filter, update, { upsert } = {}) {
            const key = String(filter._id);
            if (docs.has(key)) {
                Object.assign(docs.get(key), update.$set);
                return { modifiedCount: 1 };
            }
            if (upsert) {
                docs.set(key, { _id: filter._id, ...update.$set });
                return { upsertedId: filter._id };
            }
            return { modifiedCount: 0 };
        },
    };
}

let server;
let base;
let appSettings;
const savedEnv = {};
const ADMIN_ENV_KEYS = ['ALLOW_REGISTRATION'];

function buildApp(appSettingsCollection) {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', createAdminRouter({
        users: fakeUsers(),
        sessions: {},
        configurations: {},
        appSettings: appSettingsCollection,
        sse: { broadcast: () => {} },
        requireAuth: (req, res, next) => {
            if (req.headers['x-test-anon']) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }
            req.user = {
                id: req.headers['x-test-user'] || 'adminid',
                username: req.headers['x-test-username'] || 'admin',
                role: req.headers['x-test-role'] || 'admin',
            };
            next();
        },
        requireAdmin: (req, res, next) => {
            if (req.user.role !== 'admin') {
                res.status(403).json({ success: false, message: 'Admin access required' });
                return;
            }
            next();
        },
    }));
    return app;
}

beforeAll(async () => {
    for (const key of ADMIN_ENV_KEYS) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
    }
    appSettings = fakeAppSettings();
    server = await new Promise((resolve) => {
        const s = buildApp(appSettings).listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
    server?.close();
    for (const key of ADMIN_ENV_KEYS) {
        if (savedEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = savedEnv[key];
        }
    }
});

function getSettings(headers = {}) {
    return fetch(`${base}/api/admin/settings/registration`, { headers });
}

function putSettings(body, headers = {}) {
    return fetch(`${base}/api/admin/settings/registration`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
    });
}

test('settings/registration sits behind the admin guards', async () => {
    const anon = await getSettings({ 'x-test-anon': '1' });
    expect(anon.status).toBe(401);

    const asUser = await putSettings({ registrationOpen: true }, { 'x-test-role': 'user' });
    expect(asUser.status).toBe(403);
});

test('GET falls back to env (closed when unset)', async () => {
    const res = await getSettings().then((r) => r.json());
    expect(res.success).toBe(true);
    expect(res.data).toEqual({
        registrationOpen: false,
        source: 'env',
        envDefault: false,
        updatedAt: null,
        updatedBy: null,
    });
});

test('GET falls back to env (open when ALLOW_REGISTRATION=true)', async () => {
    process.env.ALLOW_REGISTRATION = 'true';
    try {
        const res = await getSettings().then((r) => r.json());
        expect(res.data.registrationOpen).toBe(true);
        expect(res.data.source).toBe('env');
        expect(res.data.envDefault).toBe(true);
    } finally {
        delete process.env.ALLOW_REGISTRATION;
    }
});

test('PUT rejects non-boolean registrationOpen', async () => {
    for (const bad of ['true', 1, null, undefined]) {
        const res = await putSettings({ registrationOpen: bad });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.success).toBe(false);
        expect(body.message).toBe('registrationOpen must be a boolean');
    }
    const missing = await putSettings({});
    expect(missing.status).toBe(400);
});

test('PUT persists the toggle and GET reports the admin source', async () => {
    const put = await putSettings({ registrationOpen: true }, { 'x-test-username': 'boss' });
    expect(put.status).toBe(200);
    const putBody = await put.json();
    expect(putBody.data).toEqual({
        registrationOpen: true,
        source: 'admin',
        envDefault: false,
        updatedAt: expect.any(Number),
        updatedBy: 'boss',
    });

    const doc = appSettings.docs.get('registration');
    expect(doc).toMatchObject({ _id: 'registration', registrationOpen: true, updatedBy: 'boss' });

    const get = await getSettings().then((r) => r.json());
    expect(get.data.registrationOpen).toBe(true);
    expect(get.data.source).toBe('admin');
    expect(get.data.updatedBy).toBe('boss');
});

test('a stored admin value wins over env on GET', async () => {
    process.env.ALLOW_REGISTRATION = 'true';
    try {
        // Doc written closed while env says open — DB must win (fallback
        // semantics pinned: env is only the "never set from the console" default).
        const closed = await putSettings({ registrationOpen: false });
        expect(closed.status).toBe(200);
        const res = await getSettings().then((r) => r.json());
        expect(res.data.registrationOpen).toBe(false);
        expect(res.data.source).toBe('admin');
        expect(res.data.envDefault).toBe(true);
    } finally {
        delete process.env.ALLOW_REGISTRATION;
    }
});
