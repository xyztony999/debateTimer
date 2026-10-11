import { randomBytes } from 'node:crypto';

export const STAGE_MODES = new Set(['single', 'double', 'free']);
export const ACTIVE_SIDES = new Set(['aff', 'neg', 'none']);
export const TIMER_PHASES = new Set(['running', 'grace', 'locked']);
export const MAX_REMAINING_MS = 24 * 60 * 60 * 1000;
export const MAX_GRACE_MS = 300 * 1000;

function invalid(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

function toSnapshot(session) {
    return { ...session.lastSnapshot };
}

function initialStageId(doc) {
    const order = Array.isArray(doc.stageOrder) && doc.stageOrder.length > 0
        ? doc.stageOrder
        : Object.keys(doc.debateStages || {});
    const valid = order.filter((stage) => Object.prototype.hasOwnProperty.call(doc.debateStages || {}, stage));
    return valid[0] || null;
}

function normalizeMode(value) {
    return STAGE_MODES.has(value) ? value : 'double';
}

function buildInitialSnapshot(doc) {
    const stageId = initialStageId(doc);
    const stageMode = stageId ? normalizeMode(doc.timerSettings?.[stageId]) : 'single';
    const remainingMs = stageId ? Number(doc.debateStages[stageId]) * 1000 : 0;
    return {
        seq: 0,
        stageId,
        stageMode,
        remainingAffMs: remainingMs,
        remainingNegMs: remainingMs,
        runningAff: false,
        runningNeg: false,
        activeSide: 'none',
        serverTime: Date.now(),
    };
}

/**
 * In-memory control-session registry keyed by share token. One active session
 * per token; sessions die with the process. All timestamps are epoch ms.
 */
export function createTimerSessionRegistry({ sse, capacity = 100, heartbeatTimeoutMs = 10000 }) {
    /** @type {Map<string, object>} */
    const sessions = new Map();

    function emitSession(session, type, reason) {
        sse.sendToToken(session.shareToken, 'session', {
            type,
            reason,
            sessionId: session.sessionId,
        });
    }

    function emitState(session) {
        sse.sendToToken(session.shareToken, 'state', toSnapshot(session));
    }

    function drop(session, type, reason) {
        sessions.delete(session.shareToken);
        emitSession(session, type, reason);
    }

    // Lazy expiry: checked whenever a session is read (INV-3). No timers.
    function get(shareToken) {
        if (!shareToken) {
            return null;
        }
        const session = sessions.get(shareToken);
        if (!session) {
            return null;
        }
        if (Date.now() - session.lastSeenAt > heartbeatTimeoutMs) {
            drop(session, 'expired', 'heartbeat_timeout');
            return null;
        }
        return session;
    }

    function create({ doc }) {
        if (!doc?.shareEnabled || !doc?.shareToken) {
            throw invalid('Sharing must be enabled before starting a session');
        }
        const existing = sessions.get(doc.shareToken);
        if (existing) {
            drop(existing, 'ended', 'superseded');
        }
        if (sessions.size >= capacity) {
            const error = new Error('Session capacity reached');
            error.status = 409;
            throw error;
        }
        const session = {
            sessionId: randomBytes(12).toString('hex'),
            configId: doc._id,
            configName: doc.name,
            shareToken: doc.shareToken,
            ownerId: doc.ownerId,
            stageIds: new Set(Object.keys(doc.debateStages || {})),
            startedAt: Date.now(),
            lastSeenAt: Date.now(),
            lastSeq: 0,
            lastSnapshot: buildInitialSnapshot(doc),
        };
        sessions.set(session.shareToken, session);
        emitSession(session, 'started', null);
        emitState(session);
        return session;
    }

    // Validates and normalizes a reported snapshot, then stamps server time.
    function report(shareToken, body) {
        const session = get(shareToken);
        if (!session) {
            throw invalid('No active session');
        }
        const snapshot = validateSnapshot(body, session);
        session.lastSnapshot = snapshot;
        session.lastSeq = snapshot.seq;
        session.lastSeenAt = Date.now();
        emitState(session);
        return session;
    }

    function end(shareToken, reason = 'closed_by_operator') {
        const session = get(shareToken);
        if (!session) {
            return false;
        }
        drop(session, 'ended', reason);
        return true;
    }

    return { create, get, report, end };
}

export function validateSnapshot(body, session) {
    if (!body || typeof body !== 'object') {
        throw invalid('Snapshot body is required');
    }
    const seq = Number(body.seq);
    if (!Number.isInteger(seq) || seq <= session.lastSeq) {
        throw invalid(`Invalid snapshot: seq must be greater than ${session.lastSeq}`);
    }
    const stageId = String(body.stageId || '');
    if (!session.stageIds.has(stageId)) {
        throw invalid('Invalid snapshot: unknown stageId');
    }
    const stageMode = body.stageMode;
    if (!STAGE_MODES.has(stageMode)) {
        throw invalid('Invalid snapshot: unknown stageMode');
    }
    const readRemaining = (value) => {
        const num = Number(value);
        if (!Number.isInteger(num) || num < 0 || num > MAX_REMAINING_MS) {
            throw invalid('Invalid snapshot: remaining time out of range');
        }
        return num;
    };
    const readPhase = (phase, graceMs, side) => {
        if (phase === undefined) {
            phase = 'running';
        }
        if (!TIMER_PHASES.has(phase)) {
            throw invalid(`Invalid snapshot: unknown ${side} phase`);
        }
        // grace ⇔ graceMs>0; running/locked require no remaining grace.
        if ((phase === 'grace') !== (graceMs > 0)) {
            throw invalid(`Invalid snapshot: phase/grace mismatch for ${side}`);
        }
        return phase;
    };
    const readGrace = (value, side) => {
        const num = Number(value ?? 0);
        if (!Number.isInteger(num) || num < 0 || num > MAX_GRACE_MS) {
            throw invalid(`Invalid snapshot: ${side} grace out of range`);
        }
        return num;
    };
    let remainingAffMs = readRemaining(body.remainingAffMs);
    let remainingNegMs = readRemaining(body.remainingNegMs);
    let runningAff = body.runningAff === true;
    let runningNeg = body.runningNeg === true;
    let activeSide = body.activeSide;
    let graceAffMs = readGrace(body.graceAffMs, 'aff');
    let graceNegMs = readGrace(body.graceNegMs, 'neg');
    let phaseAff = readPhase(body.phaseAff, graceAffMs, 'aff');
    let phaseNeg = readPhase(body.phaseNeg, graceNegMs, 'neg');

    // Mode normalization (single collapses both sides; activeSide only in free).
    if (stageMode === 'single') {
        remainingNegMs = remainingAffMs;
        runningNeg = false;
        activeSide = 'none';
        phaseNeg = phaseAff;
        graceNegMs = graceAffMs;
    } else if (stageMode === 'double') {
        activeSide = 'none';
    } else if (!ACTIVE_SIDES.has(activeSide)) {
        throw invalid('Invalid snapshot: unknown activeSide');
    }

    return {
        seq,
        stageId,
        stageMode,
        remainingAffMs,
        remainingNegMs,
        runningAff,
        runningNeg,
        activeSide,
        phaseAff,
        phaseNeg,
        graceAffMs,
        graceNegMs,
        serverTime: Date.now(),
    };
}
