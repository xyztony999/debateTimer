/**
 * Env-configured rate limiters for the API surface (thresholds and windows
 * overridable via environment variables, with the historical defaults).
 *
 * Each factory call creates an INDEPENDENT limiter with its own per-IP
 * buckets — router factories call these once per mounted instance, and tests
 * get isolated state. The underlying sliding-window limiter (and its
 * single-process caveat) lives in rateLimit.js.
 */
import { createRateLimiter } from './rateLimit.js';

function positiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** POST /api/auth/login — anonymous password check, the brute-force target. */
export function createLoginRateLimiter(env = process.env) {
    return createRateLimiter({
        windowMs: positiveNumber(env.AUTH_LOGIN_RATE_WINDOW_MS, 900_000),
        max: positiveNumber(env.AUTH_LOGIN_RATE_MAX, 20),
    });
}

/** POST /api/auth/register — abuse surface while registration is open. */
export function createRegisterRateLimiter(env = process.env) {
    return createRateLimiter({
        windowMs: positiveNumber(env.AUTH_REGISTER_RATE_WINDOW_MS, 3_600_000),
        max: positiveNumber(env.AUTH_REGISTER_RATE_MAX, 10),
    });
}

/** /api/display — anonymous share-token surface (SSE counts once at connect). */
export function createDisplayRateLimiter(env = process.env) {
    return createRateLimiter({
        windowMs: positiveNumber(env.DISPLAY_RATE_WINDOW_MS, 60_000),
        max: positiveNumber(env.DISPLAY_RATE_MAX, 60),
    });
}

/** /api/gallery — anonymous browse + logged-in copy share one bucket per IP. */
export function createGalleryRateLimiter(env = process.env) {
    return createRateLimiter({
        windowMs: positiveNumber(env.GALLERY_RATE_WINDOW_MS, 60_000),
        max: positiveNumber(env.GALLERY_RATE_MAX, 120),
    });
}
