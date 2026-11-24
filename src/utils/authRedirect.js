// Decides where a failed API response should send the browser. Pure: the
// axios interceptor in services/apiClient.js does the reading of
// window.location and the actual navigation, this module only makes the
// decision so it can be unit-tested without a DOM.

export const GATE_REQUIRED_CODE = 'GATE_REQUIRED';

/**
 * Query flag the interceptor adds when it sends the browser to the gate page
 * (`/gate?next=…&sync=1`). It tells that page that what the app remembers
 * about the session is out of date — a step appeared while the user was
 * somewhere else — and the account must be re-read before anything is shown.
 */
export const GATE_SYNC_PARAM = 'sync';

// Routes that an anonymous visitor may sit on. A 401 there must not redirect,
// or the page would reload itself in a loop.
const PUBLIC_ROUTES = ['/login', '/gate', '/display', '/gallery'];

function basePrefix(base) {
    const raw = typeof base === 'string' ? base : '';
    return raw.replace(/\/+$/, '');
}

/** Strips the deploy base from a location pathname: '/app/settings' → '/settings'. */
export function routePathOf(pathname, base = '') {
    const path = typeof pathname === 'string' ? pathname : '/';
    const prefix = basePrefix(base);
    if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) {
        return path.slice(prefix.length) || '/';
    }
    return path;
}

export function isPublicRoute(routePath) {
    return PUBLIC_ROUTES.some((route) => routePath === route || routePath.startsWith(`${route}/`));
}

function isGateRoute(routePath) {
    return routePath === '/gate' || routePath.startsWith('/gate/');
}

/**
 * @param {{ status?: number, data?: { code?: string } | null }} response
 * @param {{ routePath: string, pathname: string, search: string, skipAuthRedirect?: boolean }} where
 * @returns {null | { to: 'gate' | 'login', next: string }}
 */
export function redirectFor(response, where) {
    const { routePath, pathname, search = '', skipAuthRedirect = false } = where;
    if (skipAuthRedirect || typeof response !== 'object' || response === null) {
        return null;
    }
    // Signed in, but the account still owes a step (privacy notice, mandatory
    // two-step setup). Every gated call answers 403 with this code.
    if (response.status === 403 && response.data?.code === GATE_REQUIRED_CODE) {
        if (isGateRoute(routePath)) {
            return null;
        }
        return { to: 'gate', next: `${routePath}${search}` };
    }
    // No session. The login page is sent the full pathname, as before.
    if (response.status === 401 && !isPublicRoute(routePath)) {
        return { to: 'login', next: `${pathname}${search}` };
    }
    return null;
}
