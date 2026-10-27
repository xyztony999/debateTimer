import { afterAll, beforeAll, expect, setSystemTime, test } from 'bun:test';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createAuthRouter } from './auth.js';

// Mount-level tests for the credential rate limits (login 20/15min,
// register 10/hour, per IP), following the galleryRoutes.test.js harness:
// fake Mongo collections, real router mounted on a real ephemeral server,
// driven with global fetch. trust proxy 1 mirrors index.js so tests steer
// req.ip via x-forwarded-for. Login probes use a non-existent username, so
// the handler short-circuits to 401 before bcrypt (fast, no hashing).

function fakeUsers(seed = []) {
    const docs = new Map(seed);
    return {
        docs,
        async findOne(query) {
            if (query?.username) {
                return [...docs.values()].find((d) => d.username === query.username) || null;
            }
            if (query?._id) {
                return docs.get(String(query._id)) || null;
            }
            return null;
        },
        async countDocuments() {
            return docs.size;
        },
        async insertOne(doc) {
            const _id = new ObjectId();
            docs.set(String(_id), { ...doc, _id });
            return { insertedId: _id };
        },
    };
}

function fakeSessions() {
    const docs = new Map();
    return {
        async insertOne(doc) {
            docs.set(doc.tokenHash, doc);
        },
        async deleteOne(query) {
            docs.delete(query.tokenHash);
            return { deletedCount: 1 };
        },
    };
}

let server;
let base;
let users;
const savedEnv = {};

const AUTH_ENV_KEYS = [
    'ALLOW_REGISTRATION',
    'AUTH_LOGIN_RATE_MAX',
    'AUTH_LOGIN_RATE_WINDOW_MS',
    'AUTH_REGISTER_RATE_MAX',
    'AUTH_REGISTER_RATE_WINDOW_MS',
];

function buildApp(usersCollection) {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api/auth', createAuthRouter({
        users: usersCollection,
        sessions: fakeSessions(),
        configurations: undefined,
    }));
    return app;
}

function post(path, ip, body) {
    return fetch(`${base}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify(body ?? {}),
    });
}

function postLogin(ip) {
    return post('/api/auth/login', ip, { username: 'ghost_user', password: 'wrong-password' });
}

beforeAll(async () => {
    // Keep the default thresholds deterministic regardless of host env.
    for (const key of AUTH_ENV_KEYS) {
        savedEnv[key] = process.env[key];
        delete process.env[key];
    }

    users = fakeUsers([['seeded', {
        _id: new ObjectId('222222222222222222222222'),
        username: 'seeded_user',
        passwordHash: 'not-a-real-hash',
        role: 'admin',
        disabled: false,
    }]]);

    server = await new Promise((resolve) => {
        const s = buildApp(users).listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
    server?.close();
    for (const key of AUTH_ENV_KEYS) {
        if (savedEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = savedEnv[key];
        }
    }
});

test('login: 20 attempts from one IP answer 401, the 21st gets 429 + Retry-After + JSON body', async () => {
    for (let i = 0; i < 20; i += 1) {
        const res = await postLogin('203.0.113.10');
        expect(res.status).toBe(401);
    }

    const blocked = await postLogin('203.0.113.10');
    expect(blocked.status).toBe(429);
    const retryAfter = blocked.headers.get('retry-after');
    expect(retryAfter).toMatch(/^[1-9][0-9]*$/);
    const body = await blocked.json();
    expect(body.success).toBe(false);
    expect(typeof body.message).toBe('string');
    expect(body.message.length).toBeGreaterThan(0);
});

test('login: another IP keeps its own bucket', async () => {
    const res = await postLogin('198.51.100.5');
    expect(res.status).toBe(401);
});

test('login: the window slides — the same IP recovers after >15 minutes', async () => {
    const ip = '198.51.100.9';
    for (let i = 0; i < 25; i += 1) {
        await postLogin(ip);
    }
    const blocked = await postLogin(ip);
    expect(blocked.status).toBe(429);

    setSystemTime(Date.now() + 16 * 60 * 1000);
    try {
        const recovered = await postLogin(ip);
        expect(recovered.status).toBe(401);
    } finally {
        setSystemTime(); // back to real time
    }
});

test('register: counted in its own bucket even while registration is closed', async () => {
    const ip = '198.51.100.7';
    const attempt = () => post('/api/auth/register', ip, { username: 'fresh_user', password: 'password123' });

    for (let i = 0; i < 10; i += 1) {
        const res = await attempt();
        expect(res.status).toBe(403); // 'Registration is closed' — but still counted
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    const body = await blocked.json();
    expect(body.success).toBe(false);
});

test('status and logout are not rate limited', async () => {
    for (let i = 0; i < 30; i += 1) {
        const res = await fetch(`${base}/api/auth/status`);
        expect(res.status).toBe(200);
    }
    const out = await fetch(`${base}/api/auth/logout`, { method: 'POST' });
    expect(out.status).toBe(200);
});

test('login limiter thresholds come from env overrides', async () => {
    process.env.AUTH_LOGIN_RATE_MAX = '3';
    process.env.AUTH_LOGIN_RATE_WINDOW_MS = '500';
    let envServer;
    try {
        envServer = await new Promise((resolve) => {
            const s = buildApp(fakeUsers([['seeded', {
                _id: new ObjectId('333333333333333333333333'),
                username: 'seeded_user',
                passwordHash: 'not-a-real-hash',
                role: 'admin',
                disabled: false,
            }]])).listen(0, () => resolve(s));
        });
        const envBase = `http://127.0.0.1:${envServer.address().port}`;
        const attempt = () => fetch(`${envBase}/api/auth/login`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.23' },
            body: JSON.stringify({ username: 'ghost_user', password: 'wrong-password' }),
        });

        for (let i = 0; i < 3; i += 1) {
            const res = await attempt();
            expect(res.status).toBe(401);
        }
        const blocked = await attempt();
        expect(blocked.status).toBe(429); // env AUTH_LOGIN_RATE_MAX=3 took effect

        await new Promise((resolve) => setTimeout(resolve, 600));
        const recovered = await attempt();
        expect(recovered.status).toBe(401); // env window (500ms) slid past
    } finally {
        envServer?.close();
        delete process.env.AUTH_LOGIN_RATE_MAX;
        delete process.env.AUTH_LOGIN_RATE_WINDOW_MS;
    }
});
