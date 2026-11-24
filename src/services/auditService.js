import { apiClient, unwrap } from './apiClient';

export const AUDIT_PAGE_SIZE = 20;

/**
 * Audit log read side (R20, module P-04). Both endpoints only read: there is
 * no write, edit or delete endpoint, so none exists here either.
 */
export const auditService = {
    /**
     * GET /api/audit/logs/list — administrators only.
     * `{ items, total, page, pageSize }`, newest first.
     *
     * @param {{ page?: number, pageSize?: number, type?: string, result?: string,
     *           username?: string, from?: number|null, to?: number|null }} filters
     *   `from` / `to` are epoch milliseconds; empty filters are not sent.
     */
    list(filters = {}) {
        return unwrap(
            apiClient.get('/api/audit/logs/list', { params: cleanParams(filters) }),
            'Audit log',
        );
    },

    /**
     * GET /api/audit/logins/list — the signed-in account's own sign-in events
     * only (the server ignores any other account). Same envelope as `list`.
     */
    listMyLogins(page = 1, pageSize = AUDIT_PAGE_SIZE) {
        return unwrap(
            apiClient.get('/api/audit/logins/list', { params: { page, pageSize } }),
            'My sign-in history',
        );
    },
};

// Drops empty filters so the server sees "not set" rather than "" or null
// (both of which it would have to reject).
function cleanParams(filters) {
    const params = {};
    for (const [key, value] of Object.entries(filters)) {
        if (value === undefined || value === null || value === '') {
            continue;
        }
        params[key] = typeof value === 'string' ? value.trim() : value;
    }
    return params;
}
