import cors from 'cors';

// Cross-origin policy, extracted from index.js, with a same-origin bypass:
// when the Origin header's host equals the request Host (all-stack
// self-hosted STATIC_DIR deploys, or direct LAN access via http://IP:3001),
// requests are same-origin by definition and never need the ALLOWED_ORIGINS
// list. Cross-origin traffic keeps the strict allowlist — cookie credentials
// rule out `*`.

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function parseAllowedOrigins(raw) {
    return String(raw || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

// True when the request carries an Origin whose host matches the request
// Host header (port included). Requests without an Origin header are not
// "same-origin" here — they are handled by the pre-existing lenient branches
// (cors passes originless requests through; the unsafe-method guard allows
// them, matching non-browser clients like curl and health probes).
export function isSameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) {
        return false;
    }
    let originHost;
    try {
        originHost = new URL(origin).host;
    } catch {
        return false;
    }
    const host = req.headers.host;
    return Boolean(host) && originHost === host;
}

// Wraps the cors middleware so same-origin requests skip the allowlist
// entirely (they need no CORS headers); everything else goes through the
// original origin check.
export function createCorsMiddleware({ allowedOrigins }) {
    const corsMiddleware = cors({
        origin(origin, callback) {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
                return;
            }
            callback(new Error(`CORS blocked for origin: ${origin}`));
        },
        credentials: true,
    });

    return function corsGate(req, res, next) {
        if (isSameOrigin(req)) {
            next();
            return;
        }
        corsMiddleware(req, res, next);
    };
}

// Second layer from index.js: non-safe methods must carry no Origin or an
// allowed one (CSRF guard). Same-origin requests are exempted too — a
// browser same-origin POST sends Origin equal to Host, which an attacker's
// cross-site form cannot forge (their Origin would be their own site).
export function createUnsafeOriginGuard({ allowedOrigins }) {
    return function unsafeOriginGuard(req, res, next) {
        if (SAFE_METHODS.has(req.method) || isSameOrigin(req)) {
            next();
            return;
        }
        const origin = req.get('Origin');
        if (!origin || allowedOrigins.includes(origin)) {
            next();
            return;
        }
        res.status(403).json({ success: false, message: 'Forbidden origin' });
    };
}
