/**
 * Security and account audit log (module P-04, round R20).
 *
 * One append-only record per security-relevant fact. The log deliberately
 * holds very little: which event, when, who acted, which account it concerned,
 * the source IP when there is a basis to record it, and a small set of
 * event-specific fields. Never request bodies, passwords, one-time codes,
 * recovery codes, session tokens or user content — the whitelist below makes
 * that a property of the code rather than of each caller's discipline.
 *
 * Whether an IP is recorded follows "inform first, then collect" (R20 D50):
 *   anonymous_attempt — failed sign-in / second-factor attempts by someone
 *                       who is not signed in; the sign-in page shows the
 *                       notice before the form.
 *   consented          — the acting account agreed to the CURRENT notice.
 *   not_consented      — no agreement yet: the event is kept, the IP is not.
 *   system             — no request behind it (scripts, retention).
 *
 * Retention is 184 days (user decision 2026-11-24), enforced through a TTL
 * index on `expireAt`. It is a single constant on purpose.
 */
import { PRIVACY_NOTICE_VERSION } from './privacyNotices.js';
import { parseObjectId } from './ids.js';

export const AUDIT_RETENTION_DAYS = 184;
const DAY_MS = 24 * 60 * 60 * 1000;

const ROLE_VALUES = new Set(['admin', 'user']);
const LIFECYCLE_VALUES = new Set(['enabled', 'disabled']);
const REASON_VALUES = new Set(['invalid_credentials', 'account_disabled']);
const METHOD_VALUES = new Set(['code', 'recovery_code']);
// How a two-factor change was made…
const TOTP_CHANNEL_VALUES = new Set(['self', 'forced_enrollment', 'admin', 'cli']);
// …versus where an agreement to the privacy notice was given.
const CONSENT_CHANNEL_VALUES = new Set(['register', 'login_gate']);
const UNPUBLISH_BY_VALUES = new Set(['owner', 'admin']);
// Same shape the sign-up form enforces; anything else is not stored.
const ATTEMPTED_USERNAME_RE = /^[a-z0-9_]{3,32}$/;

function isCount(value) {
    return Number.isInteger(value) && value >= 0;
}

const FIELD_VALIDATORS = {
    role: (v) => ROLE_VALUES.has(v),
    reason: (v) => REASON_VALUES.has(v),
    method: (v) => METHOD_VALUES.has(v),
    channel: (v, type) => (
        type === 'privacy_consented' ? CONSENT_CHANNEL_VALUES.has(v) : TOTP_CHANNEL_VALUES.has(v)
    ),
    version: (v) => typeof v === 'string' && /^[0-9A-Za-z.-]{1,32}$/.test(v),
    attemptedUsername: (v) => typeof v === 'string' && ATTEMPTED_USERNAME_RE.test(v),
    rebind: (v) => typeof v === 'boolean',
    recoveryCodeCount: isCount,
    remaining: isCount,
    deleted: isCount,
    anonymized: isCount,
    by: (v) => UNPUBLISH_BY_VALUES.has(v),
    templateId: (v) => v instanceof Object && /^[0-9a-f]{24}$/.test(String(v)),
    from: (v, type) => (
        type === 'registration_setting_changed'
            ? v === null || typeof v === 'boolean'
            : ROLE_VALUES.has(v) || LIFECYCLE_VALUES.has(v)
    ),
    to: (v, type) => (
        type === 'registration_setting_changed'
            ? typeof v === 'boolean'
            : ROLE_VALUES.has(v) || LIFECYCLE_VALUES.has(v)
    ),
};

/** event type -> the only `detail` keys it may carry. */
export const AUDIT_DETAIL_KEYS = Object.freeze({
    registered: ['role'],
    login_succeeded: [],
    login_failed: ['reason', 'attemptedUsername'],
    totp_succeeded: [],
    totp_failed: ['method'],
    recovery_code_used: ['remaining'],
    totp_bound: ['channel', 'rebind', 'recoveryCodeCount'],
    totp_unbound: ['channel'],
    totp_reset: ['channel'],
    privacy_consented: ['version', 'channel'],
    user_created: ['role'],
    role_changed: ['from', 'to'],
    status_changed: ['from', 'to'],
    password_reset: [],
    user_deleted: [],
    registration_setting_changed: ['from', 'to'],
    gallery_published: ['templateId'],
    gallery_unpublished: ['templateId', 'by'],
    template_deleted_by_admin: ['templateId'],
    audit_scrubbed: ['deleted', 'anonymized'],
});

export const AUDIT_EVENT_TYPES = Object.freeze(Object.keys(AUDIT_DETAIL_KEYS));

const FAILURE_TYPES = new Set(['login_failed', 'totp_failed']);

/** Event types a regular account may see in "my sign-in history". */
export const AUDIT_SELF_TYPES = Object.freeze([
    'login_succeeded',
    'login_failed',
    'totp_succeeded',
    'totp_failed',
    'recovery_code_used',
]);

export const AUDIT_ADMIN_MAX_PAGE_SIZE = 100;
export const AUDIT_SELF_MAX_PAGE_SIZE = 50;

export const CONSENT = Object.freeze({
    ANONYMOUS_ATTEMPT: 'anonymous_attempt',
    CONSENTED: 'consented',
    NOT_CONSENTED: 'not_consented',
    SYSTEM: 'system',
});

/** Thrown when a caller tries to record something outside the whitelist. */
export class AuditShapeError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AuditShapeError';
    }
}

/** 'consented' only when the account agreed to the CURRENT notice version. */
export function consentOf(userDoc) {
    return userDoc?.privacy?.version === PRIVACY_NOTICE_VERSION
        ? CONSENT.CONSENTED
        : CONSENT.NOT_CONSENTED;
}

/** req.ip with the IPv4-mapped prefix removed ("::ffff:203.0.113.7" → "203.0.113.7"). */
export function clientIp(req) {
    const raw = req?.ip;
    if (typeof raw !== 'string' || raw.length === 0) {
        return null;
    }
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(raw);
    return mapped ? mapped[1] : raw;
}

/** The single place that decides whether an event carries an IP. */
export function ipFor(consent, req) {
    if (consent === CONSENT.ANONYMOUS_ATTEMPT || consent === CONSENT.CONSENTED) {
        return clientIp(req);
    }
    return null;
}

/** Hides the identifying tail of an IP for the viewer's own failed attempts. */
export function maskIp(ip) {
    if (typeof ip !== 'string' || ip.length === 0) {
        return ip ?? null;
    }
    if (ip.includes('.')) {
        const parts = ip.split('.');
        return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.*` : ip;
    }
    if (ip.includes(':')) {
        const groups = ip.split(':').filter((group) => group.length > 0);
        return groups.length > 4 ? `${groups.slice(0, 4).join(':')}::/64` : ip;
    }
    return ip;
}

export function expireAtFor(at, days = AUDIT_RETENTION_DAYS) {
    return new Date(at.getTime() + days * DAY_MS);
}

function isValidId(value) {
    if (value === null || value === undefined) {
        return true;
    }
    return value instanceof Object && /^[0-9a-f]{24}$/.test(String(value));
}

/**
 * Builds and validates the document for one audit event. Throws AuditShapeError
 * for anything outside the whitelist so a misuse fails in development.
 */
export function buildAuditEvent({
    type,
    result,
    consent,
    req,
    actorUserId = null,
    subjectUserId = null,
    detail = {},
    now = new Date(),
}) {
    if (!AUDIT_EVENT_TYPES.includes(type)) {
        throw new AuditShapeError(`Unknown audit event type: ${String(type)}`);
    }
    const expected = FAILURE_TYPES.has(type) ? 'failure' : 'success';
    if (result !== expected) {
        throw new AuditShapeError(`Audit event ${type} must have result "${expected}"`);
    }
    if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) {
        throw new AuditShapeError(`Audit event ${type}: detail must be a plain object`);
    }
    const allowed = AUDIT_DETAIL_KEYS[type];
    const cleanDetail = {};
    for (const [key, value] of Object.entries(detail)) {
        if (!allowed.includes(key)) {
            throw new AuditShapeError(`Audit event ${type}: detail key "${key}" is not allowed`);
        }
        if (value === undefined) {
            continue;
        }
        if (!FIELD_VALIDATORS[key](value, type)) {
            throw new AuditShapeError(`Audit event ${type}: invalid value for detail key "${key}"`);
        }
        cleanDetail[key] = value;
    }
    if (!isValidId(actorUserId) || !isValidId(subjectUserId)) {
        throw new AuditShapeError(`Audit event ${type}: actor/subject must be ObjectIds or null`);
    }
    return {
        type,
        at: now,
        expireAt: expireAtFor(now),
        result,
        actorUserId: actorUserId ?? null,
        subjectUserId: subjectUserId ?? null,
        ip: ipFor(consent, req),
        detail: cleanDetail,
    };
}

/**
 * Appends one audit event. Callers await this before responding; a failure
 * propagates so the request fails rather than passing unrecorded (D64).
 * Returns the stored document.
 */
export async function recordAudit(auditLogs, event) {
    const doc = buildAuditEvent(event);
    const { insertedId } = await auditLogs.insertOne(doc);
    return { ...doc, _id: insertedId };
}

/**
 * Recorder bound to a router. When no audit collection is wired in (isolated
 * test harnesses) it records nothing; production always passes one.
 */
export function createAuditRecorder(auditLogs) {
    if (!auditLogs) {
        return { record: async () => null, enabled: false };
    }
    return {
        enabled: true,
        record: (event) => recordAudit(auditLogs, event),
    };
}

/**
 * Scrubs a deleted account's trace (called BEFORE the user doc is removed,
 * so a failure can be retried by repeating the deletion).
 *
 *  1. delete every event whose subject is the account, except user_deleted
 *     (its own sign-in / 2FA / consent history has no owner any more);
 *  2. anonymise what still references it: events it performed on others, and
 *     the user_deleted event itself. Only the id pointing AT the deleted
 *     account is cleared (never the other account involved), and the IP only
 *     when the deleted account was the actor.
 *
 * Idempotent: a second run for the same id matches nothing.
 */
export async function scrubUserAuditLogs(auditLogs, userId, { now = () => new Date() } = {}) {
    const deleted = (await auditLogs.deleteMany({
        subjectUserId: userId,
        type: { $ne: 'user_deleted' },
    })).deletedCount;

    // Two explicit conditional updates rather than one expression-based one:
    // what reads clearer here also leaves no room for assumptions about
    // evaluation order inside a single update.
    const anonymizedAt = now();
    // (a) Events the deleted account performed on others: its id and its IP
    //     go. The account the event is ABOUT stays referenced — that is
    //     someone else's record (e.g. the role change it granted them).
    const asActor = (await auditLogs.updateMany(
        { actorUserId: userId },
        { $set: { actorUserId: null, ip: null, anonymizedAt } },
    )).modifiedCount;
    // (b) What still points at it — by now only the deletion record(s), where
    //     someone else was the actor and keeps their own identity and IP.
    const asSubject = (await auditLogs.updateMany(
        { subjectUserId: userId },
        { $set: { subjectUserId: null, anonymizedAt } },
    )).modifiedCount;

    return { deleted, anonymized: asActor + asSubject };
}

/**
 * Runs after a backup restore: accounts deleted before the backup was taken
 * would otherwise reappear in the restored audit log.
 */
export async function scrubOrphanAuditLogs({ auditLogs, users }) {
    const referenced = new Set();
    const docs = await findProjected(auditLogs, { actorUserId: 1, subjectUserId: 1 });
    for (const doc of docs) {
        if (doc.actorUserId) {
            referenced.add(String(doc.actorUserId));
        }
        if (doc.subjectUserId) {
            referenced.add(String(doc.subjectUserId));
        }
    }
    let scrubbed = 0;
    for (const raw of referenced) {
        const id = parseObjectId(raw);
        const existing = id ? await users.findOne({ _id: id }) : null;
        if (!existing) {
            await scrubUserAuditLogs(auditLogs, id ?? raw);
            scrubbed += 1;
        }
    }
    return { scrubbed };
}

// Projection helper that works with both a cursor (`find().project()`) and the
// plain option object the driver also accepts.
async function findProjected(collection, projection) {
    const cursor = collection.find({}, { projection });
    return cursor.toArray();
}

/** Admin list item: ids resolved to usernames at read time, full IP. */
export function toAuditItem(doc, usernames = {}) {
    const actorId = doc.actorUserId ? String(doc.actorUserId) : null;
    const subjectId = doc.subjectUserId ? String(doc.subjectUserId) : null;
    return {
        id: String(doc._id),
        type: doc.type,
        result: doc.result,
        at: doc.at instanceof Date ? doc.at.getTime() : doc.at,
        actor: actorId ? { id: actorId, username: usernames[actorId] ?? null } : null,
        subject: subjectId ? { id: subjectId, username: usernames[subjectId] ?? null } : null,
        ip: doc.ip ?? null,
        detail: doc.detail ?? {},
        anonymized: Boolean(doc.anonymizedAt),
    };
}

/** Own sign-in history item: full IP on success, masked on failure. */
export function toLoginItem(doc) {
    const ip = doc.ip ?? null;
    return {
        id: String(doc._id),
        type: doc.type,
        result: doc.result,
        at: doc.at instanceof Date ? doc.at.getTime() : doc.at,
        ip: doc.result === 'failure' ? maskIp(ip) : ip,
        detail: doc.detail ?? {},
    };
}
