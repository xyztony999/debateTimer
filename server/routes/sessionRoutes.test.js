import { afterAll, beforeAll, expect, test } from 'bun:test';
import express from 'express';
import { createSseHub } from '../lib/sseHub.js';
import { createTimerSessionRegistry } from '../lib/timerSessions.js';
import { createConfigurationsRouter } from './configurations.js';
import { createDisplayRouter } from './display.js';

const OWNER_ID = '111111111111111111111111';

// Minimal Mongo collection stub: enough for findOne/replaceOne/insertOne in
// the configuration and display routes.
function fakeCollection() {
    const docs = new Map();
    let nextId = 1;
    return {
        docs,
        async findOne(query) {
            for (const doc of docs.values()) {
                if (query.shareToken && doc.shareToken !== query.shareToken) continue;
                if (query.ownerId && String(doc.ownerId) !== String(query.ownerId)) continue;
                if (query.name && doc.name !== query.name) continue;
                return doc;
            }
            return null;
        },
        async replaceOne(filter, doc) {
            docs.set(String(filter._id), doc);
        },
        async insertOne(doc) {
            const id = doc._id || `doc${nextId++}`;
            docs.set(String(id), { ...doc, _id: id });
        },
    };
}

async function readStreamUntil(reader, predicate, timeoutMs = 2000) {
    const deadline = Date.now() + timeoutMs;
    let buffer = '';
    while (Date.now() < deadline) {
        const chunk = await Promise.race([
            reader.read(),
            new Promise((resolve) => setTimeout(() => resolve(undefined), deadline - Date.now())),
        ]);
        if (!chunk || chunk.done) {
            break;
        }
        buffer += new TextDecoder().decode(chunk.value);
        if (predicate(buffer)) {
            return buffer;
        }
    }
    return buffer;
}

let server;
let base;
let configurations;
let shareToken;

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    const sse = createSseHub();
    const timerSessions = createTimerSessionRegistry({ sse });
    const requireAuth = (req, _res, next) => {
        req.user = { id: OWNER_ID, role: 'user' };
        next();
    };
    configurations = fakeCollection();
    app.use('/api/display', createDisplayRouter({ configurations, sse, timerSessions }));
    app.use('/api/configurations', createConfigurationsRouter({
        configurations,
        sse,
        requireAuth,
        timerSessions,
    }));
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
    server?.close();
});

test('save accepts the free timer mode and rejects unknown modes', async () => {
    const ok = await fetch(`${base}/api/configurations/default`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            debateStages: { free_debate: 180, sound_check: 30 },
            timerSettings: { free_debate: 'free', sound_check: 'single' },
            stageOrder: ['sound_check', 'free_debate'],
        }),
    });
    expect(ok.status).toBe(200);

    const bad = await fetch(`${base}/api/configurations/default`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            debateStages: { free_debate: 180 },
            timerSettings: { free_debate: 'rapid' },
        }),
    });
    expect(bad.status).toBe(400);
});

test('stage enhancement fields are validated and echoed back', async () => {
    const ok = await fetch(`${base}/api/configurations/default`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            debateStages: { free_debate: 180, sound_check: 30 },
            timerSettings: { free_debate: 'free', sound_check: 'single' },
            stageOrder: ['sound_check', 'free_debate'],
            stageGrace: { free_debate: 30 },
            stageAutoAdvance: { sound_check: true },
            teamNames: { aff: 'A 队', neg: 'B 队' },
        }),
    });
    expect(ok.status).toBe(200);

    // The display route only serves shared documents; flip it on in the stub.
    const shared = await configurations.findOne({ name: 'default' });
    shared.shareEnabled = true;
    shared.shareToken = 'tok-itest';
    const loaded = await fetch(`${base}/api/display/tok-itest`).then((r) => r.json());
    expect(loaded.data.stageGrace).toEqual({ free_debate: 30 });
    expect(loaded.data.stageAutoAdvance).toEqual({ sound_check: true });
    expect(loaded.data.teamNames).toEqual({ aff: 'A 队', neg: 'B 队' });

    const badGrace = await fetch(`${base}/api/configurations/default`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            debateStages: { free_debate: 180 },
            timerSettings: { free_debate: 'free' },
            stageGrace: { free_debate: 999 },
        }),
    });
    expect(badGrace.status).toBe(400);

    const unknownStage = await fetch(`${base}/api/configurations/default`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            debateStages: { free_debate: 180 },
            timerSettings: { free_debate: 'free' },
            stageAutoAdvance: { nope: true },
        }),
    });
    expect(unknownStage.status).toBe(400);

    const longTeam = await fetch(`${base}/api/configurations/default`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            debateStages: { free_debate: 180 },
            timerSettings: { free_debate: 'free' },
            teamNames: { aff: 'x'.repeat(21) },
        }),
    });
    expect(longTeam.status).toBe(400);

    // Restore a clean document for the session lifecycle test below.
    await fetch(`${base}/api/configurations/default`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            debateStages: { free_debate: 180, sound_check: 30 },
            timerSettings: { free_debate: 'free', sound_check: 'single' },
            stageOrder: ['sound_check', 'free_debate'],
        }),
    });
});

test('session lifecycle: start, report, read, subscribe, end', async () => {
    // Enable sharing directly on the stubbed document.
    const doc = await configurations.findOne({ name: 'default' });
    doc.shareEnabled = true;
    doc.shareToken = 'tok-itest';
    shareToken = doc.shareToken;

    // Display subscribes before the session starts.
    const streamResponse = await fetch(`${base}/api/display/${shareToken}/stream`);
    const reader = streamResponse.body.getReader();

    // No session yet.
    const idle = await fetch(`${base}/api/display/${shareToken}/state`).then((r) => r.json());
    expect(idle.data.active).toBe(false);

    // Start.
    const start = await fetch(`${base}/api/configurations/default/session`, { method: 'POST' }).then((r) => r.json());
    expect(start.success).toBe(true);
    expect(start.data.status).toBe('active');
    expect(start.data.displayUrl).toBe(`/display/${shareToken}`);

    // Report a free-debate snapshot; replay and duplicates are rejected.
    const snapshot = {
        seq: 1,
        stageId: 'free_debate',
        stageMode: 'free',
        remainingAffMs: 95000,
        remainingNegMs: 61000,
        runningAff: false,
        runningNeg: true,
        activeSide: 'neg',
    };
    const accepted = await fetch(`${base}/api/configurations/default/session/state`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot),
    }).then((r) => r.json());
    expect(accepted.data.accepted).toBe(true);
    expect(accepted.data.seq).toBe(1);
    expect(typeof accepted.data.serverTime).toBe('number'); // D32 报时

    const replay = await fetch(`${base}/api/configurations/default/session/state`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(snapshot),
    });
    expect(replay.status).toBe(400);

    const unknownStage = await fetch(`${base}/api/configurations/default/session/state`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...snapshot, seq: 2, stageId: 'nope' }),
    });
    expect(unknownStage.status).toBe(400);

    // Anonymous display reads the latest snapshot.
    const state = await fetch(`${base}/api/display/${shareToken}/state`).then((r) => r.json());
    expect(state.data.active).toBe(true);
    expect(state.data.snapshot).toMatchObject({ seq: 1, stageMode: 'free', activeSide: 'neg' });

    // The live stream received session + state events.
    const streamText = await readStreamUntil(
        reader,
        (text) => text.includes('event: session') && text.includes('event: state'),
    );
    expect(streamText).toContain('"type":"started"');
    expect(streamText).toContain('"stageMode":"free"');
    reader.cancel();

    // End (idempotent from the API consumer's point of view).
    const ended = await fetch(`${base}/api/configurations/default/session`, { method: 'DELETE' }).then((r) => r.json());
    expect(ended.data.ended).toBe(true);

    const after = await fetch(`${base}/api/display/${shareToken}/state`).then((r) => r.json());
    expect(after.data.active).toBe(false);
});

test('starting a session requires sharing to be enabled', async () => {
    const doc = await configurations.findOne({ name: 'default' });
    const token = doc.shareToken;
    doc.shareEnabled = false;
    const blocked = await fetch(`${base}/api/configurations/default/session`, { method: 'POST' });
    expect(blocked.status).toBe(400);
    doc.shareEnabled = true;
    doc.shareToken = token;
});

test('unauthenticated callers are rejected by requireAuth wiring', async () => {
    // The router applies requireAuth at mount time; simulate a missing user
    // by calling the session route on an app built without the middleware.
    const app = express();
    const sse = createSseHub();
    const timerSessions = createTimerSessionRegistry({ sse });
    const denyAuth = (_req, res) => res.status(401).json({ success: false, message: 'Authentication required' });
    app.use('/api/configurations', createConfigurationsRouter({
        configurations,
        sse,
        requireAuth: denyAuth,
        timerSessions,
    }));
    const bare = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    const res = await fetch(`http://127.0.0.1:${bare.address().port}/api/configurations/default/session`, { method: 'POST' });
    expect(res.status).toBe(401);
    await new Promise((resolve) => bare.close(resolve));
});
