import { createRateLimiter } from './rateLimit.js';

function fakeReqRes(ip = '1.2.3.4') {
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

test('allows up to max requests per window, then 429 with Retry-After', async () => {
    const limit = createRateLimiter({ windowMs: 1000, max: 3 });
    const { req, res, replies } = fakeReqRes();

    for (let i = 0; i < 3; i += 1) {
        limit(req, res, () => {});
    }
    expect(replies).toHaveLength(0);

    limit(req, res, () => {});
    expect(replies[0]).toBe(429);
    expect(Number(res.headers['Retry-After'])).toBeGreaterThanOrEqual(1);

    // Recovers once the oldest hit slides out of the window.
    await new Promise((resolve) => setTimeout(resolve, 1050));
    const next = [];
    limit(req, { ...res, status(c) { next.push(c); return this; }, json(b) { next.push(b); } }, () => {});
    expect(next).toHaveLength(0);
});

test('tracks IPs independently', () => {
    const limit = createRateLimiter({ windowMs: 60_000, max: 1 });
    const a = fakeReqRes('1.1.1.1');
    const b = fakeReqRes('2.2.2.2');
    limit(a.req, a.res, () => {});
    limit(b.req, b.res, () => {});
    expect(a.replies).toHaveLength(0);
    expect(b.replies).toHaveLength(0);
    limit(a.req, a.res, () => {});
    expect(a.replies[0]).toBe(429);
});
