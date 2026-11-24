import { describe, it, expect, beforeEach } from 'bun:test';
import i18n from './i18n';
import en from './locales/en.json';
import frCA from './locales/fr-CA.json';
import zhHans from './locales/zh-Hans.json';
import { AUDIT_EVENT_TYPES, AUDIT_SELF_TYPES } from '../server/lib/auditLog.js';
import { splitConsentLabel } from './utils/authFlow.js';

// Round R20 (privacy notice, two-step verification, audit log): the wording
// is user-facing in three languages, so it is pinned here — every key exists
// in all three files, interpolations resolve, and the event names cover
// exactly the event types the server can record.

const LOCALES = { en, 'fr-CA': frCA, 'zh-Hans': zhHans };
const LANGS = Object.keys(LOCALES);
const R20_PREFIXES = ['auth.privacy', 'auth.totp.', 'privacy.', 'account.', 'audit.'];

function flatten(obj, prefix = '') {
    return Object.entries(obj).flatMap(([key, value]) => (
        value && typeof value === 'object' ? flatten(value, `${prefix}${key}.`) : [`${prefix}${key}`]
    ));
}

function lookup(obj, path) {
    return path.split('.').reduce((node, key) => (node == null ? undefined : node[key]), obj);
}

function r20Strings(locale) {
    return flatten(locale)
        .filter((key) => R20_PREFIXES.some((prefix) => key.startsWith(prefix)))
        .map((key) => [key, lookup(locale, key)]);
}

beforeEach(async () => {
    await i18n.changeLanguage('en');
});

describe('R20 wording exists in all three languages', () => {
    it('has identical key sets in en, fr-CA and zh-Hans', () => {
        const reference = flatten(en).sort();
        expect(flatten(frCA).sort()).toEqual(reference);
        expect(flatten(zhHans).sort()).toEqual(reference);
    });

    it('resolves every R20 key to a translated string, never to the key itself', async () => {
        const keys = flatten(en).filter((key) => R20_PREFIXES.some((prefix) => key.startsWith(prefix)));
        expect(keys.length).toBeGreaterThan(100);
        for (const lang of LANGS) {
            await i18n.changeLanguage(lang);
            for (const key of keys) {
                const text = i18n.t(key);
                // Keys with placeholders keep them when called without values.
                const hasPlaceholders = /\{\{\w+\}\}/.test(lookup(LOCALES[lang], key));
                expect(text === key ? `${lang}:${key} unresolved` : '').toBe('');
                expect(text.trim()).not.toBe('');
                if (!hasPlaceholders) {
                    expect(`${lang}:${key} -> ${text}`).not.toMatch(/\{\{|\}\}/);
                }
            }
        }
    });

    it('keeps the project free of club positioning in the new wording', () => {
        for (const lang of LANGS) {
            for (const [key, text] of r20Strings(LOCALES[lang])) {
                expect(`${lang}:${key}`).not.toBe('UOMDC');
                expect(String(text)).not.toMatch(/UOMDC/i);
            }
        }
    });
});

describe('interpolated R20 strings', () => {
    it('fills the attempts, minutes, page and recovery-code counts in every language', async () => {
        for (const lang of LANGS) {
            await i18n.changeLanguage(lang);
            const samples = [
                ['auth.totp.invalid', { count: 2 }],
                ['auth.totp.invalidRecovery', { count: 2 }],
                ['auth.totp.tooMany', { minutes: 15 }],
                ['auth.privacyVersion', { version: '2026.11.1', date: 'D' }],
                ['auth.privacyVersionOnly', { version: '2026.11.1' }],
                ['auth.privacyOperator', { name: 'N' }],
                ['account.totp.recoveryLeft', { count: 7 }],
                ['account.logins.pageInfo', { page: 1, pages: 2, total: 21 }],
                ['admin.auditPageInfo', { page: 1, pages: 2, total: 21 }],
                ['admin.regLastChanged', { name: 'boss', time: 'T' }],
                ['admin.regNeverSet', { state: 'S' }],
                ['admin.confirmResetTotp', { name: 'bob' }],
            ];
            for (const [key, vars] of samples) {
                const text = i18n.t(key, vars);
                expect(text).not.toMatch(/\{\{|\}\}/);
                expect(text).not.toBe(key);
            }
            expect(i18n.t('auth.totp.invalid', { count: 1 })).toMatch(/1/);
            expect(i18n.t('auth.totp.tooMany', { minutes: 15 })).toMatch(/15/);
        }
    });

    it('uses the singular form of the lock-out message when one minute is left', async () => {
        // `count` drives i18next's plural lookup: 1 → the _one key, anything else → the base key.
        await i18n.changeLanguage('en');
        expect(i18n.t('auth.totp.tooMany', { minutes: 1, count: 1 })).toBe('Too many attempts. Sign in again in 1 minute.');
        expect(i18n.t('auth.totp.tooMany', { minutes: 2, count: 2 })).toBe('Too many attempts. Sign in again in 2 minutes.');
        expect(i18n.t('account.totp.tooMany', { minutes: 1, count: 1 })).toBe('Too many attempts. Try again in 1 minute.');
        expect(i18n.t('account.totp.tooMany', { minutes: 15, count: 15 })).toBe('Too many attempts. Try again in 15 minutes.');

        await i18n.changeLanguage('fr-CA');
        expect(i18n.t('account.totp.tooMany', { minutes: 1, count: 1 })).toBe('Trop de tentatives. Réessayez dans 1 minute.');
        expect(i18n.t('account.totp.tooMany', { minutes: 3, count: 3 })).toBe('Trop de tentatives. Réessayez dans 3 minutes.');

        // Chinese has no singular/plural split: the base key serves every number.
        await i18n.changeLanguage('zh-Hans');
        expect(i18n.t('account.totp.tooMany', { minutes: 1, count: 1 })).toBe('尝试次数过多，请在 1 分钟后再试。');
        expect(i18n.t('account.totp.tooMany', { minutes: 3, count: 3 })).toBe('尝试次数过多，请在 3 分钟后再试。');
    });

    it('names the privacy notice inside the consent sentence so it can be linked', async () => {
        for (const lang of LANGS) {
            await i18n.changeLanguage(lang);
            const sentence = i18n.t('auth.privacyConsent');
            // The linked words are their own key: in Chinese the sentence says
            // "隐私说明" while the link above the form says "查看隐私说明".
            const words = i18n.t('auth.privacyConsentLink');
            expect(words).not.toBe('auth.privacyConsentLink');
            expect(words).not.toBe(i18n.t('auth.privacyNoticeLink'));
            const { before, after } = splitConsentLabel(sentence, words);
            // Something before the link, nothing between the link and the end
            // of the sentence, and re-joining gives the sentence back exactly.
            expect(before.length).toBeGreaterThan(0);
            expect(after).toBe('');
            expect(`${before}${words}${after}`).toBe(sentence);
        }
    });
});

describe('audit wording matches what the server records', () => {
    const eventKeys = Object.keys(en.audit.event).sort();

    it('names every event type the server can record, and nothing else', () => {
        expect(eventKeys).toEqual([...AUDIT_EVENT_TYPES].sort());
    });

    it('has a name for each event type in all three languages', async () => {
        for (const lang of LANGS) {
            await i18n.changeLanguage(lang);
            for (const type of AUDIT_EVENT_TYPES) {
                expect(i18n.t(`audit.event.${type}`)).not.toBe(`audit.event.${type}`);
            }
            for (const group of ['auth', 'privacy', 'account', 'content', 'audit']) {
                expect(i18n.t(`audit.eventGroup.${group}`)).not.toBe(`audit.eventGroup.${group}`);
            }
        }
    });

    it('covers the sign-in history event types and both results', async () => {
        expect(Object.keys(en.audit.login).sort()).toEqual([...AUDIT_SELF_TYPES].sort());
        expect(Object.keys(en.audit.result).sort()).toEqual(['failure', 'success']);
        for (const lang of LANGS) {
            await i18n.changeLanguage(lang);
            for (const type of AUDIT_SELF_TYPES) {
                expect(i18n.t(`audit.login.${type}`)).not.toBe(`audit.login.${type}`);
            }
            expect(i18n.t('audit.result.success')).not.toBe('audit.result.success');
            expect(i18n.t('audit.result.failure')).not.toBe('audit.result.failure');
        }
    });
});
