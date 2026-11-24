// Post-login destinations taken from `?next=`.
//
// The value arrives through the URL, so it is treated as untrusted input: only
// a path inside this app is honoured, everything else falls back to the home
// route. The result is always a router-relative path (no deploy base), because
// it is consumed by <Navigate>, which adds the Router basename itself.

function basePrefix(base) {
    const raw = typeof base === 'string' ? base : '';
    return raw.replace(/\/+$/, ''); // '/app/' → '/app', '/' → ''
}

/**
 * Validates a `next` value and returns a path safe to hand to the router.
 *
 * Accepts a leading `/` but not `//host` (protocol-relative URL) and not a
 * backslash, which browsers normalise to a second slash. A value that already
 * carries the deploy base (`/app/settings` on the Pages build) has it removed
 * so the basename is not added twice.
 */
function isInAppPath(value) {
    return typeof value === 'string'
        && value.startsWith('/')
        && !value.startsWith('//')
        && !value.includes('\\');
}

export function safeNextPath(raw, base = '') {
    if (!isInAppPath(raw)) {
        return '/';
    }
    const prefix = basePrefix(base);
    if (prefix && (raw === prefix || raw.startsWith(`${prefix}/`))) {
        // Checked again: removing the base can leave "//…" behind.
        const stripped = raw.slice(prefix.length) || '/';
        return isInAppPath(stripped) ? stripped : '/';
    }
    return raw;
}

/** True for the gate route itself, with or without a query string. */
export function isGatePath(path) {
    return path === '/gate' || path.startsWith('/gate?') || path.startsWith('/gate#');
}

/**
 * Where the gate page sends the account once it owes nothing any more.
 * A `next` that points back at the gate resolves to the home route, so the
 * login page and the gate page cannot bounce the account between them.
 */
export function gateExitPath(raw, base = '') {
    const path = safeNextPath(raw, base);
    return isGatePath(path) ? '/' : path;
}
