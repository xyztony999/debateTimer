import { apiClient, unwrap } from './apiClient';
import { noticeLanguage } from '../utils/authFlow';

// The notice is public and shown before any form is submitted; a failed
// read must never bounce the visitor to another page.
const skipRedirect = { skipAuthRedirect: true };

/**
 * Privacy notice (R20, S-01 PRD §5.6).
 *
 * The text comes from the server in one of the three interface languages and
 * is rendered as plain text. Its `version` is what a consent record points
 * at, so the version that was shown is the version that gets accepted.
 */
export const privacyService = {
    /** GET /api/privacy/notices/current?lng= — `{ version, effectiveDate, lng, operator, title, intro, sections[] }` */
    getNotice(i18nLanguage) {
        return unwrap(
            apiClient.get('/api/privacy/notices/current', {
                ...skipRedirect,
                params: { lng: noticeLanguage(i18nLanguage) },
            }),
            'Privacy notice',
        );
    },

    /**
     * POST /api/privacy/consent/accept — records agreement to the CURRENT
     * version. A stale `version` is refused with 409 PRIVACY_NOTICE_UPDATED so
     * the client re-reads the notice first. Success answers
     * `{ version, consentedAt, pending }`.
     */
    acceptConsent(version) {
        return unwrap(
            apiClient.post('/api/privacy/consent/accept', { version }, skipRedirect),
            'Privacy consent',
        );
    },
};
