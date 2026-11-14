import { afterAll, beforeAll, expect, test } from 'bun:test';
import express from 'express';
import { createSseHub } from '../lib/sseHub.js';
import { createTimerSessionRegistry } from '../lib/timerSessions.js';
import { createConfigurationsRouter } from './configurations.js';
import { createDisplayRouter } from './display.js';
import { createIntentRouter } from './intent.js';

const OWNER_ID = '111111111111111111111111';

// Minimal Mongo collection stub (same contract as sessionRoutes.test.js).
function fakeCollection() {
    const docs = new Map();
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
let timerSessions;

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    const sse = createSseHub();
    timerSessions = createTimerSessionRegistry({ sse });
    const requireAuth = (req, _res, next) => {
        req.user = { id: OWNER_ID, role: 'user' };
        next();
    };
    const configurations = fakeCollection();
    configurations.docs.set('cfg1', {
        _id: 'cfg1',
        name: 'default',
        ownerId: OWNER_ID,
        shareEnabled: true,
        shareToken: 'tok1',
        debateStages: { sound_check: 30, free_debate: 180 },
        timerSettings: { sound_check: 'single', free_debate: 'free' },
        stageOrder: ['sound_check', 'free_debate'],
    });
    app.use('/api/display', createDisplayRouter({ configurations, sse, timerSessions }));
    app.use('/api/configurations', createConfigurationsRouter({
        configurations,
        sse,
        requireAuth,
        timerSessions,
    }));
    app.use('/api/session', createIntentRouter({ configurations, timerSessions, requireAuth }));
    await new Promise((resolve) => {
        server = app.listen(0, resolve);
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
    server?.close();
});

test('intent endpoint relays anchor frames to the display stream', async () => {
    // Start the session first (host side).
    const start = await fetch(`${base}/api/configurations/default/session`, { method: 'POST' });
    expect(start.status).toBe(200);
    const { data } = await start.json();

    // A display subscribes before the operator acts.
    const stream = await fetch(`${base}/api/display/tok1/stream`);
    expect(stream.status).toBe(200);
    const reader = stream.body.getReader();

    const now = 1700000000000;
    const intent = await fetch(`${base}/api/session/default/intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            type: 'stop',
            side: 'aff',
            sessionId: data.sessionId,
            anchorServerAt: now,
            anchorAff: { running: false, frozenMs: 9500 },
            anchorNeg: { running: true, endAtServerMs: now + 61000 },
        }),
    });
    expect(intent.status).toBe(200);
    const receipt = await intent.json();
    expect(receipt.data.commandSeq).toBeGreaterThan(0);
    expect(receipt.data.serverTime).toBeGreaterThan(0);

    // The display stream carries the intent frame (after the connect replay).
    const buffer = await readStreamUntil(
        reader,
        (text) => text.includes('event: command') && text.includes('anchorServerAt'),
    );
    expect(buffer).toContain('anchorAff');
    expect(buffer).toContain(`"sessionId":"${data.sessionId}"`);
    reader.cancel();
});

test('intent endpoint validates ownership and payload', async () => {
    const session = timerSessions.get('tok1');
    expect(session).not.toBeNull();

    const unknownConfig = await fetch(`${base}/api/session/nope/intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            type: 'stop',
            side: 'aff',
            sessionId: session.sessionId,
            anchorServerAt: Date.now(),
        }),
    });
    expect(unknownConfig.status).toBe(404);

    const foreignSession = await fetch(`${base}/api/session/default/intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            type: 'stop',
            side: 'aff',
            sessionId: 'someone-elses-session',
            anchorServerAt: Date.now(),
        }),
    });
    expect(foreignSession.status).toBe(409);
    expect((await foreignSession.json()).code).toBe('session_taken');

    const badType = await fetch(`${base}/api/session/default/intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            type: 'warp',
            side: 'aff',
            sessionId: session.sessionId,
            anchorServerAt: Date.now(),
        }),
    });
    expect(badType.status).toBe(400);

    const noAnchor = await fetch(`${base}/api/session/default/intent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            type: 'stop',
            side: 'aff',
            sessionId: session.sessionId,
        }),
    });
    expect(noAnchor.status).toBe(400);
});
