/**
 * Post-login gates (round R20, S-01).
 *
 * After a session exists, some accounts still owe a step before the rest of
 * the API is usable:
 *   privacy_consent — has not agreed to the CURRENT privacy notice version;
 *   totp_enroll     — administrator account without two-factor verification
 *                     (and the server has a TOTP key configured).
 *
 * The pending list is derived from the account document on every request and
 * never stored, so sessions that already existed at deploy time are gated the
 * same way as fresh ones without being destroyed or rewritten.
 */
import { PRIVACY_NOTICE_VERSION } from './privacyNotices.js';
import { isTotpReady } from './totpCrypto.js';

export const AUTH_GATE = Object.freeze({
    PRIVACY_CONSENT: 'privacy_consent',
    TOTP_ENROLL: 'totp_enroll',
});

/** Ordered list of steps the account still owes; empty when it can proceed. */
export function pendingGates(userDoc, { totpReady = isTotpReady() } = {}) {
    if (!userDoc) {
        return [];
    }
    const gates = [];
    if (userDoc.privacy?.version !== PRIVACY_NOTICE_VERSION) {
        gates.push(AUTH_GATE.PRIVACY_CONSENT);
    }
    if (userDoc.role === 'admin' && userDoc.totp?.enabled !== true && totpReady) {
        gates.push(AUTH_GATE.TOTP_ENROLL);
    }
    return gates;
}

// Paths are relative to the /api mount point. Everything else is gated.
// (a) What an account needs to COMPLETE the steps it owes.
const GATE_EXEMPT = [
    ['POST', /^\/auth\/logout$/],
    ['GET', /^\/auth\/me$/],
    ['GET', /^\/auth\/totp\/status$/],
    ['GET', /^\/privacy\/notices\/current$/],
    ['POST', /^\/privacy\/consent\/accept$/],
    // (b) Pre-login endpoints never act on the caller's session. Gating them
    //     would only turn a repeated sign-in from a browser that still holds
    //     a gated session into a baffling 403; whatever session they produce
    //     is gated exactly the same.
    ['GET', /^\/auth\/status$/],
    ['POST', /^\/auth\/login$/],
    ['POST', /^\/auth\/register$/],
    ['POST', /^\/auth\/totp\/verify$/],
    ['POST', /^\/auth\/totp\/recover$/],
];

// The steps have a fixed order, and enrolment comes second: a binding
// recorded before the consent step could not carry its IP. These two open
// only once the account no longer owes the consent step.
const GATE_EXEMPT_AFTER_CONSENT = [
    ['POST', /^\/auth\/totp\/setup$/],
    ['POST', /^\/auth\/totp\/confirm$/],
];

export const GATE_REQUIRED_CODE = 'GATE_REQUIRED';

export function createEnforceGates({ derive = pendingGates, totpReady = isTotpReady } = {}) {
    return function enforceGates(req, res, next) {
        // No session → nothing to gate; the route's own auth decides.
        if (!req.authUser) {
            next();
            return;
        }
        const gates = derive(req.authUser, { totpReady: totpReady() });
        const matches = ([method, pattern]) => req.method === method && pattern.test(req.path);
        const owesConsent = gates.includes(AUTH_GATE.PRIVACY_CONSENT);
        if (gates.length === 0
            || GATE_EXEMPT.some(matches)
            || (!owesConsent && GATE_EXEMPT_AFTER_CONSENT.some(matches))) {
            next();
            return;
        }
        res.status(403).json({
            success: false,
            code: GATE_REQUIRED_CODE,
            message: 'Additional steps are required before continuing',
            gates,
        });
    };
}
