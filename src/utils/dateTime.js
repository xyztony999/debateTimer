import { isPlaceholder } from './authFlow';

// Date and time formatting by INTERFACE language (not the browser's), so a
// column reads the same for everyone who picked the same language. Returns
// null for a missing or unparseable value; callers show their own "—" then.

const STYLES = {
    datetime: { dateStyle: 'medium', timeStyle: 'short' },
    date: { dateStyle: 'medium' },
    // The `title` of a table cell: nothing rounded off.
    full: { dateStyle: 'full', timeStyle: 'long' },
};

function toDate(value) {
    if (value === null || value === undefined || value === '') {
        return null;
    }
    const date = value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

function format(date, lng, options) {
    try {
        return new Intl.DateTimeFormat(lng || undefined, options).format(date);
    } catch {
        return date.toISOString();
    }
}

/** "2026年11月24日 14:05" / "Nov 24, 2026, 2:05 PM" — style: 'datetime' | 'date' | 'full'. */
export function formatDateTime(value, lng, style = 'datetime') {
    const date = toDate(value);
    return date ? format(date, lng, STYLES[style] ?? STYLES.datetime) : null;
}

/**
 * The privacy notice's effective date, or null when it should not be shown:
 * it is empty, or still the "{{PRIVACY_EFFECTIVE_DATE}}" placeholder that is
 * filled in at release time. An ISO day (2026-12-01) is formatted in UTC so
 * it cannot shift to the day before; any other form is shown as written.
 */
export function formatNoticeDate(effectiveDate, lng) {
    if (!effectiveDate || isPlaceholder(effectiveDate)) {
        return null;
    }
    const isoDay = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(effectiveDate).trim());
    if (isoDay) {
        const date = new Date(Date.UTC(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3])));
        return format(date, lng, { dateStyle: 'long', timeZone: 'UTC' });
    }
    return String(effectiveDate).trim();
}
