import { Router } from 'express';
import {
    hashPassword,
    normalizeUsername,
    validatePassword,
    validateUsername,
    verifyPassword,
} from '../lib/password.js';
import {
    isRegistrationOpen,
    parseAllowRegistration,
    publicUser,
    REGISTRATION_SETTING_ID,
} from '../lib/authPolicy.js';
import { migrateLegacyConfigurations } from '../lib/migrateConfigurations.js';
import {
    createLoginRateLimiter,
    createRegisterRateLimiter,
    createTotpAttemptLimiter,
} from '../lib/rateLimits.js';
import {
    createSession,
    destroyOtherUserSessions,
    destroySession,
    getCookieOptions,
    SESSION_COOKIE_NAME,
} from '../lib/session.js';
import { CONSENT, consentOf, createAuditRecorder } from '../lib/auditLog.js';
import { decryptSecret, encryptSecret, isTotpReady } from '../lib/totpCrypto.js';
import {
    buildOtpauthUri,
    findMatchingStep,
    formatRecoveryCode,
    generateRecoveryCodes,
    generateSecret,
    hashRecoveryCode,
    isSixDigitCode,
    isValidRecoveryCode,
    normalizeRecoveryCode,
    toBase32,
} from '../lib/totp.js';
import {
    activateTotp,
    clearTotp,
    consumeRecoveryCode,
    consumeTotpStep,
    countRecoveryCodes,
    setPendingTotp,
} from '../lib/totpStore.js';
import { createPreloginTickets, TICKET_TTL_MS } from '../lib/preloginTickets.js';
import { pendingGates } from '../lib/authGates.js';
import { PRIVACY_NOTICE_VERSION } from '../lib/privacyNotices.js';
import { parseObjectId } from '../lib/ids.js';

const USERNAME_RE = /^[a-z0-9_]{3,32}$/;
const RECENT_PASSWORD_WINDOW_MS = 600_000;
const PENDING_ENROLL_TTL_MS = 600_000;
const TOO_MANY_ATTEMPTS_MESSAGE = 'Too many verification attempts, please try again later';

// Failures carry an optional machine-readable `code` (and `data`) next to the
// user-facing `message`; clients branch on the code, never on the message.
function fail(res, status, message, extra = {}) {
    return res.status(status).json({ success: false, message, ...extra });
}

// Fallback for when the router is mounted without the app's auth middleware
// (isolated harnesses that only set req.user): production always injects the
// real one, which also attaches the full account document on req.authUser.
function makeFallbackRequireAuth(users) {
    return async function fallbackRequireAuth(req, res, next) {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }
            if (!req.authUser) {
                const id = parseObjectId(req.user.id);
                req.authUser = id ? await users.findOne({ _id: id }) : null;
                if (!req.authUser) {
                    res.status(401).json({ success: false, message: 'Authentication required' });
                    return;
                }
            }
            next();
        } catch (error) {
            next(error);
        }
    };
}

export function createAuthRouter({
    users,
    sessions,
    configurations,
    appSettings,
    auditLogs,
    requireAuth,
    totpAttemptLimiter = createTotpAttemptLimiter(),
    tickets = createPreloginTickets(),
}) {
    const router = Router();
    const audit = createAuditRecorder(auditLogs);
    const authenticated = requireAuth ?? makeFallbackRequireAuth(users);

    // Credential endpoints get strict per-IP limits (env-tunable, see
    // server/.env.example): login is the only anonymous password check, so it
    // gets a brute-force brake on top of bcrypt; register stays counted even
    // while registration is closed. status/logout/me stay unlimited so a
    // rate-limited client can still log out cleanly.
    const loginLimit = createLoginRateLimiter();
    const registerLimit = createRegisterRateLimiter();

    async function registrationState() {
        // One read per request: /status and /register share this snapshot so
        // the first-user role decision and the toggle can't disagree. The
        // admin-managed app_settings doc (singleton _id) wins over env when
        // present; without appSettings injected, behavior is env-only.
        const [userCount, setting] = await Promise.all([
            users.countDocuments(),
            appSettings
                ? appSettings.findOne({ _id: REGISTRATION_SETTING_ID })
                : Promise.resolve(null),
        ]);
        return {
            hasUsers: userCount > 0,
            registrationOpen: isRegistrationOpen(
                userCount,
                parseAllowRegistration(process.env.ALLOW_REGISTRATION),
                setting?.registrationOpen,
            ),
        };
    }

    // The shape every "you are signed in" response shares (R20): the public
    // projection plus the post-login steps the account still owes.
    function sessionUser(userDoc) {
        return {
            status: 'ok',
            ...publicUser(userDoc),
            pending: pendingGates(userDoc),
        };
    }

    // Creates the session and records it. The audit write is awaited before
    // the cookie goes out, so a sign-in that cannot be recorded does not
    // hand out a session.
    async function signIn(req, res, userDoc, { status = 200, extra = {} } = {}) {
        const token = await createSession(sessions, userDoc._id);
        await audit.record({
            type: 'login_succeeded',
            result: 'success',
            consent: consentOf(userDoc),
            req,
            actorUserId: userDoc._id,
            subjectUserId: userDoc._id,
        });
        res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
        res.status(status).json({ success: true, data: { ...sessionUser(userDoc), ...extra } });
    }

    router.get('/status', async (_req, res) => {
        try {
            res.json({ success: true, data: await registrationState() });
        } catch (error) {
            console.error('GET /api/auth/status', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/register', registerLimit, async (req, res) => {
        try {
            const state = await registrationState();
            if (!state.registrationOpen) {
                res.status(403).json({ success: false, message: 'Registration is closed' });
                return;
            }

            // Consent to the privacy notice must arrive WITH the sign-up
            // request and name the current notice version (R20 D50, D63).
            if (req.body?.agree !== true) {
                fail(res, 400, 'Privacy notice consent is required', { code: 'PRIVACY_CONSENT_REQUIRED' });
                return;
            }
            if (req.body?.privacyVersion !== PRIVACY_NOTICE_VERSION) {
                fail(res, 409, 'Privacy notice has been updated, please review and consent again', {
                    code: 'PRIVACY_NOTICE_UPDATED',
                });
                return;
            }

            const username = normalizeUsername(req.body?.username);
            const password = req.body?.password;
            const usernameError = validateUsername(username);
            const passwordError = validatePassword(password);
            if (usernameError || passwordError) {
                res.status(400).json({ success: false, message: usernameError || passwordError });
                return;
            }

            const existing = await users.findOne({ username });
            if (existing) {
                res.status(409).json({ success: false, message: 'Username already taken' });
                return;
            }

            const isFirstUser = !state.hasUsers;
            const now = Date.now();
            const result = await users.insertOne({
                username,
                passwordHash: await hashPassword(password),
                role: isFirstUser ? 'admin' : 'user',
                disabled: false,
                createdAt: now,
                privacy: { version: PRIVACY_NOTICE_VERSION, consentedAt: new Date() },
            });

            if (isFirstUser && configurations) {
                const migrated = await migrateLegacyConfigurations(configurations, users);
                if (migrated.migrated) {
                    console.log(`Migrated ${migrated.migrated} legacy configuration(s) to first admin`);
                }
            }

            const user = await users.findOne({ _id: result.insertedId });
            await audit.record({
                type: 'registered',
                result: 'success',
                consent: CONSENT.CONSENTED,
                req,
                actorUserId: user._id,
                subjectUserId: user._id,
                detail: { role: user.role },
            });
            await audit.record({
                type: 'privacy_consented',
                result: 'success',
                consent: CONSENT.CONSENTED,
                req,
                actorUserId: user._id,
                subjectUserId: user._id,
                detail: { version: PRIVACY_NOTICE_VERSION, channel: 'register' },
            });

            const token = await createSession(sessions, user._id);
            res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
            res.status(201).json({ success: true, data: sessionUser(user) });
        } catch (error) {
            console.error('POST /api/auth/register', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/login', loginLimit, async (req, res) => {
        try {
            const username = normalizeUsername(req.body?.username);
            const password = req.body?.password;
            const user = await users.findOne({ username });
            if (!user || !(await verifyPassword(password, user.passwordHash))) {
                // Nonexistent account and wrong password are one
                // indistinguishable 401 — in the audit log too. A typed
                // username is only kept when it is well-formed and no such
                // account exists (it is the probe's input, not anyone's data).
                await audit.record({
                    type: 'login_failed',
                    result: 'failure',
                    consent: CONSENT.ANONYMOUS_ATTEMPT,
                    req,
                    subjectUserId: user?._id ?? null,
                    detail: {
                        reason: 'invalid_credentials',
                        ...(!user && USERNAME_RE.test(username) ? { attemptedUsername: username } : {}),
                    },
                });
                res.status(401).json({ success: false, message: 'Invalid username or password' });
                return;
            }
            if (user.disabled) {
                await audit.record({
                    type: 'login_failed',
                    result: 'failure',
                    consent: consentOf(user),
                    req,
                    actorUserId: user._id,
                    subjectUserId: user._id,
                    detail: { reason: 'account_disabled' },
                });
                res.status(403).json({ success: false, message: 'Account is disabled' });
                return;
            }

            // Second factor: no session until the code is verified. The
            // ticket only proves the password step; it lives in memory.
            if (user.totp?.enabled === true) {
                if (!isTotpReady()) {
                    fail(res, 503, 'Two-factor verification is unavailable', { code: 'TOTP_UNAVAILABLE' });
                    return;
                }
                const ticket = tickets.issue(user._id);
                res.json({
                    success: true,
                    data: { status: 'totp_required', ticket, expiresIn: TICKET_TTL_MS / 1000 },
                });
                return;
            }

            await signIn(req, res, user);
        } catch (error) {
            console.error('POST /api/auth/login', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/logout', async (req, res) => {
        try {
            await destroySession(sessions, req.cookies?.[SESSION_COOKIE_NAME]);
            res.clearCookie(SESSION_COOKIE_NAME, { ...getCookieOptions(), maxAge: 0 });
            res.json({ success: true });
        } catch (error) {
            console.error('POST /api/auth/logout', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/me', (req, res) => {
        try {
            if (!req.user) {
                res.status(401).json({ success: false, message: 'Authentication required' });
                return;
            }
            // req.authUser is the full document when the real auth middleware
            // ran; without it there is nothing to derive, so no steps are owed.
            const data = req.authUser
                ? sessionUser(req.authUser)
                : { status: 'ok', ...req.user, pending: [] };
            res.json({ success: true, data });
        } catch (error) {
            console.error('GET /api/auth/me', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // --- Two-factor verification (R20, S-01 PRD §5.5) ----------------------

    // "The password was proven recently": a session created within the last
    // ten minutes, or the password supplied again in the request.
    function needsPasswordProof(req) {
        const createdAt = req.sessionCreatedAt;
        if (createdAt instanceof Date && Date.now() - createdAt.getTime() <= RECENT_PASSWORD_WINDOW_MS) {
            return true;
        }
        if (typeof createdAt === 'number' && Date.now() - createdAt <= RECENT_PASSWORD_WINDOW_MS) {
            return true;
        }
        return false;
    }

    async function verifyPasswordProof(req, res) {
        const password = req.body?.password;
        if (typeof password !== 'string' || password.length === 0) {
            fail(res, 400, 'Password is required to change two-factor settings', {
                code: 'PASSWORD_REQUIRED',
            });
            return false;
        }
        if (!(await verifyPassword(password, req.authUser.passwordHash))) {
            fail(res, 400, 'Password is incorrect');
            return false;
        }
        return true;
    }

    router.get('/totp/status', authenticated, (req, res) => {
        const user = req.authUser;
        if (!user) {
            fail(res, 401, 'Authentication required');
            return;
        }
        const enabled = user.totp?.enabled === true;
        res.setHeader('Cache-Control', 'no-store');
        res.json({
            success: true,
            data: {
                available: isTotpReady(),
                enabled,
                enforced: user.role === 'admin',
                needsPassword: !needsPasswordProof(req),
                recoveryCodesRemaining: enabled ? countRecoveryCodes(user) : null,
            },
        });
    });

    router.post('/totp/setup', authenticated, async (req, res) => {
        try {
            if (!isTotpReady()) {
                fail(res, 503, 'Two-factor authentication is not available on this server', {
                    code: 'TOTP_UNAVAILABLE',
                });
                return;
            }
            // Turning on (or re-binding) two-factor verification for an
            // account proves control of it: require a recent password proof so
            // someone at an unlocked device cannot enroll their own phone.
            if (needsPasswordProof(req) || await verifyPasswordProof(req, res)) {
                const user = req.authUser;
                const secret = generateSecret();
                const envelope = encryptSecret(user._id, secret);
                const pending = { ...envelope, expiresAt: new Date(Date.now() + PENDING_ENROLL_TTL_MS) };
                await setPendingTotp(users, user._id, pending);

                const secretBase32 = toBase32(secret);
                res.setHeader('Cache-Control', 'no-store');
                res.json({
                    success: true,
                    data: {
                        otpauthUri: buildOtpauthUri(user.username, secretBase32),
                        secret: secretBase32,
                        expiresIn: PENDING_ENROLL_TTL_MS / 1000,
                    },
                });
            }
        } catch (error) {
            console.error('POST /api/auth/totp/setup', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/totp/confirm', authenticated, async (req, res) => {
        try {
            if (!isTotpReady()) {
                fail(res, 503, 'Two-factor authentication is not available on this server', {
                    code: 'TOTP_UNAVAILABLE',
                });
                return;
            }
            const user = req.authUser;
            const pending = user.totp?.pending;
            const pendingAlive = pending
                && typeof pending.secretEnc === 'string'
                && pending.expiresAt instanceof Date
                && pending.expiresAt.getTime() > Date.now();
            if (!pendingAlive) {
                fail(res, 400, 'Setup session expired, start again', { code: 'SETUP_EXPIRED' });
                return;
            }
            const code = String(req.body?.code ?? '');
            if (!isSixDigitCode(code)) {
                fail(res, 400, 'Verification code must be 6 digits');
                return;
            }

            // Same brake as the sign-in step (D56): the confirm code is a
            // six-digit secret too, and a session that slipped out must not be
            // free to guess it across the enrolment window. The counter is
            // shared with verify / recover for this account.
            const accountKey = String(user._id);
            const blocked = totpAttemptLimiter.isBlocked(accountKey);
            if (blocked.blocked) {
                tooManyAttempts(res, blocked.retryAfterSec);
                return;
            }

            let step = null;
            try {
                step = findMatchingStep(decryptSecret(user._id, pending), code);
            } catch {
                step = null; // wrong key / corrupted envelope: treated as a non-matching code
            }
            if (step === null) {
                await audit.record({
                    type: 'totp_failed',
                    result: 'failure',
                    consent: consentOf(user),
                    req,
                    actorUserId: user._id,
                    subjectUserId: user._id,
                    detail: { method: 'code' },
                });
                const outcome = totpAttemptLimiter.recordFailure(accountKey);
                if (outcome.blocked) {
                    tooManyAttempts(res, outcome.retryAfterSec);
                    return;
                }
                fail(res, 401, 'Invalid verification code', { data: { attemptsRemaining: outcome.remaining } });
                return;
            }

            const codes = generateRecoveryCodes();
            const wasEnabled = user.totp?.enabled === true;
            const activated = await activateTotp(users, user._id, pending.secretEnc, {
                enabled: true,
                secretEnc: pending.secretEnc,
                iv: pending.iv,
                authTag: pending.authTag,
                boundAt: new Date(),
                lastUsedStep: step,
                recoveryCodeHashes: codes.map(hashRecoveryCode),
            });
            if (!activated) {
                // The pending secret was replaced by a newer setup attempt.
                fail(res, 400, 'Setup session expired, start again', { code: 'SETUP_EXPIRED' });
                return;
            }
            totpAttemptLimiter.reset(accountKey);

            // Enrolling (or re-enrolling) kicks every other device out.
            await destroyOtherUserSessions(sessions, user._id, req.sessionTokenHash);
            await audit.record({
                type: 'totp_bound',
                result: 'success',
                consent: consentOf(user),
                req,
                actorUserId: user._id,
                subjectUserId: user._id,
                detail: {
                    channel: user.role === 'admin' && !wasEnabled ? 'forced_enrollment' : 'self',
                    rebind: wasEnabled,
                    recoveryCodeCount: codes.length,
                },
            });

            // The recovery codes exist in plain text only in this response.
            res.setHeader('Cache-Control', 'no-store');
            res.json({ success: true, data: { recoveryCodes: codes.map(formatRecoveryCode) } });
        } catch (error) {
            console.error('POST /api/auth/totp/confirm', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/totp/disable', authenticated, async (req, res) => {
        try {
            const user = req.authUser;
            if (user.role === 'admin') {
                fail(res, 403, 'Administrators cannot disable two-factor authentication');
                return;
            }
            if (user.totp?.enabled !== true) {
                fail(res, 400, 'Two-factor authentication is not enabled');
                return;
            }
            // Always requires the password, however young the session: turning
            // the second factor off is the downgrade an intruder wants.
            if (!(await verifyPasswordProof(req, res))) {
                return;
            }
            await clearTotp(users, user._id);
            await audit.record({
                type: 'totp_unbound',
                result: 'success',
                consent: consentOf(user),
                req,
                actorUserId: user._id,
                subjectUserId: user._id,
                detail: { channel: 'self' },
            });
            res.json({ success: true, data: { enabled: false } });
        } catch (error) {
            console.error('POST /api/auth/totp/disable', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    // Resolves a pre-login ticket to the account that owes a second factor.
    // Responds with 400 itself when the ticket is missing or expired.
    async function accountForTicket(req, res) {
        const userId = tickets.peek(req.body?.ticket);
        if (!userId) {
            fail(res, 400, 'Verification session expired or invalid', { code: 'TICKET_INVALID' });
            return null;
        }
        const user = await users.findOne({ _id: userId });
        if (!user || user.disabled || user.totp?.enabled !== true) {
            tickets.revoke(req.body.ticket);
            fail(res, 400, 'Verification session expired or invalid', { code: 'TICKET_INVALID' });
            return null;
        }
        return user;
    }

    function secondFactorUnavailable(res) {
        return fail(res, 503, 'Two-factor verification is unavailable', { code: 'TOTP_UNAVAILABLE' });
    }

    function tooManyAttempts(res, retryAfterSec) {
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({ success: false, message: TOO_MANY_ATTEMPTS_MESSAGE });
    }

    // Shared tail of the two second-factor endpoints: revoke the ticket,
    // clear the failure counter, audit, then establish the session.
    async function completeSecondFactor(req, res, user, { type, detail, extra = {} }) {
        tickets.revoke(req.body.ticket);
        totpAttemptLimiter.reset(String(user._id));
        const fresh = await users.findOne({ _id: user._id });
        await audit.record({
            type,
            result: 'success',
            consent: consentOf(fresh),
            req,
            actorUserId: user._id,
            subjectUserId: user._id,
            detail,
        });
        await signIn(req, res, fresh, { extra });
    }

    async function rejectSecondFactor(req, res, user, ticket, method, message) {
        const outcome = totpAttemptLimiter.recordFailure(String(user._id));
        await audit.record({
            type: 'totp_failed',
            result: 'failure',
            consent: CONSENT.ANONYMOUS_ATTEMPT,
            req,
            subjectUserId: user._id,
            detail: { method },
        });
        if (outcome.blocked) {
            tickets.revoke(ticket);
            tooManyAttempts(res, outcome.retryAfterSec);
            return;
        }
        fail(res, 401, message, { data: { attemptsRemaining: outcome.remaining } });
    }

    router.post('/totp/verify', async (req, res) => {
        try {
            const user = await accountForTicket(req, res);
            if (!user) {
                return;
            }
            if (!isSixDigitCode(req.body?.code)) {
                fail(res, 400, 'Verification code must be 6 digits');
                return;
            }
            const blocked = totpAttemptLimiter.isBlocked(String(user._id));
            if (blocked.blocked) {
                tickets.revoke(req.body.ticket);
                tooManyAttempts(res, blocked.retryAfterSec);
                return;
            }
            if (!isTotpReady()) {
                secondFactorUnavailable(res);
                return;
            }

            let step = null;
            try {
                const secret = decryptSecret(user._id, user.totp);
                step = findMatchingStep(secret, req.body.code, {
                    minStepExclusive: Number.isFinite(user.totp.lastUsedStep)
                        ? user.totp.lastUsedStep
                        : -Infinity,
                });
            } catch {
                step = null;
            }
            const consumed = step !== null
                && await consumeTotpStep(users, user._id, user.totp.secretEnc, step);
            if (!consumed) {
                await rejectSecondFactor(req, res, user, req.body.ticket, 'code', 'Invalid verification code');
                return;
            }
            await completeSecondFactor(req, res, user, { type: 'totp_succeeded', detail: {} });
        } catch (error) {
            console.error('POST /api/auth/totp/verify', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.post('/totp/recover', async (req, res) => {
        try {
            const user = await accountForTicket(req, res);
            if (!user) {
                return;
            }
            const code = normalizeRecoveryCode(req.body?.recoveryCode);
            if (!isValidRecoveryCode(code)) {
                fail(res, 400, 'Recovery code must be 10 characters');
                return;
            }
            const blocked = totpAttemptLimiter.isBlocked(String(user._id));
            if (blocked.blocked) {
                tickets.revoke(req.body.ticket);
                tooManyAttempts(res, blocked.retryAfterSec);
                return;
            }
            if (!isTotpReady()) {
                secondFactorUnavailable(res);
                return;
            }

            const remainingBefore = countRecoveryCodes(user) ?? 1;
            const used = await consumeRecoveryCode(users, user._id, hashRecoveryCode(code));
            if (!used) {
                await rejectSecondFactor(req, res, user, req.body.ticket, 'recovery_code', 'Invalid recovery code');
                return;
            }
            // The response tells the user how many codes are left (0 = "rebind").
            await completeSecondFactor(req, res, user, {
                type: 'recovery_code_used',
                detail: { remaining: Math.max(0, remainingBefore - 1) },
                extra: { recoveryCodesRemaining: Math.max(0, remainingBefore - 1) },
            });
        } catch (error) {
            console.error('POST /api/auth/totp/recover', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}
