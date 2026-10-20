import { randomBytes } from 'node:crypto';

export const STAGE_MODES = new Set(['single', 'double', 'free']);
export const ACTIVE_SIDES = new Set(['aff', 'neg', 'none']);
export const TIMER_PHASES = new Set(['running', 'grace', 'locked']);
export const MAX_REMAINING_MS = 24 * 60 * 60 * 1000;
export const MAX_GRACE_MS = 300 * 1000;

// C-02-07 remote commands: thin-remote buttons relay through the session to
// the host. Orthogonal verbs + side (toggle covers the remote layout's
// one-button handover; start/stop cover the console's split buttons).
// soundCheck relays the sound_check stage's bell test so it plays on the
// host (venue speakers), not on the remote.
export const COMMAND_TYPES = new Set(['start', 'stop', 'reset', 'toggle', 'applyStage', 'soundCheck']);
export const SOUND_CHECK_KINDS = new Set(['warn30', 'end']);
export const COMMAND_SIDES = new Set(['single', 'aff', 'neg']);
const MAX_PENDING_COMMANDS = 32;
// C-02-08 signaling relay: one-shot RTC handshake frames, transparently
// forwarded (never queued or stored); 32KB covers any offer/answer frame.
const MAX_SIGNAL_BYTES = 32 * 1024;

function invalid(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

function toSnapshot(session) {
    // D20 (PageSpec §15): stamp send time on every outbound snapshot so
    // display/remotes can compensate the in-flight leg. Replays (SSE
    // catch-up, GET /state) get a fresh stamp per delivery — a receive-time
    // stamp would go stale and over-shift late adopters.
    // D23 (PageSpec §16): carry the session identity so consumers can detect
    // a new generation (superseded/restarted) and reset their seq dedup.
    return {
        ...session.lastSnapshot,
        serverTime: Date.now(),
        sessionId: session.sessionId,
    };
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
export function createTimerSessionRegistry({ sse, capacity = 100, heartbeatTimeoutMs = 30000 }) {
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

    // 4-digit pairing code: the phone types it to attach to this session
    // (owner-scoped, lives and dies with the session).
    function newPairingCode() {
        return String(Math.floor(1000 + Math.random() * 9000));
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
        let pairingCode = newPairingCode();
        // Avoid handing two concurrent owner sessions the same code.
        for (const other of sessions.values()) {
            if (other.pairingCode === pairingCode) {
                pairingCode = newPairingCode();
                break;
            }
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
            lastCommandSeq: 0,
            pendingCommands: [],
            pairingCode,
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
        // D29 (PageSpec §18): sovereignty check — a reporter carrying a
        // different session id is putting into a session that was recreated
        // under the same token (another console won the seat). Tell it to
        // yield instead of letting it grind on the winner's seq space with
        // endless "seq must be greater" 400s. Reports without an id keep the
        // legacy behavior (older clients).
        const claimedId = typeof body?.sessionId === 'string' ? body.sessionId : null;
        if (claimedId && claimedId !== session.sessionId) {
            const error = new Error('Session is held by another controller');
            error.status = 409;
            error.code = 'session_taken';
            throw error;
        }
        const snapshot = validateSnapshot(body, session);
        // D32 (PageSpec §19): the host captured these values at captureServerAt
        // (its estimate of the server clock at capture). Advance running
        // clocks by the uplink leg so the stored values line up with the
        // receive time — otherwise every consumer is systematically stale by
        // the host→server latency. Clamped: a bogus stamp shifts by ≤2s.
        const captureAt = Number(body?.captureServerAt);
        if (Number.isFinite(captureAt) && captureAt > 0) {
            const uplinkMs = Math.min(Math.max(Date.now() - captureAt, 0), 2000);
            if (uplinkMs > 0) {
                const shift = (ms) => Math.max(0, ms - uplinkMs);
                if (snapshot.runningAff) {
                    snapshot.remainingAffMs = shift(snapshot.remainingAffMs);
                }
                if (snapshot.runningNeg) {
                    snapshot.remainingNegMs = shift(snapshot.remainingNegMs);
                }
                if (snapshot.phaseAff === 'grace') {
                    snapshot.graceAffMs = shift(snapshot.graceAffMs);
                }
                if (snapshot.phaseNeg === 'grace') {
                    snapshot.graceNegMs = shift(snapshot.graceNegMs);
                }
                if (snapshot.stageMode === 'single') {
                    snapshot.remainingNegMs = snapshot.remainingAffMs;
                    snapshot.graceNegMs = snapshot.graceAffMs;
                }
            }
        }
        session.lastSnapshot = snapshot;
        session.lastSeq = snapshot.seq;
        session.lastSeenAt = Date.now();
        // Host reported → any buffered commands are considered consumed.
        session.pendingCommands.length = 0;
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

    // Validates a remote command, queues it, and pushes it to the host over
    // SSE immediately (queue is only an offline buffer; snapshots flowing
    // back are the implicit ack).
    function pushCommand(shareToken, body) {
        const session = get(shareToken);
        if (!session) {
            throw invalid('No active session');
        }
        const type = body?.type;
        if (!COMMAND_TYPES.has(type)) {
            throw invalid(`Invalid command type: ${type}`);
        }
        const command = { type };
        if (type === 'applyStage') {
            const stageId = String(body.stageId || '');
            if (!session.stageIds.has(stageId)) {
                throw invalid('Invalid command: unknown stageId');
            }
            command.stageId = stageId;
        } else if (type === 'soundCheck') {
            if (!SOUND_CHECK_KINDS.has(body.kind)) {
                throw invalid('Invalid command: soundCheck kind required');
            }
            command.kind = body.kind;
        } else {
            const side = body.side;
            if (!COMMAND_SIDES.has(side)) {
                throw invalid('Invalid command: side required');
            }
            command.side = side;
        }
        if (session.pendingCommands.length >= MAX_PENDING_COMMANDS) {
            const error = new Error('Too many pending commands');
            error.status = 429;
            throw error;
        }
        session.lastCommandSeq += 1;
        command.commandSeq = session.lastCommandSeq;
        command.at = Date.now();
        session.pendingCommands.push(command);
        const frame = { ...command };
        sse.sendToToken(session.shareToken, 'command', frame); // remotes & displays
        sse.sendToOwner(session.ownerId, 'command', frame);     // host console
        return command;
    }

    // C-02-08: transparently relay a one-shot WebRTC signaling frame to the
    // other end over the existing display stream. Payload is not interpreted.
    function relaySignal(shareToken, body) {
        const session = get(shareToken);
        if (!session) {
            throw invalid('No active session');
        }
        const to = body?.to;
        if (to !== 'host' && to !== 'remote') {
            throw invalid('Invalid signal target');
        }
        const payload = body?.payload;
        if (payload == null || typeof payload !== 'object') {
            throw invalid('Signal payload required');
        }
        const serialized = JSON.stringify(payload);
        if (serialized.length > MAX_SIGNAL_BYTES) {
            throw invalid('Signal payload too large');
        }
        const from = to === 'host' ? 'remote' : 'host';
        const frame = { from, to, payload };
        sse.sendToToken(session.shareToken, 'signal', frame);
        sse.sendToOwner(session.ownerId, 'signal', frame);
        return true;
    }

    // Pairing: match an owner's live session by its 4-digit code.
    function pairByCode(ownerId, code) {
        const wanted = String(code || '').trim();
        if (!/^\d{4}$/.test(wanted)) {
            throw invalid('Pairing code must be 4 digits');
        }
        for (const session of sessions.values()) {
            if (Date.now() - session.lastSeenAt > heartbeatTimeoutMs) {
                continue; // expired, will drop lazily on next get()
            }
            if (session.pairingCode === wanted && String(session.ownerId) === String(ownerId)) {
                return session;
            }
        }
        return null;
    }

    // Stamped snapshot for late adopters (display replay / GET state);
    // null when no live session.
    function snapshotOf(shareToken) {
        const session = get(shareToken);
        return session ? toSnapshot(session) : null;
    }

    return { create, get, report, end, pushCommand, relaySignal, pairByCode, snapshotOf };
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
