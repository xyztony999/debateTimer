// Pure helpers for the two audit views — the account's own sign-in history
// and the administrator's audit log. No React and no DOM here, so the
// branches are unit-tested directly (see auditView.test.js).

/**
 * The twenty audit event types in the five groups of select-pool SP-12, in
 * display order. The ids are the wire values of EP-AUDIT-01; the labels come
 * from i18n (`audit.eventGroup.<group>`, `audit.event.<type>`).
 */
export const AUDIT_EVENT_GROUPS = Object.freeze([
    {
        id: 'auth',
        types: [
            'registered', 'login_succeeded', 'login_failed', 'totp_succeeded', 'totp_failed',
            'recovery_code_used', 'totp_bound', 'totp_unbound', 'totp_reset',
        ],
    },
    { id: 'privacy', types: ['privacy_consented'] },
    { id: 'account', types: ['user_created', 'role_changed', 'status_changed', 'password_reset', 'user_deleted'] },
    {
        id: 'content',
        types: ['registration_setting_changed', 'gallery_published', 'gallery_unpublished', 'template_deleted_by_admin'],
    },
    { id: 'audit', types: ['audit_scrubbed'] },
]);

export const AUDIT_EVENT_TYPES = Object.freeze(
    AUDIT_EVENT_GROUPS.flatMap((group) => group.types),
);

export const AUDIT_PAGE_SIZE = 20;

/** Pages needed for `total` entries; never less than one. */
export function pageCount(total, pageSize = AUDIT_PAGE_SIZE) {
    const size = Number.isInteger(pageSize) && pageSize > 0 ? pageSize : 1;
    const count = Number(total);
    return Math.max(1, Math.ceil((Number.isFinite(count) && count > 0 ? count : 0) / size));
}

/**
 * The value of a `datetime-local` input as epoch milliseconds. The browser
 * hands over "2026-11-24T14:30" without a zone, which `Date` reads as local
 * time — what the administrator typed. Empty or unparseable → null.
 */
export function localInputToEpochMs(raw) {
    const text = String(raw ?? '').trim();
    if (!text) {
        return null;
    }
    const ms = new Date(text).getTime();
    return Number.isFinite(ms) ? ms : null;
}

/** True when both ends of the time range are set and the start is not before the end. */
export function hasInvalidRange(filters) {
    const from = localInputToEpochMs(filters?.from);
    const to = localInputToEpochMs(filters?.to);
    return from !== null && to !== null && from >= to;
}

/**
 * The query sent for AUDIT-LIST with the filters that are actually set.
 * Returns null for an invalid time range, so nothing is asked of the server
 * (the server would refuse it with 400 anyway).
 *
 * @param {{ type?: string, username?: string, from?: string, to?: string, result?: string }} filters
 */
export function buildAuditQuery(filters, page = 1) {
    if (hasInvalidRange(filters)) {
        return null;
    }
    const type = String(filters?.type ?? '').trim();
    const username = String(filters?.username ?? '').trim();
    const result = String(filters?.result ?? '').trim();
    const from = localInputToEpochMs(filters?.from);
    const to = localInputToEpochMs(filters?.to);
    return {
        page,
        pageSize: AUDIT_PAGE_SIZE,
        ...(type ? { type } : {}),
        ...(username ? { username } : {}),
        ...(result ? { result } : {}),
        ...(from !== null ? { from } : {}),
        ...(to !== null ? { to } : {}),
    };
}

const ROLES = new Set(['admin', 'user']);
const LIFECYCLE = new Set(['enabled', 'disabled']);

/**
 * How one `detail` value is shown:
 *   role       'admin' / 'user'            → the role wording of the users table
 *   lifecycle  'enabled' / 'disabled'      → the status wording of the users table
 *   switch     true / false (registration) → "Open" / "Closed"
 *   boolean    any other true / false      → "Yes" / "No"
 *   empty      null                        → a dash
 *   raw        anything else, as it is
 */
export function detailValueKind(type, key, raw) {
    if (raw === null || raw === undefined) {
        return 'empty';
    }
    const isChange = key === 'from' || key === 'to';
    if (key === 'role' || (type === 'role_changed' && isChange)) {
        return ROLES.has(raw) ? 'role' : 'raw';
    }
    if (type === 'status_changed' && isChange) {
        return LIFECYCLE.has(raw) ? 'lifecycle' : 'raw';
    }
    if (type === 'registration_setting_changed' && isChange) {
        return typeof raw === 'boolean' ? 'switch' : 'raw';
    }
    return typeof raw === 'boolean' ? 'boolean' : 'raw';
}

/**
 * The `detail` of one event as the list the administrator sees: keys in the
 * order the server sent them, without the ones that carry nothing. A key
 * this build has no wording for still appears (labelled by its own name), so
 * a field added later is never silently hidden.
 */
export function detailEntries(type, detail) {
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
        return [];
    }
    return Object.entries(detail)
        .filter(([, raw]) => raw !== undefined && raw !== null && raw !== '')
        .map(([key, raw]) => ({ key, raw, kind: detailValueKind(type, key, raw) }));
}
