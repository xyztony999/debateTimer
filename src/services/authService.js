import { apiClient, unwrap } from './apiClient';
import { normalizeTotpCode } from '../utils/authFlow';

// Calls made while there is no usable session must not trip the 401 → /login
// redirect: the sign-in and gate pages own that decision themselves.
const skipRedirect = { skipAuthRedirect: true };

/**
 * Sign-in, sign-up and the second-factor step.
 *
 * LOGIN has two successful outcomes (S-01 API §3.5):
 *   data.status === 'ok'             a session user: { id, username, role, pending }
 *   data.status === 'totp_required'  no session yet; data.ticket proves the
 *                                    password step and is exchanged by
 *                                    verifyTotp / recoverWithCode.
 */
export const authService = {
    status() {
        return unwrap(apiClient.get('/api/auth/status', skipRedirect), 'Auth status');
    },

    me() {
        return unwrap(apiClient.get('/api/auth/me', skipRedirect), 'Current user');
    },

    login(username, password) {
        return unwrap(
            apiClient.post('/api/auth/login', { username, password }, skipRedirect),
            'Login',
        );
    },

    /**
     * @param {{ agree: boolean, privacyVersion: string }} consent
     *   Agreement to the privacy notice travels with the sign-up request and
     *   names the version that was shown (R20 D50, D63).
     */
    register(username, password, consent) {
        return unwrap(
            apiClient.post('/api/auth/register', {
                username,
                password,
                agree: consent?.agree === true,
                privacyVersion: consent?.privacyVersion ?? '',
            }, skipRedirect),
            'Register',
        );
    },

    logout() {
        return unwrap(apiClient.post('/api/auth/logout', {}, skipRedirect), 'Logout');
    },

    /** Second factor with the 6-digit code. Success answers with a session user. */
    verifyTotp(ticket, code) {
        return unwrap(
            apiClient.post('/api/auth/totp/verify', { ticket, code: normalizeTotpCode(code) }, skipRedirect),
            'Two-step verification',
        );
    },

    /** Second factor with a one-time recovery code (hyphen optional). Success answers with a session user. */
    recoverWithCode(ticket, recoveryCode) {
        return unwrap(
            apiClient.post('/api/auth/totp/recover', { ticket, recoveryCode }, skipRedirect),
            'Recovery code',
        );
    },
};
