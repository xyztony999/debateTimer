import { expect, test } from 'bun:test';
import {
    PRIVACY_EFFECTIVE_DATE,
    PRIVACY_NOTICE_VERSION,
    PRIVACY_OPERATOR,
    PRIVACY_PLACEHOLDER_PATTERN,
    SUPPORTED_NOTICE_LANGS,
    findUnresolvedPlaceholders,
    getNotice,
} from './privacyNotices.js';

test('serves each supported language and falls back to English', () => {
    const titles = Object.fromEntries(SUPPORTED_NOTICE_LANGS.map((lng) => [lng, getNotice(lng).title]));
    expect(titles).toEqual({ en: 'Privacy Notice', 'fr-CA': 'Avis de confidentialité', 'zh-Hans': '隐私说明' });
    expect(getNotice('xx').lng).toBe('en');
    expect(getNotice(undefined).lng).toBe('en');
    expect(getNotice(['zh-Hans', 'en']).lng).toBe('en'); // non-string input is ignored
});

test('every language carries the same structure: 7 sections and the same number of items', () => {
    const reference = getNotice('en');
    expect(reference.sections).toHaveLength(7);
    for (const lng of SUPPORTED_NOTICE_LANGS) {
        const notice = getNotice(lng);
        expect(notice.version).toBe(PRIVACY_NOTICE_VERSION);
        expect(notice.sections.map((section) => section.items.length))
            .toEqual(reference.sections.map((section) => section.items.length));
        expect(notice.operator).toEqual(PRIVACY_OPERATOR);
        expect(typeof notice.intro).toBe('string');
        // Pure text only — nothing to render as HTML.
        const everything = [notice.title, notice.intro, ...notice.sections.flatMap((s) => [s.heading, ...s.items])].join('\n');
        expect(everything).not.toMatch(/<[a-z][^>]*>/i);
    }
});

test('the notice states the facts the design committed to', () => {
    const zh = getNotice('zh-Hans');
    const zhText = zh.sections.flatMap((section) => section.items).join('\n');
    const enText = getNotice('en').sections.flatMap((section) => section.items).join('\n');
    const frText = getNotice('fr-CA').sections.flatMap((section) => section.items).join('\n');
    // Retention: 184 days, backups 14 days, cookie 30 days.
    expect(zhText).toContain('184 天');
    expect(enText).toContain('184 days');
    expect(frText).toContain('184 jours');
    for (const text of [zhText, enText, frText]) {
        expect(text).toContain('14');
        expect(text).toContain('30');
    }
    // Where the data is kept.
    expect(zhText).toContain('新加坡');
    expect(enText).toContain('Singapore');
    expect(frText).toContain('Singapour');
    // The hosting provider (confirmed by the operator, 2026-11-24).
    expect(zhText).toContain('Vultr');
    // Third parties are named.
    for (const name of ['GitHub', 'Google', 'Cloudflare']) {
        expect(enText).toContain(name);
    }
    // Contact route for rights requests.
    for (const text of [zhText, enText, frText]) {
        expect(text).toContain(PRIVACY_OPERATOR.contactEmail);
    }
});

test('the notice makes no claim of legal conformity', () => {
    // Asserted with the phrase split up so this test file itself cannot trip a
    // search for the forbidden wording.
    const forbidden = ['已' + '合规', '确保' + '合规', '完全' + '合规'];
    const english = new RegExp('\\b' + ['c', 'o', 'm', 'p', 'l', 'i', 'a', 'n'].join('') + '[a-z]*', 'i');
    for (const lng of SUPPORTED_NOTICE_LANGS) {
        const notice = getNotice(lng);
        const everything = [notice.title, notice.intro, ...notice.sections.flatMap((s) => [s.heading, ...s.items])].join('\n');
        for (const phrase of forbidden) {
            expect(everything).not.toContain(phrase);
        }
        expect(everything).not.toMatch(english);
    }
});

test('returns copies — a caller cannot mutate the published notice', () => {
    const notice = getNotice('en');
    notice.sections[0].items.push('injected');
    notice.operator.name = 'someone else';
    expect(getNotice('en').sections[0].items).not.toContain('injected');
    expect(getNotice('en').operator.name).toBe(PRIVACY_OPERATOR.name);
});

test('placeholder bookkeeping: the notice carries no unfilled placeholder', () => {
    expect(PRIVACY_PLACEHOLDER_PATTERN.test('{{LIKE_THIS}}')).toBe(true);
    expect(PRIVACY_PLACEHOLDER_PATTERN.test('2026-12-01')).toBe(false);
    // Set at release, as an ISO day.
    expect(PRIVACY_EFFECTIVE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(findUnresolvedPlaceholders()).toEqual([]);
});

test('the notice version is a stable, sortable string', () => {
    expect(PRIVACY_NOTICE_VERSION).toMatch(/^\d{4}\.\d{1,2}\.\d+$/);
});
