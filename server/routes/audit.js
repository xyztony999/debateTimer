import { Router } from 'express';
import {
    AUDIT_ADMIN_MAX_PAGE_SIZE,
    AUDIT_EVENT_TYPES,
    AUDIT_SELF_MAX_PAGE_SIZE,
    AUDIT_SELF_TYPES,
    toAuditItem,
    toLoginItem,
} from '../lib/auditLog.js';
import { normalizeUsername } from '../lib/password.js';
import { parseObjectId } from '../lib/ids.js';

/**
 * Audit log read side (R20, module P-04).
 *
 * GET /logs/list     administrators only; every event, with filters.
 * GET /logins/list   any signed-in account; its OWN sign-in events only.
 *
 * There is deliberately no write, update or delete endpoint here: events are
 * appended by recordAudit() from inside the server and removed only by the
 * retention policy (and by the scrub that follows an account deletion).
 */

const RESULT_VALUES = ['success', 'failure'];

function fail(res, status, message) {
    return res.status(status).json({ success: false, message });
}

// Integer query parameter: falls back to `fallback` when absent, is clamped
// to [min, max] when out of range, and is reported as invalid when NaN.
function intParam(raw, { min, max, fallback }) {
    if (raw === undefined || raw === '') {
        return { value: fallback };
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed)) {
        return { invalid: true };
    }
    return { value: Math.min(max, Math.max(min, parsed)) };
}

// Optional integer query parameter that must be a valid integer when present.
function optionalInt(raw) {
    if (raw === undefined || raw === '') {
        return { value: undefined };
    }
    const parsed = Number(raw);
    return Number.isInteger(parsed) ? { value: parsed } : { invalid: true };
}

async function resolveUsernames(users, ids) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (unique.length === 0) {
        return {};
    }
    const docs = await users.find({ _id: { $in: unique } }, { projection: { username: 1 } }).toArray();
    return Object.fromEntries(docs.map((doc) => [String(doc._id), doc.username]));
}

async function listEvents(auditLogs, filter, { page, pageSize }) {
    const total = await auditLogs.countDocuments(filter);
    const docs = await auditLogs.find(filter, { projection: { expireAt: 0 } })
        .sort({ at: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .toArray();
    return { total, docs };
}

export function createAuditRouter({ auditLogs, users, requireAuth, requireAdmin }) {
    const router = Router();

    router.get('/logs/list', requireAuth, requireAdmin, async (req, res) => {
        try {
            const page = intParam(req.query.page, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 1 });
            const pageSize = intParam(req.query.pageSize, { min: 1, max: AUDIT_ADMIN_MAX_PAGE_SIZE, fallback: 20 });
            const from = optionalInt(req.query.from);
            const to = optionalInt(req.query.to);
            if (page.invalid || pageSize.invalid || from.invalid || to.invalid) {
                fail(res, 400, 'Invalid pagination or time range');
                return;
            }
            if (from.value !== undefined && to.value !== undefined && from.value >= to.value) {
                fail(res, 400, 'Invalid time range');
                return;
            }

            const filter = {};
            if (req.query.type !== undefined && req.query.type !== '') {
                if (!AUDIT_EVENT_TYPES.includes(req.query.type)) {
                    fail(res, 400, 'Unknown audit event type');
                    return;
                }
                filter.type = req.query.type;
            }
            if (req.query.result !== undefined && req.query.result !== '') {
                if (!RESULT_VALUES.includes(req.query.result)) {
                    fail(res, 400, 'Unknown audit result');
                    return;
                }
                filter.result = req.query.result;
            }
            if (from.value !== undefined || to.value !== undefined) {
                filter.at = {};
                if (from.value !== undefined) {
                    filter.at.$gte = new Date(from.value);
                }
                if (to.value !== undefined) {
                    filter.at.$lt = new Date(to.value);
                }
            }
            if (typeof req.query.username === 'string' && req.query.username.trim() !== '') {
                // Exact match on the normalized username, as actor OR subject.
                const target = await users.findOne({ username: normalizeUsername(req.query.username) });
                const targetId = target ? parseObjectId(target._id) : null;
                if (!targetId) {
                    res.json({ success: true, data: { items: [], total: 0, page: page.value, pageSize: pageSize.value } });
                    return;
                }
                filter.$or = [{ actorUserId: targetId }, { subjectUserId: targetId }];
            }

            const { total, docs } = await listEvents(auditLogs, filter, { page: page.value, pageSize: pageSize.value });
            const usernames = await resolveUsernames(
                users,
                docs.flatMap((doc) => [doc.actorUserId, doc.subjectUserId]),
            );
            res.json({
                success: true,
                data: {
                    items: docs.map((doc) => toAuditItem(doc, usernames)),
                    total,
                    page: page.value,
                    pageSize: pageSize.value,
                },
            });
        } catch (error) {
            console.error('GET /api/audit/logs/list', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    router.get('/logins/list', requireAuth, async (req, res) => {
        try {
            const page = intParam(req.query.page, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 1 });
            const pageSize = intParam(req.query.pageSize, { min: 1, max: AUDIT_SELF_MAX_PAGE_SIZE, fallback: 20 });
            if (page.invalid || pageSize.invalid) {
                fail(res, 400, 'Invalid pagination');
                return;
            }
            // The subject is always the caller: no parameter can point this at
            // someone else's account.
            const ownId = req.authUser?._id ?? parseObjectId(req.user?.id);
            const filter = ownId
                ? { subjectUserId: ownId, type: { $in: [...AUDIT_SELF_TYPES] } }
                : { _id: { $exists: false } }; // never matches: empty history
            const { total, docs } = await listEvents(auditLogs, filter, { page: page.value, pageSize: pageSize.value });
            res.json({
                success: true,
                data: {
                    items: docs.map(toLoginItem),
                    total,
                    page: page.value,
                    pageSize: pageSize.value,
                },
            });
        } catch (error) {
            console.error('GET /api/audit/logins/list', error);
            res.status(500).json({ success: false, message: error.message });
        }
    });

    return router;
}
