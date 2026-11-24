import { describe, it, expect } from 'bun:test';
import {
    DEFAULT_LOCKOUT_MINUTES,
    attemptsRemainingOf,
    classifyPasswordProofFailure,
    classifySecondFactorFailure,
    currentGateStep,
    groupSecret,
    hasPendingGates,
    isOtpauthUri,
    isPlaceholder,
    isRecoveryCode,
    isSixDigitCode,
    isTotpRequired,
    noticeLanguage,
    normalizeRecoveryCode,
    pendingGatesOf,
    retryAfterMinutes,
    splitConsentLabel,
} from './authFlow.js';

describe('pendingGatesOf / hasPendingGates / currentGateStep', () => {
    it('treats a session without the field as owing nothing', () => {
        expect(pendingGatesOf(undefined)).toEqual([]);
        expect(pendingGatesOf({ id: 'u1', username: 'e2e', role: 'user' })).toEqual([]);
        expect(hasPendingGates({ id: 'u1' })).toBe(false);
        expect(currentGateStep({ id: 'u1' })).toBe('done');
    });

    it('follows the server order: privacy notice first, then mandatory two-step setup', () => {
        const both = { pending: ['totp_enroll', 'privacy_consent'] };
        expect(hasPendingGates(both)).toBe(true);
        expect(currentGateStep(both)).toBe('totp_enroll');
        expect(currentGateStep({ pending: ['privacy_consent', 'totp_enroll'] })).toBe('privacy_consent');
        expect(currentGateStep({ pending: [] })).toBe('done');
    });

    it('reports a step this build does not know instead of picking one', () => {
        expect(currentGateStep({ pending: ['something_new'] })).toBe('unknown');
    });
});

describe('isTotpRequired', () => {
    it('is true only for the second-factor response, which carries a ticket', () => {
        expect(isTotpRequired({ status: 'totp_required', ticket: 'abc', expiresIn: 300 })).toBe(true);
        expect(isTotpRequired({ status: 'totp_required', ticket: '' })).toBe(false);
        expect(isTotpRequired({ status: 'totp_required' })).toBe(false);
    });

    it('is false for a session user', () => {
        expect(isTotpRequired({ status: 'ok', id: 'u1', username: 'a', role: 'user', pending: [] })).toBe(false);
        expect(isTotpRequired(undefined)).toBe(false);
    });
});

describe('isSixDigitCode', () => {
    it('accepts six digits with surrounding whitespace only', () => {
        expect(isSixDigitCode('123456')).toBe(true);
        expect(isSixDigitCode(' 123456 ')).toBe(true);
        expect(isSixDigitCode('12345')).toBe(false);
        expect(isSixDigitCode('1234567')).toBe(false);
        expect(isSixDigitCode('123 45')).toBe(false);
        expect(isSixDigitCode('abcdef')).toBe(false);
        expect(isSixDigitCode('')).toBe(false);
        expect(isSixDigitCode(undefined)).toBe(false);
    });
});

describe('retryAfterMinutes', () => {
    it('rounds a Retry-After value in seconds up to whole minutes, minimum one', () => {
        expect(retryAfterMinutes('1')).toBe(1);
        expect(retryAfterMinutes('60')).toBe(1);
        expect(retryAfterMinutes('61')).toBe(2);
        expect(retryAfterMinutes('900')).toBe(15);
        expect(retryAfterMinutes(119)).toBe(2);
    });

    it('falls back to the default lock-out window when the header is missing or unreadable', () => {
        expect(retryAfterMinutes(undefined)).toBe(15);
        expect(retryAfterMinutes(null)).toBe(15);
        expect(retryAfterMinutes('')).toBe(15);
        expect(retryAfterMinutes('soon')).toBe(15);
        expect(retryAfterMinutes('0')).toBe(15);
        expect(retryAfterMinutes('-5')).toBe(15);
    });
});

describe('groupSecret', () => {
    it('splits a Base32 key into groups of four', () => {
        expect(groupSecret('JBSWY3DPEHPK3PXP')).toBe('JBSW Y3DP EHPK 3PXP');
        expect(groupSecret('JBSWY3DPEHPK3PX')).toBe('JBSW Y3DP EHPK 3PX');
        expect(groupSecret(' JBSW Y3DP ')).toBe('JBSW Y3DP');
    });

    it('handles empty input without throwing', () => {
        expect(groupSecret('')).toBe('');
        expect(groupSecret(undefined)).toBe('');
    });
});

describe('isRecoveryCode', () => {
    it('accepts ten characters with or without the hyphen, any case', () => {
        expect(isRecoveryCode('ABCDE-FGH23')).toBe(true);
        expect(isRecoveryCode('abcde-fgh23')).toBe(true);
        expect(isRecoveryCode(' ABCDEFGH23 ')).toBe(true);
        expect(normalizeRecoveryCode('a-b_c d e f g h 2 3')).toBe('ABCDEFGH23');
    });

    it('rejects codes of another length or empty input', () => {
        expect(isRecoveryCode('ABCDE-FGH2')).toBe(false);
        expect(isRecoveryCode('ABCDE-FGH234')).toBe(false);
        expect(isRecoveryCode('')).toBe(false);
        expect(isRecoveryCode(undefined)).toBe(false);
    });
});

describe('splitConsentLabel', () => {
    it('cuts the sentence around the notice label, case-insensitively', () => {
        expect(splitConsentLabel('I have read and agree to the Privacy Notice', 'Privacy notice'))
            .toEqual({ before: 'I have read and agree to the ', after: '' });
        expect(splitConsentLabel('我已阅读并同意隐私说明', '隐私说明'))
            .toEqual({ before: '我已阅读并同意', after: '' });
        expect(splitConsentLabel('J’ai lu et j’accepte l’avis de confidentialité', 'Avis de confidentialité'))
            .toEqual({ before: 'J’ai lu et j’accepte l’', after: '' });
        expect(splitConsentLabel('Read the notice, then continue.', 'notice'))
            .toEqual({ before: 'Read the ', after: ', then continue.' });
    });

    it('returns the whole sentence unlinked when the label is absent or empty', () => {
        expect(splitConsentLabel('I agree', 'Privacy notice')).toEqual({ before: 'I agree', after: '' });
        expect(splitConsentLabel('I agree', '')).toEqual({ before: 'I agree', after: '' });
        expect(splitConsentLabel(undefined, 'x')).toEqual({ before: '', after: '' });
    });
});

describe('classifySecondFactorFailure', () => {
    it('expired: the pre-login ticket is gone (400 TICKET_INVALID)', () => {
        expect(classifySecondFactorFailure({ success: false, status: 400, code: 'TICKET_INVALID', message: 'x' }))
            .toEqual({ kind: 'expired', message: 'x' });
    });

    it('setupExpired: the key being bound is gone (400 SETUP_EXPIRED)', () => {
        expect(classifySecondFactorFailure({ success: false, status: 400, code: 'SETUP_EXPIRED', message: 'Setup session expired, start again' }))
            .toEqual({ kind: 'setupExpired', message: 'Setup session expired, start again' });
    });

    it('invalid: wrong code or recovery code, with the attempts the server reports', () => {
        // Sign-in (TOTP-VERIFY) …
        expect(classifySecondFactorFailure({
            success: false, status: 401, message: 'Invalid verification code', data: { attemptsRemaining: 3 },
        })).toEqual({ kind: 'invalid', message: 'Invalid verification code', count: 3 });
        // … and binding (TOTP-CONFIRM), which reports the attempts too.
        expect(classifySecondFactorFailure({
            success: false, status: 401, message: 'Invalid verification code', data: { attemptsRemaining: 1 },
        })).toEqual({ kind: 'invalid', message: 'Invalid verification code', count: 1 });
        expect(classifySecondFactorFailure({ success: false, status: 401, message: 'y' }))
            .toEqual({ kind: 'invalid', message: 'y', count: null });
    });

    it('tooMany: locked out, minutes from Retry-After or the default window', () => {
        expect(classifySecondFactorFailure({ success: false, status: 429, message: 'm', retryAfterSec: 119 }))
            .toEqual({ kind: 'tooMany', message: 'm', minutes: 2 });
        // Browser cannot read the header (CORS): default window.
        expect(classifySecondFactorFailure({ success: false, status: 429, message: 'm', retryAfterSec: null }))
            .toEqual({ kind: 'tooMany', message: 'm', minutes: DEFAULT_LOCKOUT_MINUTES });
    });

    it('unavailable: the server has no key configured (503)', () => {
        expect(classifySecondFactorFailure({ success: false, status: 503, code: 'TOTP_UNAVAILABLE', message: 'Two-factor verification is unavailable' }))
            .toEqual({ kind: 'unavailable', message: 'Two-factor verification is unavailable' });
    });

    it('other: everything else, including a malformed code (400) and network failures', () => {
        expect(classifySecondFactorFailure({ success: false, status: 400, message: 'Verification code must be 6 digits' }))
            .toEqual({ kind: 'other', message: 'Verification code must be 6 digits' });
        expect(classifySecondFactorFailure({ success: false, message: 'Login: Network Error' }))
            .toEqual({ kind: 'other', message: 'Login: Network Error' });
        expect(classifySecondFactorFailure(undefined)).toEqual({ kind: 'other', message: '' });
    });
});

describe('isOtpauthUri', () => {
    it('accepts only an otpauth://totp/ link', () => {
        expect(isOtpauthUri('otpauth://totp/Debate%20Timer:alice?secret=JBSWY3DPEHPK3PXP&issuer=Debate%20Timer')).toBe(true);
        expect(isOtpauthUri('https://example.com/?secret=X')).toBe(false);
        expect(isOtpauthUri('javascript:alert(1)')).toBe(false);
        expect(isOtpauthUri('otpauth://hotp/alice?secret=X')).toBe(false);
        expect(isOtpauthUri('')).toBe(false);
        expect(isOtpauthUri(undefined)).toBe(false);
    });
});

describe('classifyPasswordProofFailure', () => {
    it('wrongPassword: the server refuses the password with a bare 400', () => {
        expect(classifyPasswordProofFailure({ success: false, status: 400, message: 'Password is incorrect' }))
            .toEqual({ kind: 'wrongPassword', message: 'Password is incorrect' });
        expect(classifyPasswordProofFailure({ success: false, status: 400, code: 'PASSWORD_REQUIRED', message: 'Password is required to change two-factor settings' }))
            .toEqual({ kind: 'wrongPassword', message: 'Password is required to change two-factor settings' });
    });

    it('unavailable: no key configured on the server (503)', () => {
        expect(classifyPasswordProofFailure({ success: false, status: 503, code: 'TOTP_UNAVAILABLE', message: 'Two-factor authentication is not available on this server' }))
            .toEqual({ kind: 'unavailable', message: 'Two-factor authentication is not available on this server' });
    });

    it('other: a 400 that is not about the password, 403, network failures', () => {
        expect(classifyPasswordProofFailure({ success: false, status: 400, message: 'Two-factor authentication is not enabled' }))
            .toEqual({ kind: 'other', message: 'Two-factor authentication is not enabled' });
        expect(classifyPasswordProofFailure({ success: false, status: 403, message: 'Administrators cannot disable two-factor authentication' }))
            .toEqual({ kind: 'other', message: 'Administrators cannot disable two-factor authentication' });
        expect(classifyPasswordProofFailure(undefined)).toEqual({ kind: 'other', message: '' });
    });
});

describe('attemptsRemainingOf', () => {
    it('reads the count from the failed response data', () => {
        expect(attemptsRemainingOf({ success: false, data: { attemptsRemaining: 3 } })).toBe(3);
        expect(attemptsRemainingOf({ success: false, data: { attemptsRemaining: 0 } })).toBe(0);
    });

    it('is null when the server did not include it', () => {
        expect(attemptsRemainingOf({ success: false, message: 'x' })).toBeNull();
        expect(attemptsRemainingOf({ success: false, data: { attemptsRemaining: '3' } })).toBeNull();
        expect(attemptsRemainingOf(undefined)).toBeNull();
    });
});

describe('noticeLanguage', () => {
    it('maps the UI language onto the languages the notice is served in', () => {
        expect(noticeLanguage('zh-Hans')).toBe('zh-Hans');
        expect(noticeLanguage('zh-CN')).toBe('zh-Hans');
        expect(noticeLanguage('fr-CA')).toBe('fr-CA');
        expect(noticeLanguage('fr')).toBe('fr-CA');
        expect(noticeLanguage('en')).toBe('en');
        expect(noticeLanguage('en-US')).toBe('en');
        expect(noticeLanguage('de')).toBe('en');
        expect(noticeLanguage(undefined)).toBe('en');
    });
});

describe('isPlaceholder', () => {
    it('recognises the unresolved release-time value and nothing else', () => {
        expect(isPlaceholder('{{PRIVACY_EFFECTIVE_DATE}}')).toBe(true);
        expect(isPlaceholder(' {{PRIVACY_EFFECTIVE_DATE}} ')).toBe(true);
        expect(isPlaceholder('2026-12-01')).toBe(false);
        expect(isPlaceholder('')).toBe(false);
        expect(isPlaceholder(undefined)).toBe(false);
    });
});
