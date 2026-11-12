import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import express from 'express';
import { createStaticSite } from './staticSite.js';

// Real ephemeral server + global fetch (authRoutes.test.js harness), with a
// scratch Vite-like build tree: index.html + hashed asset. API-ish routes are
// mounted before the static site, mirroring index.js ordering.

const root = mkdtempSync(path.join(tmpdir(), 'dt-static-'));
let server;
let base;

beforeAll(async () => {
    writeFileSync(path.join(root, 'index.html'), '<!DOCTYPE html><html><body>dt-index</body></html>');
    mkdirSync(path.join(root, 'assets'));
    writeFileSync(path.join(root, 'assets', 'main.HASH123.js'), 'console.log("main")');

    const app = express();
    app.get('/health', (_req, res) => res.json({ ok: true }));
    app.get('/api/known', (_req, res) => res.json({ ok: true }));
    app.use(createStaticSite({ dir: root }));

    server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(() => {
    server?.close();
    rmSync(root, { recursive: true, force: true });
});

test('/ serves index.html with no-cache', async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect((await res.text()).includes('dt-index')).toBe(true);
});

test('client-side route /display/abc falls back to index.html', async () => {
    const res = await fetch(`${base}/display/abc`);
    expect(res.status).toBe(200);
    expect((await res.text()).includes('dt-index')).toBe(true);
});

test('hashed /assets/* gets immutable long cache', async () => {
    const res = await fetch(`${base}/assets/main.HASH123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=30d, immutable');
});

test('unknown /api path returns JSON 404, not the SPA shell', async () => {
    const res = await fetch(`${base}/api/unknown`);
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type').includes('application/json')).toBe(true);
    const body = await res.json();
    expect(body.success).toBe(false);
});

test('unknown /health path returns JSON 404 as well', async () => {
    const res = await fetch(`${base}/health/extra`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.success).toBe(false);
});

test('POST to a client-side route does not fall back to the SPA shell', async () => {
    const res = await fetch(`${base}/display/abc`, { method: 'POST' });
    expect(res.status).toBe(404);
});

test('API routes mounted before the static site keep working', async () => {
    const res = await fetch(`${base}/api/known`);
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
});

test('missing index.html fails fast at construction', () => {
    const empty = mkdtempSync(path.join(tmpdir(), 'dt-empty-'));
    try {
        expect(() => createStaticSite({ dir: empty })).toThrow(/STATIC_DIR has no index\.html/);
    } finally {
        rmSync(empty, { recursive: true, force: true });
    }
});
