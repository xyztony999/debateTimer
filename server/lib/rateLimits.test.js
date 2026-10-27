import {
    createDisplayRateLimiter,
    createGalleryRateLimiter,
    createLoginRateLimiter,
    createRegisterRateLimiter,
} from './rateLimits.js';

// Same middleware-level harness as rateLimit.test.js: feed a fake req/res and
// count the (429) replies.
function fakeReqRes(ip = '203.0.113.7') {
    const req = { ip };
    const replies = [];
    const res = {
        headers: {},
        setHeader(name, value) {
            this.headers[name] = value;
        },
        status(code) {
            replies.push(code);
            return this;
        },
        json(body) {
            replies.push(body);
        },
    };
    return { req, res, replies };
}

function run(limit, count) {
    const { req, res, replies } = fakeReqRes();
    for (let i = 0; i < count; i += 1) {
        limit(req, res, () => {});
    }
    return { req, res, replies };
}

test('login limiter defaults to 20 hits per 15 minutes', () => {
    const limit = createLoginRateLimiter({});
    expect(run(limit, 20).replies).toHaveLength(0);
    expect(run(limit, 1).replies[0]).toBe(429);
});

test('register limiter defaults to 10 hits per hour', () => {
    const limit = createRegisterRateLimiter({});
    expect(run(limit, 10).replies).toHaveLength(0);
    expect(run(limit, 1).replies[0]).toBe(429);
});

test('display limiter defaults to 60 hits per minute', () => {
    const limit = createDisplayRateLimiter({});
    expect(run(limit, 60).replies).toHaveLength(0);
    expect(run(limit, 1).replies[0]).toBe(429);
});

test('gallery limiter defaults to 120 hits per minute', () => {
    const limit = createGalleryRateLimiter({});
    expect(run(limit, 120).replies).toHaveLength(0);
    expect(run(limit, 1).replies[0]).toBe(429);
});

test('env overrides change the thresholds (DISPLAY_RATE_MAX=2)', () => {
    const limit = createDisplayRateLimiter({ DISPLAY_RATE_MAX: '2', DISPLAY_RATE_WINDOW_MS: '60000' });
    expect(run(limit, 2).replies).toHaveLength(0);
    const blocked = run(limit, 1);
    expect(blocked.replies[0]).toBe(429);
    expect(blocked.res.headers['Retry-After']).toMatch(/^[1-9][0-9]*$/);
});

test('invalid env values fall back to the defaults', () => {
    const limit = createLoginRateLimiter({
        AUTH_LOGIN_RATE_MAX: '0',
        AUTH_LOGIN_RATE_WINDOW_MS: 'not-a-number',
    });
    expect(run(limit, 20).replies).toHaveLength(0);
    expect(run(limit, 1).replies[0]).toBe(429);
});

test('each factory call returns an independent limiter', () => {
    const a = createLoginRateLimiter({ AUTH_LOGIN_RATE_MAX: '1' });
    const b = createLoginRateLimiter({ AUTH_LOGIN_RATE_MAX: '1' });
    const first = fakeReqRes();
    const second = fakeReqRes();
    a(first.req, first.res, () => {});
    b(second.req, second.res, () => {}); // same IP, separate bucket — must pass
    expect(first.replies).toHaveLength(0);
    expect(second.replies).toHaveLength(0);
    a(first.req, first.res, () => {});
    expect(first.replies[0]).toBe(429);
    expect(second.replies).toHaveLength(0);
});
