import { describe, expect, test } from 'bun:test';
import { AUTH_GATE, createEnforceGates, GATE_REQUIRED_CODE, pendingGates } from './authGates.js';
import { PRIVACY_NOTICE_VERSION } from './privacyNotices.js';

const consented = { privacy: { version: PRIVACY_NOTICE_VERSION } };
const user = { role: 'user' };
const admin = { role: 'admin' };
const enrolled = { totp: { enabled: true } };

test('a regular account that agreed to the current notice owes nothing', () => {
    expect(pendingGates({ ...user, ...consented }, { totpReady: true })).toEqual([]);
    expect(pendingGates({ ...user, ...consented }, { totpReady: false })).toEqual([]);
});

test('an account without a consent record — including pre-R20 documents — owes the consent step', () => {
    expect(pendingGates(user, { totpReady: true })).toEqual([AUTH_GATE.PRIVACY_CONSENT]);
    // Legacy documents have no `privacy` field at all.
    expect(pendingGates({ role: 'user', createdAt: 1 }, { totpReady: true })).toEqual([AUTH_GATE.PRIVACY_CONSENT]);
});

test('an account that agreed to an OLDER notice version owes the consent step again', () => {
    expect(pendingGates({ ...user, privacy: { version: '2000.01.1' } }, { totpReady: true }))
        .toEqual([AUTH_GATE.PRIVACY_CONSENT]);
});

test('only administrators owe two-factor enrolment, and only without a configured key exception', () => {
    expect(pendingGates({ ...admin, ...consented }, { totpReady: true })).toEqual([AUTH_GATE.TOTP_ENROLL]);
    expect(pendingGates({ ...admin, ...consented, ...enrolled }, { totpReady: true })).toEqual([]);
    expect(pendingGates({ ...admin, ...consented }, { totpReady: false })).toEqual([]);
    // A regular account is never forced to enroll.
    expect(pendingGates({ ...user, ...consented }, { totpReady: true })).toEqual([]);
});

test('consent comes before enrolment, in that fixed order', () => {
    expect(pendingGates(admin, { totpReady: true }))
        .toEqual([AUTH_GATE.PRIVACY_CONSENT, AUTH_GATE.TOTP_ENROLL]);
});

test('no account document means no gates', () => {
    expect(pendingGates(null, { totpReady: true })).toEqual([]);
    expect(pendingGates(undefined, { totpReady: true })).toEqual([]);
});

// Tiny Express stand-ins for the middleware tests.
function run(enforceGates, { method, path, authUser }) {
    const req = { method, path, authUser };
    let nextCalled = false;
    const res = {
        statusCode: 0,
        body: null,
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.body = payload; return this; },
    };
    enforceGates(req, res, () => { nextCalled = true; });
    return { nextCalled, res };
}

describe('enforceGates', () => {
    const gatedUser = { role: 'user' }; // owes privacy_consent
    const enforceGates = createEnforceGates({ totpReady: () => true });

    test('lets requests without a session through untouched', () => {
        for (const path of ['/auth/login', '/configurations/x', '/anything']) {
            expect(run(enforceGates, { method: 'POST', path, authUser: null }).nextCalled).toBe(true);
            expect(run(enforceGates, { method: 'POST', path, authUser: undefined }).nextCalled).toBe(true);
        }
    });

    test('lets an account with nothing owed through', () => {
        const free = { role: 'user', privacy: { version: PRIVACY_NOTICE_VERSION } };
        expect(run(enforceGates, { method: 'GET', path: '/audit/logins/list', authUser: free }).nextCalled).toBe(true);
    });

    test('blocks the rest of the API for an account that still owes a step', () => {
        const { nextCalled, res } = run(enforceGates, { method: 'GET', path: '/audit/logins/list', authUser: gatedUser });
        expect(nextCalled).toBe(false);
        expect(res.statusCode).toBe(403);
        expect(res.body).toEqual({
            success: false,
            code: GATE_REQUIRED_CODE,
            message: 'Additional steps are required before continuing',
            gates: ['privacy_consent'],
        });
    });

    test('allows exactly the endpoints needed to finish the step that is owed first', () => {
        const allowed = [
            ['POST', '/auth/logout'],
            ['GET', '/auth/me'],
            ['GET', '/auth/totp/status'],
            ['GET', '/privacy/notices/current'],
            ['POST', '/privacy/consent/accept'],
        ];
        for (const [method, path] of allowed) {
            expect(run(enforceGates, { method, path, authUser: gatedUser }).nextCalled).toBe(true);
        }
    });

    test('the steps run in order: enrolment opens only once the consent step is done', () => {
        const enrolment = [['POST', '/auth/totp/setup'], ['POST', '/auth/totp/confirm']];
        // Both steps owed: the consent step comes first.
        const both = { role: 'admin' };
        for (const [method, path] of enrolment) {
            const { nextCalled, res } = run(enforceGates, { method, path, authUser: both });
            expect(nextCalled).toBe(false);
            expect(res.statusCode).toBe(403);
            expect(res.body.gates).toEqual(['privacy_consent', 'totp_enroll']);
        }
        // Only the consent step owed (a regular account): still closed.
        for (const [method, path] of enrolment) {
            expect(run(enforceGates, { method, path, authUser: gatedUser }).nextCalled).toBe(false);
        }
        // Only enrolment owed: open.
        const adminConsented = { role: 'admin', privacy: { version: PRIVACY_NOTICE_VERSION } };
        for (const [method, path] of enrolment) {
            expect(run(enforceGates, { method, path, authUser: adminConsented }).nextCalled).toBe(true);
        }
    });

    test('pre-login endpoints are never gated: they do not act on the caller\'s session', () => {
        const preLogin = [
            ['GET', '/auth/status'],
            ['POST', '/auth/login'],
            ['POST', '/auth/register'],
            ['POST', '/auth/totp/verify'],
            ['POST', '/auth/totp/recover'],
        ];
        for (const [method, path] of preLogin) {
            // With a gated session in the same browser…
            expect(run(enforceGates, { method, path, authUser: gatedUser }).nextCalled).toBe(true);
            // …and without any session.
            expect(run(enforceGates, { method, path, authUser: null }).nextCalled).toBe(true);
        }
    });

    test('the exemption is by method AND path', () => {
        expect(run(enforceGates, { method: 'GET', path: '/auth/logout', authUser: gatedUser }).nextCalled).toBe(false);
        expect(run(enforceGates, { method: 'POST', path: '/auth/me', authUser: gatedUser }).nextCalled).toBe(false);
        expect(run(enforceGates, { method: 'POST', path: '/auth/totp/disable', authUser: gatedUser }).nextCalled).toBe(false);
        // A path that merely starts like an exempt one is not exempt.
        expect(run(enforceGates, { method: 'GET', path: '/auth/me/anything', authUser: gatedUser }).nextCalled).toBe(false);
        expect(run(enforceGates, { method: 'GET', path: '/auth/metrics', authUser: gatedUser }).nextCalled).toBe(false);
    });

    test('reports the steps the account still owes, in order', () => {
        const { res } = run(enforceGates, { method: 'GET', path: '/configurations', authUser: { role: 'admin' } });
        expect(res.body.gates).toEqual(['privacy_consent', 'totp_enroll']);
    });

    test('follows the key status for the enrolment step', () => {
        const withoutKey = createEnforceGates({ totpReady: () => false });
        const admin = { role: 'admin', privacy: { version: PRIVACY_NOTICE_VERSION } };
        expect(run(withoutKey, { method: 'GET', path: '/audit/logs/list', authUser: admin }).nextCalled).toBe(true);
    });
});
