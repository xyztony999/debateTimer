import { createAttemptLimiter, createRateLimiter } from './rateLimit.js';

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

describe('createAttemptLimiter (keyed by account, counts failures only)', () => {
    test('allows up to max failures, then blocks with Retry-After', () => {
        const limiter = createAttemptLimiter({ windowMs: 60_000, max: 5 });
        expect(limiter.isBlocked('acct').blocked).toBe(false);
        for (let i = 1; i <= 4; i += 1) {
            expect(limiter.recordFailure('acct')).toEqual({
                failures: i, remaining: 5 - i, blocked: false, retryAfterSec: 0,
            });
        }
        const fifth = limiter.recordFailure('acct');
        expect(fifth.blocked).toBe(true);
        expect(fifth.remaining).toBe(0);
        expect(fifth.retryAfterSec).toBeGreaterThanOrEqual(1);
        expect(fifth.retryAfterSec).toBeLessThanOrEqual(60);
        expect(limiter.isBlocked('acct').blocked).toBe(true);
    });

    test('keys are independent — one account being blocked never touches another', () => {
        const limiter = createAttemptLimiter({ windowMs: 60_000, max: 2 });
        limiter.recordFailure('a');
        limiter.recordFailure('a');
        expect(limiter.isBlocked('a').blocked).toBe(true);
        expect(limiter.isBlocked('b').blocked).toBe(false);
        // Asking does not count as a failure.
        expect(limiter.isBlocked('b')).toEqual({ blocked: false, retryAfterSec: 0 });
    });

    test('reset clears the counter after a success', () => {
        const limiter = createAttemptLimiter({ windowMs: 60_000, max: 2 });
        limiter.recordFailure('a');
        limiter.recordFailure('a');
        limiter.reset('a');
        expect(limiter.isBlocked('a').blocked).toBe(false);
    });

    test('the window slides — failures age out', async () => {
        const limiter = createAttemptLimiter({ windowMs: 200, max: 2 });
        limiter.recordFailure('a');
        limiter.recordFailure('a');
        expect(limiter.isBlocked('a').blocked).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 260));
        expect(limiter.isBlocked('a').blocked).toBe(false);
    });

    test('Retry-After counts from the oldest failure still in the window', async () => {
        const limiter = createAttemptLimiter({ windowMs: 1000, max: 2 });
        limiter.recordFailure('a');
        await new Promise((resolve) => setTimeout(resolve, 400));
        const blocked = limiter.recordFailure('a');
        expect(blocked.blocked).toBe(true);
        expect(blocked.retryAfterSec).toBe(1); // ceil(~600ms)
    });
});
