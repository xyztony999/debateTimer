/**
 * Minimal in-memory sliding-window rate limiter (per client IP), for the
 * anonymous public endpoints (gallery / display). Single-process by design —
 * the API runs as one Node process behind Baota's nginx.
 */
export function createRateLimiter({ windowMs = 60_000, max = 60 } = {}) {
    /** @type {Map<string, number[]>} ip -> timestamps of accepted requests */
    const hits = new Map();
    let lastSweep = Date.now();

    function sweep(now) {
        if (now - lastSweep < windowMs) {
            return;
        }
        lastSweep = now;
        for (const [ip, times] of hits) {
            const alive = times.filter((t) => now - t < windowMs);
            if (alive.length === 0) {
                hits.delete(ip);
            } else {
                hits.set(ip, alive);
            }
        }
    }

    return function rateLimit(req, res, next) {
        const now = Date.now();
        sweep(now);
        const key = req.ip || 'unknown';
        const times = (hits.get(key) || []).filter((t) => now - t < windowMs);
        if (times.length >= max) {
            const retryAfterSec = Math.max(1, Math.ceil((times[0] + windowMs - now) / 1000));
            res.setHeader('Retry-After', String(retryAfterSec));
            res.status(429).json({
                success: false,
                message: 'Too many requests, please retry later',
            });
            return;
        }
        times.push(now);
        hits.set(key, times);
        next();
    };
}
