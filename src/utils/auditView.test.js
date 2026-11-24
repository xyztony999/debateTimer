import { describe, it, expect } from 'bun:test';
import {
    AUDIT_EVENT_GROUPS,
    AUDIT_EVENT_TYPES,
    buildAuditQuery,
    detailEntries,
    detailValueKind,
    hasInvalidRange,
    localInputToEpochMs,
    pageCount,
} from './auditView.js';

describe('audit event types', () => {
    it('lists the twenty server event types exactly once each', () => {
        expect(AUDIT_EVENT_TYPES).toHaveLength(20);
        expect(new Set(AUDIT_EVENT_TYPES).size).toBe(20);
        for (const group of AUDIT_EVENT_GROUPS) {
            for (const type of group.types) {
                expect(AUDIT_EVENT_TYPES).toContain(type);
            }
        }
    });

    it('keeps the five groups in display order', () => {
        expect(AUDIT_EVENT_GROUPS.map((group) => group.id)).toEqual(['auth', 'privacy', 'account', 'content', 'audit']);
    });
});

describe('pageCount', () => {
    it('is at least one page, also for an empty or missing total', () => {
        expect(pageCount(0, 20)).toBe(1);
        expect(pageCount(undefined, 20)).toBe(1);
        expect(pageCount(-3, 20)).toBe(1);
    });

    it('rounds up to whole pages', () => {
        expect(pageCount(20, 20)).toBe(1);
        expect(pageCount(21, 20)).toBe(2);
        expect(pageCount(40, 20)).toBe(2);
    });
});

describe('localInputToEpochMs', () => {
    it('reads a datetime-local value as local time and returns epoch milliseconds', () => {
        const local = new Date(2026, 10, 24, 14, 30).getTime();
        expect(localInputToEpochMs('2026-11-24T14:30')).toBe(local);
    });

    it('returns null for an empty or unparseable value', () => {
        expect(localInputToEpochMs('')).toBeNull();
        expect(localInputToEpochMs(undefined)).toBeNull();
        expect(localInputToEpochMs('not a date')).toBeNull();
    });
});

describe('hasInvalidRange', () => {
    it('is false while at most one end is set', () => {
        expect(hasInvalidRange({})).toBe(false);
        expect(hasInvalidRange({ from: '2026-11-01T00:00' })).toBe(false);
        expect(hasInvalidRange({ to: '2026-11-30T00:00' })).toBe(false);
    });

    it('is true when the start is not before the end', () => {
        expect(hasInvalidRange({ from: '2026-11-30T00:00', to: '2026-11-01T00:00' })).toBe(true);
        expect(hasInvalidRange({ from: '2026-11-01T00:00', to: '2026-11-01T00:00' })).toBe(true);
        expect(hasInvalidRange({ from: '2026-11-01T00:00', to: '2026-11-02T00:00' })).toBe(false);
    });
});

describe('buildAuditQuery', () => {
    it('sends only paging when nothing is filtered', () => {
        expect(buildAuditQuery({})).toEqual({ page: 1, pageSize: 20 });
    });

    it('drops empty and blank filters and trims the rest', () => {
        expect(buildAuditQuery({ type: '  ', username: '  alice ', result: '', from: '', to: undefined }, 2))
            .toEqual({ page: 2, pageSize: 20, username: 'alice' });
    });

    it('converts the time inputs to epoch milliseconds', () => {
        const from = new Date(2026, 10, 1, 9, 0).getTime();
        const to = new Date(2026, 10, 30, 18, 30).getTime();
        expect(buildAuditQuery({ from: '2026-11-01T09:00', to: '2026-11-30T18:30' }))
            .toEqual({ page: 1, pageSize: 20, from, to });
    });

    it('refuses to build a query for an invalid range', () => {
        expect(buildAuditQuery({ from: '2026-11-30T00:00', to: '2026-11-01T00:00' })).toBeNull();
    });
});

describe('detailEntries', () => {
    it('returns nothing for a missing or empty detail', () => {
        expect(detailEntries('login_succeeded', undefined)).toEqual([]);
        expect(detailEntries('login_succeeded', {})).toEqual([]);
        expect(detailEntries('login_succeeded', [])).toEqual([]);
    });

    it('keeps the keys in order and drops the ones that carry nothing', () => {
        expect(detailEntries('totp_bound', { channel: 'self', rebind: false, recoveryCodeCount: 10, version: null }))
            .toEqual([
                { key: 'channel', raw: 'self', kind: 'raw' },
                { key: 'rebind', raw: false, kind: 'boolean' },
                { key: 'recoveryCodeCount', raw: 10, kind: 'raw' },
            ]);
    });

    it('recognises roles and lifecycle states only where they mean that', () => {
        expect(detailEntries('role_changed', { from: 'user', to: 'admin' }).map((entry) => entry.kind)).toEqual(['role', 'role']);
        expect(detailEntries('registered', { role: 'admin' })[0].kind).toBe('role');
        expect(detailEntries('status_changed', { from: 'enabled', to: 'disabled' }).map((entry) => entry.kind))
            .toEqual(['lifecycle', 'lifecycle']);
        // The same words under another event stay raw text.
        expect(detailEntries('something_else', { from: 'user', to: 'admin' })[0].kind).toBe('raw');
    });
});

describe('detailValueKind', () => {
    it('maps the registration switch to open or closed', () => {
        expect(detailValueKind('registration_setting_changed', 'from', null)).toBe('empty');
        expect(detailValueKind('registration_setting_changed', 'from', false)).toBe('switch');
        expect(detailValueKind('registration_setting_changed', 'to', true)).toBe('switch');
    });

    it('keeps an unknown value raw instead of guessing a meaning', () => {
        expect(detailValueKind('role_changed', 'from', 'owner')).toBe('raw');
        expect(detailValueKind('status_changed', 'to', 'paused')).toBe('raw');
    });
});
