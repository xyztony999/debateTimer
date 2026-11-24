import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomBytes } from 'node:crypto';
import cookieParser from 'cookie-parser';
import express from 'express';
import { ObjectId } from 'mongodb';
import { createAuthMiddleware } from '../lib/authMiddleware.js';
import { createEnforceGates, GATE_REQUIRED_CODE } from '../lib/authGates.js';
import { createFakeCollection } from '../test/fakeCollection.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { hashSessionToken } from '../lib/session.js';
import { decryptSecret, encryptSecret, TOTP_KEY_ENV } from '../lib/totpCrypto.js';
import { currentStep, hashRecoveryCode, hotp } from '../lib/totp.js';
import { PRIVACY_NOTICE_VERSION } from '../lib/privacyNotices.js';
import { createAuditRouter } from './audit.js';
import { createAuthRouter } from './auth.js';
import { createPrivacyRouter } from './privacy.js';

// End-to-end behaviour of the R20 security additions over real HTTP: the real
// auth middleware, the post-login gate middleware and the auth / privacy /
// audit routers, mounted the way server/index.js mounts them, on top of fake
// collections. trust proxy 1 mirrors production, so tests steer req.ip with
// x-forwarded-for. Accounts seeded WITHOUT a `privacy` field stand for the
// documents that already exist in the live database.

const PASSWORD = 'password123';
const TEST_KEY = randomBytes(32).toString('base64');
const DAY_MS = 24 * 60 * 60 * 1000;
const RETENTION_MS = 184 * DAY_MS;
const SAVED_ENV = {};
const ENV_KEYS = [
    TOTP_KEY_ENV, 'TOTP_ATTEMPT_RATE_WINDOW_MS', 'TOTP_ATTEMPT_RATE_MAX',
    'ALLOW_REGISTRATION', 'AUTH_LOGIN_RATE_MAX', 'AUTH_REGISTER_RATE_MAX',
];

let passwordHash;

beforeAll(async () => {
    for (const key of ENV_KEYS) {
        SAVED_ENV[key] = process.env[key];
        delete process.env[key];
    }
    process.env[TOTP_KEY_ENV] = TEST_KEY;
    passwordHash = await hashPassword(PASSWORD);
});

afterAll(() => {
    for (const key of ENV_KEYS) {
        if (SAVED_ENV[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = SAVED_ENV[key];
        }
    }
});

function buildWorld() {
    const world = {
        users: createFakeCollection(),
        sessions: createFakeCollection(),
        auditLogs: createFakeCollection(),
        appSettings: createFakeCollection([
            { _id: 'registration', registrationOpen: true, updatedAt: 1, updatedBy: 'boss' },
        ]),
    };
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use(cookieParser());
    const { attachUser, requireAuth, requireAdmin } = createAuthMiddleware({
        users: world.users,
        sessions: world.sessions,
    });
    app.use(attachUser);
    app.use('/api', createEnforceGates());
    app.use('/api/auth', createAuthRouter({
        users: world.users, sessions: world.sessions, appSettings: world.appSettings,
        auditLogs: world.auditLogs, requireAuth,
    }));
    app.use('/api/privacy', createPrivacyRouter({ users: world.users, auditLogs: world.auditLogs, requireAuth }));
    app.use('/api/audit', createAuditRouter({
        auditLogs: world.auditLogs, users: world.users, requireAuth, requireAdmin,
    }));
    return { world, app };
}

// Independent Base32 decoder (mirrors the one in totp.test.js).
function fromBase32(encoded) {
    let bits = 0;
    let value = 0;
    const bytes = [];
    for (const char of encoded) {
        value = (value << 5) | 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(char);
        bits += 5;
        if (bits >= 8) {
            bytes.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(bytes);
}

let counter = 0;
// Every test gets its own world so limiter buckets and audit state never leak.
async function startWorld() {
    counter += 1;
    const { world, app } = buildWorld();
    const server = await new Promise((resolve) => {
        const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const ip = `203.0.113.${counter}`;

    async function call(method, path, { body, cookie, ip: address = ip } = {}) {
        return fetch(`${base}${path}`, {
            method,
            headers: {
                ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
                'x-forwarded-for': address,
                ...(cookie ? { cookie } : {}),
            },
            body: body !== undefined ? JSON.stringify(body) : undefined,
        });
    }

    async function seed({ username, role = 'user', totp = false, consented = false, disabled = false, recoveryCodes = 2 }) {
        const id = new ObjectId();
        const doc = {
            _id: id,
            username,
            passwordHash,
            role,
            disabled,
            createdAt: Date.now(),
            ...(consented ? { privacy: { version: PRIVACY_NOTICE_VERSION, consentedAt: new Date() } } : {}),
        };
        const secret = randomBytes(20);
        if (totp) {
            doc.totp = {
                enabled: true,
                ...encryptSecret(id, secret),
                boundAt: new Date(),
                // Seeded recovery codes: ABCDEFGHI0, ABCDEFGHI1, … (ten characters each).
                recoveryCodeHashes: Array.from({ length: recoveryCodes }, (_, index) => (
                    hashRecoveryCode(`ABCDEFGHI${index}`)
                )),
            };
        }
        await world.users.insertOne(doc);
        return { id, doc, secret };
    }

    /** Password step only. For two-factor accounts use finishSignIn(). */
    async function passwordStep(username, { password = PASSWORD, ip: address = ip } = {}) {
        const res = await call('POST', '/api/auth/login', { body: { username, password }, ip: address });
        const setCookie = res.headers.get('set-cookie');
        return {
            res,
            body: await res.json(),
            cookie: setCookie ? setCookie.split(';')[0] : null,
            ticket: null,
        };
    }

    /** Signs in all the way (second factor included) and returns the session cookie. */
    async function signInAs(account, options = {}) {
        const first = await passwordStep(account.doc.username, options);
        if (first.body.data?.status !== 'totp_required') {
            return first;
        }
        const second = await call('POST', '/api/auth/totp/verify', {
            body: { ticket: first.body.data.ticket, code: codeNow(account.secret) },
            ip: options.ip ?? ip,
        });
        const setCookie = second.headers.get('set-cookie');
        return {
            res: second,
            body: await second.json(),
            cookie: setCookie ? setCookie.split(';')[0] : null,
            ticket: first.body.data.ticket,
        };
    }

    const trail = async () => (await world.auditLogs.find({}).sort({ at: 1, _id: 1 }).toArray());
    const storedUser = (account) => world.users.findOne({ _id: account.id });
    const sessionCount = async (userId) => (
        userId ? world.sessions.countDocuments({ userId }) : world.sessions.countDocuments()
    );

    return { world, call, seed, passwordStep, signInAs, trail, storedUser, sessionCount, stop: () => server.close(), ip };
}

const codeNow = (secret) => hotp(secret, currentStep());

// ---------------------------------------------------------------- registration

test('register: consent is mandatory and must name the current notice version', async () => {
    const w = await startWorld();
    try {
        const noConsent = await w.call('POST', '/api/auth/register', {
            body: { username: 'noconsent', password: PASSWORD },
        });
        expect(noConsent.status).toBe(400);
        expect(await noConsent.json()).toEqual({
            success: false, message: 'Privacy notice consent is required', code: 'PRIVACY_CONSENT_REQUIRED',
        });

        const stale = await w.call('POST', '/api/auth/register', {
            body: { username: 'stale', password: PASSWORD, agree: true, privacyVersion: '2000.01.1' },
        });
        expect(stale.status).toBe(409);
        expect((await stale.json()).code).toBe('PRIVACY_NOTICE_UPDATED');

        // "agree" must be the literal true.
        const truthy = await w.call('POST', '/api/auth/register', {
            body: { username: 'truthy', password: PASSWORD, agree: 'yes', privacyVersion: PRIVACY_NOTICE_VERSION },
        });
        expect(truthy.status).toBe(400);

        expect(await w.world.users.countDocuments()).toBe(0);
        expect(await w.sessionCount()).toBe(0);
    } finally {
        w.stop();
    }
});

test('register: a valid consent creates the account, its consent record, and audits both facts', async () => {
    const w = await startWorld();
    try {
        // Somebody already has an account, so the new one is a regular one
        // (the very first account becomes an administrator — see the next test).
        await w.seed({ username: 'earlier' });
        const res = await w.call('POST', '/api/auth/register', {
            body: { username: 'newcomer', password: PASSWORD, agree: true, privacyVersion: PRIVACY_NOTICE_VERSION },
        });
        expect(res.status).toBe(201);
        expect(res.headers.get('set-cookie')).toContain('dt_session=');
        const body = await res.json();
        // Consent just happened → nothing owed.
        expect(body.data).toEqual({
            status: 'ok', id: expect.any(String), username: 'newcomer', role: 'user', pending: [],
        });

        const stored = await w.world.users.findOne({ username: 'newcomer' });
        expect(stored.privacy.version).toBe(PRIVACY_NOTICE_VERSION);
        expect(stored.privacy.consentedAt).toBeInstanceOf(Date);
        // Each bcrypt hash is salted independently, so verify rather than compare.
        expect(stored.role).toBe('user');
        expect(stored.disabled).toBe(false);
        expect(await verifyPassword(PASSWORD, stored.passwordHash)).toBe(true);
        expect(await verifyPassword('wrong-password', stored.passwordHash)).toBe(false);
        expect(stored).not.toHaveProperty('totp');

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual(['registered', 'privacy_consented']);
        expect(trail[0].actorUserId).toEqual(stored._id);
        expect(trail[0].subjectUserId).toEqual(stored._id);
        expect(trail[0]).toMatchObject({ ip: w.ip, detail: { role: 'user' } });
        expect(trail[1]).toMatchObject({ ip: w.ip, detail: { version: PRIVACY_NOTICE_VERSION, channel: 'register' } });
        for (const event of trail) {
            expect(event.expireAt.getTime() - event.at.getTime()).toBe(RETENTION_MS);
            // The audit trail never carries credentials.
            expect(JSON.stringify(event)).not.toContain(PASSWORD);
            expect(JSON.stringify(event)).not.toContain(passwordHash);
        }
    } finally {
        w.stop();
    }
});

test('register: the very first account is an administrator and owes two-factor enrolment', async () => {
    const empty = buildWorld();
    empty.world.appSettings.docs.clear();
    const server = await new Promise((resolve) => {
        const s = empty.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/register`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.1' },
            body: JSON.stringify({
                username: 'firstadmin', password: PASSWORD, agree: true, privacyVersion: PRIVACY_NOTICE_VERSION,
            }),
        });
        expect(res.status).toBe(201);
        expect((await res.json()).data).toMatchObject({ role: 'admin', pending: ['totp_enroll'] });
    } finally {
        server.close();
    }
});

// ---------------------------------------------------------------------- login

test('login: a pre-R20 account signs in, owes the consent step, and its IP is not recorded yet', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'legacy' });
        const { res, body, cookie } = await w.passwordStep('legacy');
        expect(res.status).toBe(200);
        expect(body.data).toMatchObject({ status: 'ok', username: 'legacy', pending: ['privacy_consent'] });
        expect(cookie).toContain('dt_session=');

        const [event] = await w.trail();
        expect(event.type).toBe('login_succeeded');
        expect(event.ip).toBeNull(); // "inform first, then collect"
        expect(account.id).toBeDefined();
    } finally {
        w.stop();
    }
});

test('login: once the account agreed to the current notice, the sign-in is recorded with its IP', async () => {
    const w = await startWorld();
    try {
        const { id } = await w.seed({ username: 'consenting', consented: true });
        const { body } = await w.passwordStep('consenting');
        expect(body.data.pending).toEqual([]);
        const [event] = await w.trail();
        expect(event).toMatchObject({ type: 'login_succeeded', actorUserId: id, subjectUserId: id, ip: w.ip });
    } finally {
        w.stop();
    }
});

test('login failures: one indistinguishable 401, while the audit keeps what security needs', async () => {
    const w = await startWorld();
    try {
        const { id } = await w.seed({ username: 'known' });
        await w.seed({ username: 'disabled_one', disabled: true });

        const unknown = await w.passwordStep('ghost_user', { ip: '198.51.100.11' });
        expect(unknown.res.status).toBe(401);
        expect(unknown.body.message).toBe('Invalid username or password');
        expect(unknown.cookie).toBeNull();

        const wrongPassword = await w.passwordStep('known', { password: 'wrong-password', ip: '198.51.100.12' });
        expect(wrongPassword.res.status).toBe(401);
        expect(wrongPassword.body.message).toBe(unknown.body.message);

        const malformed = await w.passwordStep('ab', { ip: '198.51.100.13' }); // fails the username format
        expect(malformed.res.status).toBe(401);

        const disabled = await w.passwordStep('disabled_one', { ip: '198.51.100.14' });
        expect(disabled.res.status).toBe(403);
        expect(disabled.body.message).toBe('Account is disabled');

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual(['login_failed', 'login_failed', 'login_failed', 'login_failed']);
        // Unknown, well-formed username: kept — no account is attached to it.
        expect(trail[0]).toMatchObject({
            result: 'failure', actorUserId: null, subjectUserId: null, ip: '198.51.100.11',
            detail: { reason: 'invalid_credentials', attemptedUsername: 'ghost_user' },
        });
        // Existing account: referenced by id; the typed username is not duplicated.
        expect(trail[1]).toMatchObject({
            subjectUserId: id, ip: '198.51.100.12', detail: { reason: 'invalid_credentials' },
        });
        expect(trail[1].detail).not.toHaveProperty('attemptedUsername');
        // Something that is not a username at all (an e-mail, say) is never stored.
        expect(trail[2].detail).toEqual({ reason: 'invalid_credentials' });
        // Disabled account: the password was right — worth knowing.
        expect(trail[3].detail).toEqual({ reason: 'account_disabled' });

        expect(await w.sessionCount()).toBe(0);
    } finally {
        w.stop();
    }
});

// ------------------------------------------------------------- second factor

test('login with two-factor enabled returns a pre-login ticket and creates no session', async () => {
    const w = await startWorld();
    try {
        await w.seed({ username: 'enrolled', totp: true, consented: true });
        const { res, body, cookie } = await w.passwordStep('enrolled');
        expect(res.status).toBe(200);
        expect(res.headers.get('set-cookie')).toBeNull();
        expect(cookie).toBeNull();
        expect(body.data).toEqual({
            status: 'totp_required', ticket: expect.stringMatching(/^[0-9a-f]{64}$/), expiresIn: 300,
        });
        expect(await w.sessionCount()).toBe(0);
        // Nothing is recorded as a sign-in until the second factor passed.
        expect(await w.trail()).toHaveLength(0);
    } finally {
        w.stop();
    }
});

test('verify: wrong codes are counted per account; the fifth locks the step for the window', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'guarded', totp: true, consented: true });
        const { body } = await w.passwordStep('guarded');
        const ticket = body.data.ticket;

        // A malformed code is a client error, not an attempt.
        const malformed = await w.call('POST', '/api/auth/totp/verify', { body: { ticket, code: '12345' } });
        expect(malformed.status).toBe(400);

        for (let remaining = 4; remaining >= 1; remaining -= 1) {
            const res = await w.call('POST', '/api/auth/totp/verify', { body: { ticket, code: '000000' } });
            expect(res.status).toBe(401);
            expect(await res.json()).toEqual({
                success: false, message: 'Invalid verification code', data: { attemptsRemaining: remaining },
            });
        }
        const locked = await w.call('POST', '/api/auth/totp/verify', { body: { ticket, code: '000000' } });
        expect(locked.status).toBe(429);
        expect(Number(locked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
        expect(locked.headers.get('set-cookie')).toBeNull();

        // The used ticket is dead.
        const dead = await w.call('POST', '/api/auth/totp/verify', { body: { ticket, code: '000000' } });
        expect(dead.status).toBe(400);
        expect((await dead.json()).code).toBe('TICKET_INVALID');

        // The block follows the ACCOUNT: a brand-new ticket — from another IP,
        // even carrying the right code — is refused, and is revoked in turn.
        let refusals = 0;
        for (const code of ['000000', codeNow(account.secret), '000000']) {
            const fresh = await w.passwordStep('guarded', { ip: `198.51.100.${77 + refusals}` });
            const res = await w.call('POST', '/api/auth/totp/verify', {
                body: { ticket: fresh.body.data.ticket, code }, ip: '198.51.100.70',
            });
            expect(res.status).toBe(429);
            const gone = await w.call('POST', '/api/auth/totp/verify', {
                body: { ticket: fresh.body.data.ticket, code }, ip: '198.51.100.70',
            });
            expect(gone.status).toBe(400);
            refusals += 1;
        }

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual(new Array(5).fill('totp_failed'));
        for (const event of trail) {
            // Anonymous attempt: recorded with its IP (the sign-in page shows the notice first).
            expect(event).toMatchObject({ result: 'failure', actorUserId: null, ip: w.ip, detail: { method: 'code' } });
        }
        expect(await w.sessionCount()).toBe(0);
    } finally {
        w.stop();
    }
});

test('verify: the lock is a sliding window — attempts are allowed again once it passes', async () => {
    // Comfortably longer than the sign-in requests in between (each one
    // verifies the password hash, which can take a while on a cold start), so
    // the "still blocked" check cannot race the window on a slow machine.
    const WINDOW_MS = 2000;
    process.env.TOTP_ATTEMPT_RATE_WINDOW_MS = String(WINDOW_MS);
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'patient', totp: true, consented: true });
        const { body } = await w.passwordStep('patient');
        for (let index = 0; index < 5; index += 1) {
            await w.call('POST', '/api/auth/totp/verify', { body: { ticket: body.data.ticket, code: '000000' } });
        }
        const fresh = await w.passwordStep('patient', { ip: '198.51.100.21' });
        const blocked = await w.call('POST', '/api/auth/totp/verify', {
            body: { ticket: fresh.body.data.ticket, code: '000000' }, ip: '198.51.100.22',
        });
        expect(blocked.status).toBe(429);

        // Wait for the NEWEST failure to age out (taken after the refused
        // request, which itself counts nothing), rather than a fixed sleep.
        const newestFailureAt = Date.now();
        await new Promise((resolve) => {
            setTimeout(resolve, Math.max(0, newestFailureAt + WINDOW_MS + 250 - Date.now()));
        });
        // (The refused request above revoked that ticket, as it always does.)
        const later = await w.passwordStep('patient', { ip: '198.51.100.24' });
        const afterWindow = await w.call('POST', '/api/auth/totp/verify', {
            body: { ticket: later.body.data.ticket, code: codeNow(account.secret) }, ip: '198.51.100.23',
        });
        expect(afterWindow.status).toBe(200);
    } finally {
        w.stop();
        delete process.env.TOTP_ATTEMPT_RATE_WINDOW_MS;
    }
});

test('verify: a correct code establishes the session and records both facts', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'enrolled2', totp: true, consented: true });
        const { body } = await w.passwordStep('enrolled2');
        const res = await w.call('POST', '/api/auth/totp/verify', {
            body: { ticket: body.data.ticket, code: ` ${codeNow(account.secret)} ` },
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('set-cookie')).toContain('dt_session=');
        expect((await res.json()).data).toMatchObject({ status: 'ok', username: 'enrolled2', pending: [] });

        expect(await w.sessionCount(account.id)).toBe(1);
        expect((await w.storedUser(account)).totp.lastUsedStep).toBe(currentStep());

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual(['totp_succeeded', 'login_succeeded']);
        expect(trail[1]).toMatchObject({ actorUserId: account.id, subjectUserId: account.id, ip: w.ip });

        // The ticket is single use.
        const again = await w.call('POST', '/api/auth/totp/verify', {
            body: { ticket: body.data.ticket, code: codeNow(account.secret) },
        });
        expect(again.status).toBe(400);
    } finally {
        w.stop();
    }
});

test('verify: a code that already signed in once is refused when replayed', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'replay_target', totp: true, consented: true });
        const first = await w.passwordStep('replay_target');
        const code = codeNow(account.secret);
        const ok = await w.call('POST', '/api/auth/totp/verify', { body: { ticket: first.body.data.ticket, code } });
        expect(ok.status).toBe(200);

        // Someone who captured that code and has the password: new ticket, same code.
        const second = await w.passwordStep('replay_target', { ip: '198.51.100.31' });
        const replay = await w.call('POST', '/api/auth/totp/verify', {
            body: { ticket: second.body.data.ticket, code }, ip: '198.51.100.32',
        });
        expect(replay.status).toBe(401);
        expect(await w.sessionCount(account.id)).toBe(1);

        // The next code is a different credential and still works.
        const third = await w.passwordStep('replay_target', { ip: '198.51.100.33' });
        const next = await w.call('POST', '/api/auth/totp/verify', {
            body: { ticket: third.body.data.ticket, code: hotp(account.secret, currentStep() + 1) }, ip: '198.51.100.34',
        });
        expect(next.status).toBe(200);
        expect(await w.sessionCount(account.id)).toBe(2);
    } finally {
        w.stop();
    }
});

test('verify: an unknown or malformed ticket is refused before anything is counted', async () => {
    const w = await startWorld();
    try {
        for (const ticket of [undefined, '', 'f'.repeat(64), { $ne: null }]) {
            const res = await w.call('POST', '/api/auth/totp/verify', { body: { ticket, code: '123456' } });
            expect(res.status).toBe(400);
            expect((await res.json()).code).toBe('TICKET_INVALID');
        }
        expect(await w.trail()).toHaveLength(0); // not an attempt on any account
    } finally {
        w.stop();
    }
});

test('recover: a recovery code signs in once and reports how many are left', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'recovering', totp: true, consented: true, recoveryCodes: 2 });
        const { body } = await w.passwordStep('recovering');
        const ticket = body.data.ticket;

        const badFormat = await w.call('POST', '/api/auth/totp/recover', { body: { ticket, recoveryCode: 'SHORT' } });
        expect(badFormat.status).toBe(400);

        const wrong = await w.call('POST', '/api/auth/totp/recover', { body: { ticket, recoveryCode: 'ZZZZZZZZZZ' } });
        expect(wrong.status).toBe(401);
        expect((await wrong.json()).message).toBe('Invalid recovery code');

        // Presentation does not matter: lower case, with or without the dash.
        const ok = await w.call('POST', '/api/auth/totp/recover', { body: { ticket, recoveryCode: 'abcdefghi0' } });
        expect(ok.status).toBe(200);
        expect((await ok.json()).data).toMatchObject({ status: 'ok', username: 'recovering', recoveryCodesRemaining: 1 });

        const second = await w.passwordStep('recovering', { ip: '198.51.100.41' });
        const reused = await w.call('POST', '/api/auth/totp/recover', {
            body: { ticket: second.body.data.ticket, recoveryCode: 'ABCDE-FGHI0' }, ip: '198.51.100.42',
        });
        expect(reused.status).toBe(401);

        const third = await w.passwordStep('recovering', { ip: '198.51.100.43' });
        const last = await w.call('POST', '/api/auth/totp/recover', {
            body: { ticket: third.body.data.ticket, recoveryCode: 'ABCDEFGHI1' }, ip: '198.51.100.44',
        });
        expect(last.status).toBe(200);
        expect((await last.json()).data.recoveryCodesRemaining).toBe(0);
        expect((await w.storedUser(account)).totp.recoveryCodeHashes).toEqual([]);

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual([
            'totp_failed', 'recovery_code_used', 'login_succeeded', 'totp_failed', 'recovery_code_used', 'login_succeeded',
        ]);
        expect(trail[0].detail).toEqual({ method: 'recovery_code' });
        expect(trail[1]).toMatchObject({ actorUserId: account.id, subjectUserId: account.id, detail: { remaining: 1 } });
        expect(trail[4].detail).toEqual({ remaining: 0 });
    } finally {
        w.stop();
    }
});

// ------------------------------------------------------- enrolment & settings

/** POST /totp/setup → the pending secret shown to the user. */
async function setup(w, cookie, body = {}) {
    const res = await w.call('POST', '/api/auth/totp/setup', { body, cookie });
    expect(res.status).toBe(200);
    return (await res.json()).data;
}

/** POST /totp/confirm with the code the authenticator would show for that secret. */
async function confirm(w, cookie, secretBase32) {
    const secret = fromBase32(secretBase32);
    return w.call('POST', '/api/auth/totp/confirm', { body: { code: codeNow(secret) }, cookie });
}

test('status / setup / confirm: enrolment stores only ciphertext and hands out ten recovery codes once', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'joiner', consented: true });
        const { cookie } = await w.passwordStep('joiner');

        const before = (await (await w.call('GET', '/api/auth/totp/status', { cookie })).json()).data;
        expect(before).toEqual({
            available: true, enabled: false, enforced: false, needsPassword: false, recoveryCodesRemaining: null,
        });

        const setupRes = await w.call('POST', '/api/auth/totp/setup', { body: {}, cookie });
        expect(setupRes.status).toBe(200);
        expect(setupRes.headers.get('cache-control')).toBe('no-store');
        const setupBody = (await setupRes.json()).data;
        expect(setupBody.secret).toMatch(/^[A-Z2-7]{32}$/);
        expect(setupBody.otpauthUri).toBe(
            `otpauth://totp/Debate%20Timer:joiner?secret=${setupBody.secret}`
            + '&issuer=Debate%20Timer&algorithm=SHA1&digits=6&period=30',
        );
        expect(setupBody.expiresIn).toBe(600);

        // Pending secret: encrypted for this account, not enabled yet.
        const pendingDoc = await w.storedUser(account);
        // (Explicit type checks: this test runner's toMatchObject overwrites
        // fields matched with expect.any(), and the values are read below.)
        for (const field of ['iv', 'secretEnc', 'authTag']) {
            expect(typeof pendingDoc.totp.pending[field]).toBe('string');
            expect(pendingDoc.totp.pending[field].length).toBeGreaterThan(0);
        }
        expect(Object.keys(pendingDoc.totp.pending).sort()).toEqual(['authTag', 'expiresAt', 'iv', 'secretEnc']);
        expect(pendingDoc.totp.pending.expiresAt).toBeInstanceOf(Date);
        expect(pendingDoc.totp.enabled).toBeUndefined();
        expect(JSON.stringify(pendingDoc)).not.toContain(setupBody.secret);
        expect(JSON.stringify(pendingDoc)).not.toContain(TEST_KEY);
        const secret = decryptSecret(account.id, pendingDoc.totp.pending);
        expect(secret).toEqual(fromBase32(setupBody.secret));
        // Starting enrolment is not yet a security change: nothing recorded.
        expect((await w.trail()).map((event) => event.type)).toEqual(['login_succeeded']);

        const wrong = await w.call('POST', '/api/auth/totp/confirm', { body: { code: '000000' }, cookie });
        expect(wrong.status).toBe(401);
        const badFormat = await w.call('POST', '/api/auth/totp/confirm', { body: { code: '12345' }, cookie });
        expect(badFormat.status).toBe(400);

        // Another device is signed in too; enrolment must sign it out.
        await w.world.sessions.insertOne({
            tokenHash: hashSessionToken('other-device-token'), userId: account.id,
            createdAt: new Date(), expiresAt: new Date(Date.now() + DAY_MS),
        });
        expect(await w.sessionCount(account.id)).toBe(2);

        const confirmed = await w.call('POST', '/api/auth/totp/confirm', { body: { code: codeNow(secret) }, cookie });
        expect(confirmed.status).toBe(200);
        expect(confirmed.headers.get('cache-control')).toBe('no-store');
        const { recoveryCodes } = (await confirmed.json()).data;
        expect(recoveryCodes).toHaveLength(10);
        expect(new Set(recoveryCodes).size).toBe(10);
        for (const code of recoveryCodes) {
            expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
        }

        const enabledDoc = await w.storedUser(account);
        expect(enabledDoc.totp.enabled).toBe(true);
        expect(enabledDoc.totp.secretEnc).toBe(pendingDoc.totp.pending.secretEnc);
        expect(enabledDoc.totp.iv).toBe(pendingDoc.totp.pending.iv);
        expect(enabledDoc.totp.authTag).toBe(pendingDoc.totp.pending.authTag);
        expect(enabledDoc.totp.lastUsedStep).toBe(currentStep());
        expect(enabledDoc.totp.pending).toBeUndefined();
        expect(enabledDoc.totp.recoveryCodeHashes).toHaveLength(10);
        // Only hashes of the recovery codes are stored.
        for (const code of recoveryCodes) {
            expect(JSON.stringify(enabledDoc)).not.toContain(code);
            expect(JSON.stringify(enabledDoc)).not.toContain(code.replace('-', ''));
        }
        // This session survives, the other device is out.
        expect(await w.sessionCount(account.id)).toBe(1);
        const me = await w.call('GET', '/api/auth/me', { cookie });
        expect((await me.json()).data.username).toBe('joiner');

        const after = (await (await w.call('GET', '/api/auth/totp/status', { cookie })).json()).data;
        expect(after).toEqual({
            available: true, enabled: true, enforced: false, needsPassword: false, recoveryCodesRemaining: 10,
        });

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual(['login_succeeded', 'totp_failed', 'totp_bound']);
        expect(trail[2]).toMatchObject({
            actorUserId: account.id, subjectUserId: account.id,
            detail: { channel: 'self', rebind: false, recoveryCodeCount: 10 },
        });
        // From now on, signing in needs the code.
        const next = await w.passwordStep('joiner', { ip: '198.51.100.51' });
        expect(next.body.data.status).toBe('totp_required');
    } finally {
        w.stop();
    }
});

test('confirm: wrong codes are counted per account; the fifth locks the enrolment step', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'enrollee', consented: true });
        const { cookie } = await w.passwordStep('enrollee');
        const setup = await w.call('POST', '/api/auth/totp/setup', { body: {}, cookie });
        const { secret } = (await setup.json()).data;
        const wrongCode = () => (codeNow(fromBase32(secret)) === '000000' ? '111111' : '000000');

        // A malformed code is a client error, not an attempt.
        const malformed = await w.call('POST', '/api/auth/totp/confirm', { body: { code: '12345' }, cookie });
        expect(malformed.status).toBe(400);

        for (let remaining = 4; remaining >= 1; remaining -= 1) {
            const res = await w.call('POST', '/api/auth/totp/confirm', { body: { code: wrongCode() }, cookie });
            expect(res.status).toBe(401);
            expect(await res.json()).toEqual({
                success: false, message: 'Invalid verification code', data: { attemptsRemaining: remaining },
            });
        }

        // The fifth wrong code locks the step — from here even the right code is refused.
        const locked = await w.call('POST', '/api/auth/totp/confirm', { body: { code: wrongCode() }, cookie });
        expect(locked.status).toBe(429);
        expect(Number(locked.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
        const rightCode = await w.call('POST', '/api/auth/totp/confirm', {
            body: { code: codeNow(fromBase32(secret)) }, cookie,
        });
        expect(rightCode.status).toBe(429);

        // Nothing was activated, and every wrong code is on the record.
        expect((await w.storedUser(account)).totp.enabled).toBeUndefined();
        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual(['login_succeeded', ...new Array(5).fill('totp_failed')]);
        for (const event of trail.slice(1)) {
            expect(event).toMatchObject({
                actorUserId: account.id, subjectUserId: account.id, detail: { method: 'code' },
            });
        }
    } finally {
        w.stop();
    }
});

test('confirm: a stale or expired pending enrolment is refused', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'tinkerer', consented: true });
        const { cookie } = await w.passwordStep('tinkerer');

        const first = await setup(w, cookie);
        const second = await setup(w, cookie);
        expect(first.secret).not.toBe(second.secret);
        // Only the newest pending secret counts: a code from the earlier
        // attempt is simply a wrong code for the current one.
        const superseded = await confirm(w, cookie, first.secret);
        expect(superseded.status).toBe(401);
        expect((await w.storedUser(account)).totp.enabled).toBeUndefined();

        // A pending enrolment that outlived its ten minutes is refused as well.
        const doc = (await w.storedUser(account)).totp;
        doc.pending.expiresAt = new Date(Date.now() - 1000);
        await w.world.users.updateOne({ _id: account.id }, { $set: { 'totp.pending': doc.pending } });
        const expired = await confirm(w, cookie, second.secret);
        expect(expired.status).toBe(400);
        expect((await expired.json()).code).toBe('SETUP_EXPIRED');
        // The superseded code was a real wrong attempt and is on the record;
        // the expired one never reached the code check.
        expect((await w.trail()).map((event) => event.type)).toEqual(['login_succeeded', 'totp_failed']);

        // Within its lifetime the same pending secret confirms fine.
        const third = await setup(w, cookie);
        const confirmed = await confirm(w, cookie, third.secret);
        expect(confirmed.status).toBe(200);
    } finally {
        w.stop();
    }
});

test('confirm without a pending enrolment is refused', async () => {
    const w = await startWorld();
    try {
        await w.seed({ username: 'hasty', consented: true });
        const { cookie } = await w.passwordStep('hasty');
        const res = await w.call('POST', '/api/auth/totp/confirm', { body: { code: '123456' }, cookie });
        expect(res.status).toBe(400);
        expect((await res.json()).code).toBe('SETUP_EXPIRED');
    } finally {
        w.stop();
    }
});

test('re-binding issues a new secret and new recovery codes; the old ones stop working', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'rebinder', consented: true });
        const { cookie } = await w.passwordStep('rebinder');
        const firstSecret = await setup(w, cookie);
        const firstConfirm = await confirm(w, cookie, firstSecret.secret);
        const { recoveryCodes: firstCodes } = (await firstConfirm.json()).data;

        const secondSecret = await setup(w, cookie);
        expect(secondSecret.secret).not.toBe(firstSecret.secret);
        const secondConfirm = await confirm(w, cookie, secondSecret.secret);
        const { recoveryCodes: secondCodes } = (await secondConfirm.json()).data;
        expect(secondCodes).toHaveLength(10);
        expect(secondCodes.some((code) => firstCodes.includes(code))).toBe(false);

        const doc = await w.storedUser(account);
        expect(doc.totp.recoveryCodeHashes).toHaveLength(10);
        const bound = (await w.trail()).filter((event) => event.type === 'totp_bound');
        expect(bound.map((event) => event.detail)).toEqual([
            { channel: 'self', rebind: false, recoveryCodeCount: 10 },
            { channel: 'self', rebind: true, recoveryCodeCount: 10 },
        ]);

        // The old authenticator no longer produces valid codes...
        const oldDevice = await w.passwordStep('rebinder', { ip: '198.51.100.61' });
        const staleCode = await w.call('POST', '/api/auth/totp/verify', {
            body: { ticket: oldDevice.body.data.ticket, code: codeNow(fromBase32(firstSecret.secret)) }, ip: '198.51.100.62',
        });
        expect(staleCode.status).toBe(401);
        // ...and an old recovery code is refused as well.
        const second = await w.passwordStep('rebinder', { ip: '198.51.100.63' });
        const oldRecovery = await w.call('POST', '/api/auth/totp/recover', {
            body: { ticket: second.body.data.ticket, recoveryCode: firstCodes[0] }, ip: '198.51.100.64',
        });
        expect(oldRecovery.status).toBe(401);
        // The new one works.
        const third = await w.passwordStep('rebinder', { ip: '198.51.100.65' });
        const newRecovery = await w.call('POST', '/api/auth/totp/recover', {
            body: { ticket: third.body.data.ticket, recoveryCode: secondCodes[0] }, ip: '198.51.100.66',
        });
        expect(newRecovery.status).toBe(200);
    } finally {
        w.stop();
    }
});

// ------------------------------------------------------ post-login gates (R20)

async function gateResponse(w, path, cookie, method = 'GET', body) {
    const res = await w.call(method, path, { cookie, body });
    return { status: res.status, body: await res.json() };
}

test('gates: an existing account must confirm the current notice before using the rest of the API', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'existing' });
        const { cookie } = await w.passwordStep('existing');

        const me = await gateResponse(w, '/api/auth/me', cookie);
        expect(me.status).toBe(200);
        expect(me.body.data.pending).toEqual(['privacy_consent']);

        // Not exempt → refused with the machine-readable cause.
        const refused = await gateResponse(w, '/api/audit/logins/list', cookie);
        expect(refused.status).toBe(403);
        expect(refused.body).toEqual({
            success: false,
            code: GATE_REQUIRED_CODE,
            message: 'Additional steps are required before continuing',
            gates: ['privacy_consent'],
        });

        // A stale version is refused so the client re-reads the notice first.
        const stale = await gateResponse(w, '/api/privacy/consent/accept', cookie, 'POST', { version: '2000.01.1' });
        expect(stale.status).toBe(409);
        expect(stale.body.code).toBe('PRIVACY_NOTICE_UPDATED');
        const missing = await gateResponse(w, '/api/privacy/consent/accept', cookie, 'POST', {});
        expect(missing.status).toBe(400);

        const accepted = await gateResponse(w, '/api/privacy/consent/accept', cookie, 'POST', { version: PRIVACY_NOTICE_VERSION });
        expect(accepted.status).toBe(200);
        expect(accepted.body.data).toEqual({
            version: PRIVACY_NOTICE_VERSION, consentedAt: expect.any(Number), pending: [],
        });

        const doc = await w.storedUser(account);
        expect(doc.privacy.version).toBe(PRIVACY_NOTICE_VERSION);
        expect(doc.privacy.consentedAt).toBeInstanceOf(Date);

        const trail = await w.trail();
        expect(trail.map((event) => event.type)).toEqual(['login_succeeded', 'privacy_consented']);
        // The agreement happened in this very request → its IP is kept.
        expect(trail[1]).toMatchObject({ ip: w.ip, detail: { version: PRIVACY_NOTICE_VERSION, channel: 'login_gate' } });
        expect(trail[0].ip).toBeNull();

        // The gate is gone, and from now on the account's events carry its IP.
        const after = await gateResponse(w, '/api/audit/logins/list', cookie);
        expect(after.status).toBe(200);
        const again = await w.passwordStep('existing', { ip: '198.51.100.71' });
        const last = (await w.trail()).at(-1);
        expect(last).toMatchObject({ type: 'login_succeeded', ip: '198.51.100.71' });

        // Confirming twice is harmless.
        const twice = await gateResponse(w, '/api/privacy/consent/accept', cookie, 'POST', { version: PRIVACY_NOTICE_VERSION });
        expect(twice.status).toBe(200);
        expect(await w.storedUser(account).then((d) => d.privacy.version)).toBe(PRIVACY_NOTICE_VERSION);
        // Sessions created before deploy are never destroyed by the gate.
        expect(await w.sessionCount(account.id)).toBe(2);
    } finally {
        w.stop();
    }
});

test('gates: a session that predates the deploy is gated without being rewritten or destroyed', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'oldtimer', role: 'admin' });
        // A session created 20 days ago, as the live admin's would be.
        const token = 'a'.repeat(64);
        await w.world.sessions.insertOne({
            tokenHash: hashSessionToken(token), userId: account.id,
            createdAt: new Date(Date.now() - 20 * DAY_MS), expiresAt: new Date(Date.now() + 10 * DAY_MS),
        });
        const cookie = `dt_session=${token}`;

        const me = await gateResponse(w, '/api/auth/me', cookie);
        expect(me.body.data.pending).toEqual(['privacy_consent', 'totp_enroll']);
        expect(me.body.data).not.toHaveProperty('passwordHash');
        expect(me.body.data).not.toHaveProperty('totp');

        const refused = await gateResponse(w, '/api/audit/logs/list', cookie);
        expect(refused.status).toBe(403);
        expect(refused.body.gates).toEqual(['privacy_consent', 'totp_enroll']);

        // Needs the password: the session is older than the ten-minute window.
        const status = await gateResponse(w, '/api/auth/totp/status', cookie);
        expect(status.body.data.needsPassword).toBe(true);

        // Enrolment comes second: until the consent step is done it is gated,
        // even with the right password.
        const notYet = await gateResponse(w, '/api/auth/totp/setup', cookie, 'POST', { password: PASSWORD });
        expect(notYet.status).toBe(403);
        expect(notYet.body.code).toBe(GATE_REQUIRED_CODE);

        await gateResponse(w, '/api/privacy/consent/accept', cookie, 'POST', { version: PRIVACY_NOTICE_VERSION });

        const stillEnrol = await gateResponse(w, '/api/auth/me', cookie);
        expect(stillEnrol.body.data.pending).toEqual(['totp_enroll']);
        expect((await gateResponse(w, '/api/audit/logs/list', cookie)).status).toBe(403);

        const noPassword = await gateResponse(w, '/api/auth/totp/setup', cookie, 'POST', {});
        expect(noPassword.status).toBe(400);
        expect(noPassword.body.code).toBe('PASSWORD_REQUIRED');

        const wrongPassword = await gateResponse(w, '/api/auth/totp/setup', cookie, 'POST', { password: 'nope' });
        expect(wrongPassword.status).toBe(400);
        expect(wrongPassword.body.message).toBe('Password is incorrect');

        const setup = await w.call('POST', '/api/auth/totp/setup', { body: { password: PASSWORD }, cookie });
        expect(setup.status).toBe(200);
        const secret = (await setup.json()).data.secret;
        const confirmed = await confirm(w, cookie, secret);
        expect(confirmed.status).toBe(200);

        const done = await gateResponse(w, '/api/auth/me', cookie);
        expect(done.body.data.pending).toEqual([]);
        expect((await gateResponse(w, '/api/audit/logs/list', cookie)).status).toBe(200);
        const bound = (await w.trail()).find((event) => event.type === 'totp_bound');
        expect(bound.detail.channel).toBe('forced_enrollment');
        expect(await w.sessionCount(account.id)).toBe(1); // the old session itself survived
    } finally {
        w.stop();
    }
});

test('gates: without a configured key the enrolment step is not required and two-factor endpoints refuse', async () => {
    const w = await startWorld();
    try {
        // Seed while the key is configured; the key disappears afterwards.
        const admin = await w.seed({ username: 'keyless', role: 'admin', consented: true });
        const enrolled = await w.seed({ username: 'keyless2fa', totp: true, consented: true });
        delete process.env[TOTP_KEY_ENV];
        const { cookie } = await w.passwordStep('keyless');
        expect((await w.passwordStep('keyless')).body.data.pending).toEqual([]);

        const status = await gateResponse(w, '/api/auth/totp/status', cookie);
        expect(status.body.data.available).toBe(false);

        const setup = await gateResponse(w, '/api/auth/totp/setup', cookie, 'POST', {});
        expect(setup.status).toBe(503);
        expect(setup.body.code).toBe('TOTP_UNAVAILABLE');

        // An enrolled account cannot sign in — and is NOT downgraded to password-only.
        const login = await w.passwordStep('keyless2fa');
        expect(login.res.status).toBe(503);
        expect(login.body.code).toBe('TOTP_UNAVAILABLE');
        expect(await w.sessionCount(enrolled.id)).toBe(0);
        expect(admin.id).toBeDefined();
    } finally {
        w.stop();
        process.env[TOTP_KEY_ENV] = TEST_KEY;
    }
});

test('gates: exempt endpoints stay reachable while a step is owed', async () => {
    const w = await startWorld();
    try {
        await w.seed({ username: 'pending' });
        const { cookie } = await w.passwordStep('pending');
        for (const [method, path, body] of [
            ['GET', '/api/auth/me', undefined],
            ['GET', '/api/auth/totp/status', undefined],
            ['GET', '/api/privacy/notices/current', undefined],
        ]) {
            const res = await w.call(method, path, { cookie, body });
            expect(res.status).toBe(200);
        }
        const out = await w.call('POST', '/api/auth/logout', { cookie });
        expect(out.status).toBe(200);
    } finally {
        w.stop();
    }
});

test('gates: enrolment waits for the consent step — the steps have a fixed order', async () => {
    const w = await startWorld();
    try {
        const account = await w.seed({ username: 'chief', role: 'admin' });
        const { cookie } = await w.passwordStep('chief');
        const before = await gateResponse(w, '/api/auth/me', cookie);
        expect(before.body.data.pending).toEqual(['privacy_consent', 'totp_enroll']);

        // Closed until the consent step is done, with both steps named.
        for (const path of ['/api/auth/totp/setup', '/api/auth/totp/confirm']) {
            const refused = await gateResponse(w, path, cookie, 'POST', {});
            expect(refused.status).toBe(403);
            expect(refused.body.code).toBe(GATE_REQUIRED_CODE);
            expect(refused.body.gates).toEqual(['privacy_consent', 'totp_enroll']);
        }
        // Refused before anything was written: no enrolment was started.
        expect((await w.storedUser(account)).totp).toBeUndefined();

        const accepted = await gateResponse(w, '/api/privacy/consent/accept', cookie, 'POST', { version: PRIVACY_NOTICE_VERSION });
        expect(accepted.status).toBe(200);
        expect(accepted.body.data.pending).toEqual(['totp_enroll']);

        // Open now that only enrolment is left.
        const opened = await gateResponse(w, '/api/auth/totp/setup', cookie, 'POST', {});
        expect(opened.status).toBe(200);
        expect(typeof opened.body.data.secret).toBe('string');
    } finally {
        w.stop();
    }
});

test('disable: only the account owner with the password, never an administrator', async () => {
    const w = await startWorld();
    try {
        const member = await w.seed({ username: 'member', consented: true });
        const { cookie } = await w.passwordStep('member');
        const notEnabled = await w.call('POST', '/api/auth/totp/disable', { body: { password: PASSWORD }, cookie });
        expect(notEnabled.status).toBe(400);

        await confirm(w, cookie, (await setup(w, cookie)).secret);
        expect(await w.sessionCount(member.id)).toBe(1);

        const noPassword = await w.call('POST', '/api/auth/totp/disable', { body: {}, cookie });
        expect(noPassword.status).toBe(400);
        expect((await noPassword.json()).code).toBe('PASSWORD_REQUIRED');
        const wrong = await w.call('POST', '/api/auth/totp/disable', { body: { password: 'wrong' }, cookie });
        expect(wrong.status).toBe(400);

        const boss = await w.seed({ username: 'theboss', role: 'admin', totp: true, consented: true });
        const bossIn = await w.signInAs(boss);
        const asAdmin = await w.call('POST', '/api/auth/totp/disable', { body: { password: PASSWORD }, cookie: bossIn.cookie });
        expect(asAdmin.status).toBe(403);
        expect((await asAdmin.json()).message).toBe('Administrators cannot disable two-factor authentication');

        const ok = await w.call('POST', '/api/auth/totp/disable', { body: { password: PASSWORD }, cookie });
        expect(ok.status).toBe(200);
        expect((await ok.json()).data).toEqual({ enabled: false });
        expect((await w.storedUser(member))).not.toHaveProperty('totp');
        // Turning it off does not sign anyone out.
        expect(await w.sessionCount(member.id)).toBe(1);
        const unbound = (await w.trail()).find((event) => event.type === 'totp_unbound');
        expect(unbound).toMatchObject({ actorUserId: member.id, detail: { channel: 'self' } });
    } finally {
        w.stop();
    }
});

// ------------------------------------------------------------ privacy notice

test('privacy notice: served in the requested language, English by default, never cached', async () => {
    const w = await startWorld();
    try {
        const zh = await w.call('GET', '/api/privacy/notices/current?lng=zh-Hans');
        expect(zh.status).toBe(200);
        expect(zh.headers.get('cache-control')).toBe('no-store');
        const zhBody = (await zh.json()).data;
        expect(zhBody).toMatchObject({ version: PRIVACY_NOTICE_VERSION, lng: 'zh-Hans', title: '隐私说明' });
        expect(zhBody.sections).toHaveLength(7);

        const unknown = (await (await w.call('GET', '/api/privacy/notices/current?lng=xx')).json()).data;
        expect(unknown.lng).toBe('en');
        const none = (await (await w.call('GET', '/api/privacy/notices/current')).json()).data;
        expect(none.lng).toBe('en');
        expect(none).not.toHaveProperty('expireAt');
    } finally {
        w.stop();
    }
});
