import { afterAll, beforeAll, expect, test } from 'bun:test';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createDisplayRouter } from './display.js';
import { createDisplayRateLimiter } from '../lib/rateLimits.js';
import { createSseHub } from '../lib/sseHub.js';
import { createTimerSessionRegistry } from '../lib/timerSessions.js';

// Regression for the SSE exemption semantics: the display limiter counts a
// stream ONCE at connect. The middleware runs once per HTTP request, and the
// long-lived connection generates no further requests (sseHub has no
// heartbeat), so a held-open stream must not keep draining the per-IP bucket.
// Mounts the display router behind createDisplayRateLimiter({DISPLAY_RATE_MAX:'3'})
// — which also proves the env override works at the real mount point.

const OWNER_ID = '111111111111111111111111';
const SHARE_TOKEN = 'tok-rl';

function fakeConfigs(seed) {
    const docs = new Map([[String(seed._id), seed]]);
    return {
        async findOne(query) {
            if (query?.shareToken) {
                return [...docs.values()].find((d) => d.shareToken === query.shareToken) || null;
            }
            return null;
        },
    };
}

let server;
let base;

beforeAll(async () => {
    const configurations = fakeConfigs({
        _id: new ObjectId(),
        ownerId: OWNER_ID,
        name: '限流赛制',
        schemaVersion: 2,
        debateStages: { a: 120 },
        timerSettings: { a: 'single' },
        stageOrder: ['a'],
        stageLabels: {},
        stageGrace: {},
        stageAutoAdvance: {},
        teamNames: { aff: 'A', neg: 'B' },
        shareEnabled: true,
        shareToken: SHARE_TOKEN,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });
    const sse = createSseHub();
    const timerSessions = createTimerSessionRegistry({ sse });

    const app = express();
    app.set('trust proxy', 1);
    app.use('/api/display', createDisplayRateLimiter({
        DISPLAY_RATE_MAX: '3',
        DISPLAY_RATE_WINDOW_MS: '60000',
    }), createDisplayRouter({ configurations, sse, timerSessions }));

    server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
    server?.close();
});

function get(path, ip) {
    return fetch(`${base}${path}`, { headers: { 'x-forwarded-for': ip } });
}

test('a held-open SSE stream counts once against the display limiter', async () => {
    const ip = '203.0.113.44';
    const controller = new AbortController();

    // Hit 1: the stream connection (resolved on headers; body stays open).
    const stream = await fetch(`${base}/api/display/${SHARE_TOKEN}/stream`, {
        signal: controller.signal,
        headers: { 'x-forwarded-for': ip },
    });
    expect(stream.status).toBe(200);
    expect(stream.headers.get('content-type')).toContain('text/event-stream');

    // Hold it open; if the limiter re-counted a live stream (per write/tick)
    // instead of once per connection, these follow-ups would already 429.
    await new Promise((resolve) => setTimeout(resolve, 150));

    const state = await get(`/api/display/${SHARE_TOKEN}/state`, ip); // hit 2
    expect(state.status).toBe(200);

    const meta = await get(`/api/display/${SHARE_TOKEN}`, ip); // hit 3
    expect(meta.status).toBe(200);

    const blocked = await get(`/api/display/${SHARE_TOKEN}`, ip); // hit 4 → over max=3
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toMatch(/^[1-9][0-9]*$/);
    const body = await blocked.json();
    expect(body.success).toBe(false);

    await controller.abort(); // release the long-lived connection
});
