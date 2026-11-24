/**
 * Break-glass reset of one account's two-factor verification (R20 D57).
 *
 * For the operator on the server itself: an administrator who lost the
 * authenticator and used up every recovery code has no screen left that can
 * help, so the reset exists as a command-line action that requires shell
 * access to the server. The reset signs the account out everywhere and is
 * recorded in the audit log like any other reset.
 */
import { normalizeUsername } from '../../lib/password.js';
import { CONSENT, recordAudit } from '../../lib/auditLog.js';
import { removeTotp } from '../../lib/totpStore.js';

/**
 * @returns {{ok: boolean, reason?: 'not_found'|'not_enabled', username: string, userId?: object}}
 */
export async function resetTotpByUsername({ users, sessions, auditLogs }, rawUsername) {
    const username = normalizeUsername(rawUsername);
    const user = await users.findOne({ username });
    if (!user) {
        return { ok: false, reason: 'not_found', username };
    }
    if (user.totp?.enabled !== true) {
        return { ok: false, reason: 'not_enabled', username, userId: user._id };
    }

    const { sessionsDestroyed } = await removeTotp(users, sessions, user._id);
    await recordAudit(auditLogs, {
        type: 'totp_reset',
        result: 'success',
        consent: CONSENT.SYSTEM,
        req: null,
        actorUserId: null,
        subjectUserId: user._id,
        detail: { channel: 'cli' },
    });
    return { ok: true, username, userId: user._id, sessionsDestroyed };
}
