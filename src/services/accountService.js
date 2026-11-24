import { apiClient, unwrap } from './apiClient';
import { normalizeTotpCode } from '../utils/authFlow';

// Two-step endpoints answer 401 for a wrong one-time code while the session
// is perfectly valid (S-01 API §3.4). Left alone, the axios interceptor would
// read that 401 as "signed out" and send the user to the login page, so these
// calls opt out of the automatic redirect and report the failure inline.
const skipRedirect = { skipAuthRedirect: true };

/**
 * Two-step verification on the signed-in account (R20, S-01 PRD §5.5).
 *
 * Secrets and recovery codes exist in plain text only in the responses of
 * setup / confirm; nothing here persists them.
 */
export const accountService = {
    /**
     * GET /api/auth/totp/status —
     * `{ available, enabled, enforced, needsPassword, recoveryCodesRemaining }`.
     * `needsPassword` is true when the session is older than the server's
     * recent-sign-in window, i.e. setup must be accompanied by the password.
     */
    getTotpStatus() {
        return unwrap(apiClient.get('/api/auth/totp/status', skipRedirect), 'Two-step status');
    },

    /** POST /api/auth/totp/setup — `{ otpauthUri, secret, expiresIn }`; `password` unless the sign-in is recent. */
    setupTotp(password) {
        return unwrap(
            apiClient.post('/api/auth/totp/setup', password ? { password } : {}, skipRedirect),
            'Two-step setup',
        );
    },

    /**
     * POST /api/auth/totp/confirm — activates the pending key and answers
     * `{ recoveryCodes: string[] }`. This is the only time the codes are
     * available in plain text.
     */
    confirmTotp(code) {
        return unwrap(
            apiClient.post('/api/auth/totp/confirm', { code: normalizeTotpCode(code) }, skipRedirect),
            'Two-step confirm',
        );
    },

    /** POST /api/auth/totp/disable — standard accounts only; always needs the password. */
    disableTotp(password) {
        return unwrap(
            apiClient.post('/api/auth/totp/disable', { password }, skipRedirect),
            'Two-step disable',
        );
    },
};
