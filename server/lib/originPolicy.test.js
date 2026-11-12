import { expect, test } from 'bun:test';
import {
    createCorsMiddleware,
    createUnsafeOriginGuard,
    isSameOrigin,
    parseAllowedOrigins,
} from './originPolicy.js';

// Middleware-level tests with fake req/res (no I/O). The cors library branch
// is exercised only far enough to prove the gate routes same-origin traffic
// around it; the allowlist semantics themselves live in createUnsafeOriginGuard,
// which owns the 403 decision.

function fakeReq({ method = 'POST', origin, host = '192.168.1.10:3001' }) {
    const headers = { origin, host };
    return {
        method,
        headers,
        get(key) {
            return headers[String(key).toLowerCase()];
        },
    };
}

function fakeRes() {
    const state = { statusCode: 0, body: null };
    return {
        state,
        status(code) {
            state.statusCode = code;
            return this;
        },
        json(body) {
            state.body = body;
            return this;
        },
    };
}

function runMiddleware(middleware, req) {
    const res = fakeRes();
    let nextCalled = false;
    middleware(req, res, () => {
        nextCalled = true;
    });
    return { res, nextCalled };
}

test('parseAllowedOrigins splits, trims and drops empties', () => {
    expect(parseAllowedOrigins('https://a.com, https://b.com ,,')).toEqual(['https://a.com', 'https://b.com']);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
});

test('isSameOrigin matches host including port', () => {
    expect(isSameOrigin(fakeReq({ origin: 'http://192.168.1.10:3001' }))).toBe(true);
    expect(isSameOrigin(fakeReq({ origin: 'https://debatetimer.example.com', host: 'debatetimer.example.com' }))).toBe(true);
    expect(isSameOrigin(fakeReq({ origin: 'http://192.168.1.10:3002' }))).toBe(false);
    expect(isSameOrigin(fakeReq({ origin: 'http://evil.example', host: '192.168.1.10:3001' }))).toBe(false);
    expect(isSameOrigin(fakeReq({ origin: undefined }))).toBe(false);
    expect(isSameOrigin(fakeReq({ origin: 'not-a-url' }))).toBe(false);
});

test('cors gate lets same-origin POST bypass the allowlist', () => {
    const gate = createCorsMiddleware({ allowedOrigins: ['https://pages.example.com'] });
    const { nextCalled } = runMiddleware(gate, fakeReq({ origin: 'http://192.168.1.10:3001' }));
    expect(nextCalled).toBe(true);
});

test('unsafe origin guard allows same-origin POST (direct LAN access)', () => {
    const guard = createUnsafeOriginGuard({ allowedOrigins: ['https://pages.example.com'] });
    const { res, nextCalled } = runMiddleware(guard, fakeReq({ origin: 'http://192.168.1.10:3001' }));
    expect(nextCalled).toBe(true);
    expect(res.state.statusCode).toBe(0);
});

test('unsafe origin guard keeps allowlist semantics for cross-origin POST', () => {
    const guard = createUnsafeOriginGuard({ allowedOrigins: ['https://pages.example.com'] });

    const allowed = runMiddleware(guard, fakeReq({ origin: 'https://pages.example.com' }));
    expect(allowed.nextCalled).toBe(true);

    const blocked = runMiddleware(guard, fakeReq({ origin: 'https://evil.example' }));
    expect(blocked.nextCalled).toBe(false);
    expect(blocked.res.state.statusCode).toBe(403);
    expect(blocked.res.state.body).toEqual({ success: false, message: 'Forbidden origin' });
});

test('unsafe origin guard allows originless non-browser POST and safe methods', () => {
    const guard = createUnsafeOriginGuard({ allowedOrigins: [] });

    const curlLike = runMiddleware(guard, fakeReq({ origin: undefined }));
    expect(curlLike.nextCalled).toBe(true);

    const get = runMiddleware(guard, fakeReq({ method: 'GET', origin: 'https://evil.example' }));
    expect(get.nextCalled).toBe(true);
});
