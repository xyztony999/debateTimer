import { describe, it, expect } from 'bun:test';
import { formatDateTime, formatNoticeDate } from './dateTime.js';

// Fixed instant: 2026-11-24T06:05:00Z. Expected strings depend on the time
// zone of the machine running the test, so they are built with the same
// formatter the code under test uses (TimeZone pinched through env is not
// portable on Windows); what is asserted is language, style and null cases.
const NOV_24 = Date.UTC(2026, 10, 24, 6, 5);

function reference(lng, options) {
    return new Intl.DateTimeFormat(lng, options).format(new Date(NOV_24));
}

describe('formatDateTime', () => {
    it('formats in the interface language, not the browser default', () => {
        expect(formatDateTime(NOV_24, 'zh-Hans')).toBe(reference('zh-Hans', { dateStyle: 'medium', timeStyle: 'short' }));
        expect(formatDateTime(NOV_24, 'fr-CA')).toBe(reference('fr-CA', { dateStyle: 'medium', timeStyle: 'short' }));
        expect(formatDateTime(NOV_24, 'en')).toBe(reference('en', { dateStyle: 'medium', timeStyle: 'short' }));
    });

    it('accepts epoch milliseconds and ISO strings alike', () => {
        expect(formatDateTime(new Date(NOV_24).toISOString(), 'en')).toBe(formatDateTime(NOV_24, 'en'));
    });

    it('rounds nothing off in the full style used for the title attribute', () => {
        const full = formatDateTime(NOV_24, 'en', 'full');
        expect(full).toBe(reference('en', { dateStyle: 'full', timeStyle: 'long' }));
        expect(full).toContain('2026');
    });

    it('returns null for a missing or unparseable value', () => {
        expect(formatDateTime(null, 'en')).toBeNull();
        expect(formatDateTime(undefined, 'en')).toBeNull();
        expect(formatDateTime('', 'en')).toBeNull();
        expect(formatDateTime('not a date', 'en')).toBeNull();
        expect(formatDateTime(NaN, 'en')).toBeNull();
    });
});

describe('formatNoticeDate', () => {
    it('hides the release-time placeholder and an empty date', () => {
        expect(formatNoticeDate('{{PRIVACY_EFFECTIVE_DATE}}', 'en')).toBeNull();
        expect(formatNoticeDate('', 'en')).toBeNull();
        expect(formatNoticeDate(null, 'en')).toBeNull();
    });

    it('formats an ISO day as a long date in the interface language', () => {
        expect(formatNoticeDate('2026-12-01', 'en'))
            .toBe(new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 11, 1))));
        expect(formatNoticeDate('2026-12-01', 'fr-CA')).toMatch(/décembre/i);
        expect(formatNoticeDate('2026-12-01', 'zh-Hans')).toBe('2026年12月1日');
    });

    it('shows a date written in any other form exactly as the operator wrote it', () => {
        expect(formatNoticeDate('December 1, 2026', 'en')).toBe('December 1, 2026');
        expect(formatNoticeDate(' 2026/12/01 ', 'en')).toBe('2026/12/01');
    });
});
