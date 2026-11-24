// Pure helpers shared by the sign-in page, the gate page and the settings
// page. No React and no DOM here, so the branches are unit-tested directly.

export const GATE = Object.freeze({
    PRIVACY_CONSENT: 'privacy_consent',
    TOTP_ENROLL: 'totp_enroll',
});

const KNOWN_GATES = [GATE.PRIVACY_CONSENT, GATE.TOTP_ENROLL];

/** Same shape as the server's recovery codes (XXXXX-XXXXX). */
export const RECOVERY_CODE_LENGTH = 10;

/**
 * The server locks an account's second factor after a few failures for a
 * window of (by default) 15 minutes. Used when its `Retry-After` header
 * cannot be read.
 */
export const DEFAULT_LOCKOUT_MINUTES = 15;

/** One of the three languages the privacy notice is served in. */
export const NOTICE_LANGS = Object.freeze(['en', 'fr-CA', 'zh-Hans']);

// The effective date is filled in at release time. Until then the server
// sends a placeholder, which must not be shown as literal "{{...}}" text.
const PLACEHOLDER_RE = /^\{\{[A-Z0-9_]+\}\}$/;

/** Steps an account still owes; always an array, also for sessions without the field. */
export function pendingGatesOf(user) {
    return Array.isArray(user?.pending) ? user.pending : [];
}

/** True when the account may not use the rest of the app yet. */
export function hasPendingGates(user) {
    return pendingGatesOf(user).length > 0;
}

/** True when a successful LOGIN response asks for a second factor instead of starting a session. */
export function isTotpRequired(data) {
    return data?.status === 'totp_required' && typeof data?.ticket === 'string' && data.ticket.length > 0;
}

/**
 * The gate step to show for an account, in the order the server lists them.
 * 'unknown' covers a value this build does not know (a step added later): the
 * page then says it cannot continue instead of rendering nothing.
 */
export function currentGateStep(user) {
    const [first] = pendingGatesOf(user);
    if (!first) {
        return 'done';
    }
    return KNOWN_GATES.includes(first) ? first : 'unknown';
}

/** Six digits once surrounding whitespace is removed; what the server accepts. */
export function normalizeTotpCode(raw) {
    return String(raw ?? '').trim();
}

export function isSixDigitCode(raw) {
    return /^\d{6}$/.test(normalizeTotpCode(raw));
}

/** Recovery code as the server stores and compares it: upper case, letters and digits only. */
export function normalizeRecoveryCode(raw) {
    return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** True for a recovery code of the right length; the hyphen is optional. */
export function isRecoveryCode(raw) {
    return normalizeRecoveryCode(raw).length === RECOVERY_CODE_LENGTH;
}

/**
 * Whole minutes to wait, from a `Retry-After` response header. The header is
 * unreadable when CORS does not expose it, so a positive number is always
 * returned: the server's default lock-out window is the fallback, and
 * anything under a minute counts as one.
 */
export function retryAfterMinutes(raw) {
    const seconds = typeof raw === 'string' ? Number(raw.trim()) : raw;
    if (!Number.isFinite(seconds) || seconds <= 0) {
        return DEFAULT_LOCKOUT_MINUTES;
    }
    return Math.max(1, Math.ceil(seconds / 60));
}

/** 'JBSWY3DPEHPK3PXP' → 'JBSW Y3DP EHPK 3PXP' (groups of four, as authenticator apps show keys). */
export function groupSecret(secret) {
    return String(secret ?? '').replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
}

/** Number of attempts left from a failed second-factor response, or null when the server did not say. */
export function attemptsRemainingOf(result) {
    const value = result?.data?.attemptsRemaining;
    return Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * Sorts a failed sign-up or second-factor response into the one case the page
 * has to handle. The English `message` is carried along for the cases that
 * are shown as is (the server's own wording for an unavailable service or an
 * unforeseen failure).
 *
 *   expired       the pre-login ticket is gone: sign in again
 *   setupExpired  the key being bound is gone: start the binding again
 *   invalid       wrong code / recovery code, with the attempts left
 *   tooMany       locked out for `minutes` (shared by sign-in and binding)
 *   unavailable   two-step verification is not configured on the server
 *   other         anything else
 */
export function classifySecondFactorFailure(result) {
    const message = result?.message || '';
    if (result?.status === 400 && result?.code === 'TICKET_INVALID') {
        return { kind: 'expired', message };
    }
    if (result?.status === 400 && result?.code === 'SETUP_EXPIRED') {
        return { kind: 'setupExpired', message };
    }
    if (result?.status === 401) {
        return { kind: 'invalid', message, count: attemptsRemainingOf(result) };
    }
    if (result?.status === 429) {
        return { kind: 'tooMany', message, minutes: retryAfterMinutes(result?.retryAfterSec) };
    }
    if (result?.status === 503) {
        return { kind: 'unavailable', message };
    }
    return { kind: 'other', message };
}

/** The language to ask the privacy notice in; anything else is asked for in English. */
export function noticeLanguage(i18nLanguage) {
    const raw = String(i18nLanguage ?? '');
    if (raw.startsWith('zh')) {
        return 'zh-Hans';
    }
    if (raw.startsWith('fr')) {
        return 'fr-CA';
    }
    return 'en';
}

export function isPlaceholder(value) {
    return typeof value === 'string' && PLACEHOLDER_RE.test(value.trim());
}

/**
 * True only for an otpauth:// link, the one scheme an authenticator app
 * opens. The link comes from the server and ends up as an `href`, so its
 * scheme is checked before it is used: nothing else (http:, javascript:, …)
 * is ever turned into a link.
 */
export function isOtpauthUri(value) {
    return typeof value === 'string' && /^otpauth:\/\/totp\/[^\s]+$/.test(value);
}

/**
 * Failure of TOTP-SETUP or TOTP-DISABLE, which both hinge on a password proof.
 * The server sends no code for a refused password, so it is recognised by the
 * `PASSWORD_REQUIRED` code or by the wording of the message.
 *
 *   wrongPassword   the password proof was refused
 *   unavailable     two-step verification is not configured on the server
 *   other           anything else (message shown as is)
 */
export function classifyPasswordProofFailure(result) {
    const message = result?.message || '';
    if (result?.status === 503) {
        return { kind: 'unavailable', message };
    }
    if (result?.status === 400 && (result?.code === 'PASSWORD_REQUIRED' || /password/i.test(message))) {
        return { kind: 'wrongPassword', message };
    }
    return { kind: 'other', message };
}

/**
 * Splits the consent sentence around the words that name the privacy notice,
 * so those words can be the link that opens it.
 *   "I have read and agree to the Privacy Notice" + "Privacy notice"
 *     → { before: "I have read and agree to the ", after: "" }
 * A sentence that does not contain them is returned whole and unlinked.
 */
export function splitConsentLabel(sentence, noticeLabel) {
    const text = String(sentence ?? '');
    const needle = String(noticeLabel ?? '');
    if (!needle) {
        return { before: text, after: '' };
    }
    const index = text.toLowerCase().indexOf(needle.toLowerCase());
    if (index < 0) {
        return { before: text, after: '' };
    }
    return { before: text.slice(0, index), after: text.slice(index + needle.length) };
}
