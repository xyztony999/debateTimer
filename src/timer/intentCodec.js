/**
 * D40 (v1.1): host operation intent codec. The intent frame IS a command
 * frame plus anchor fields; it rides the display stream so followers replay
 * the operation locally instead of waiting for the next snapshot.
 *
 * Clock domains: anchors travel in the SERVER clock domain.
 * - Host side: server = local + hostClockOffset (D33, NTP-lite EMA).
 * - Follower side: local = server + consumerClockSkew (D34, EMA of frame
 *   arrival samples — same sign convention as compensateInFlight).
 */

// Engine actions that express operator intent and map onto the wire
// command whitelist. TICK/ADOPT/SET_ADVANCE/… are runtime plumbing, never
// intents; PREP_ZERO is a host-local sound_check helper outside the wire
// whitelist.
const INTENT_ACTIONS = new Set(['START', 'STOP', 'TOGGLE', 'RESET', 'APPLY_STAGE', 'SOUND_CHECK']);

/** True when the engine action should be mirrored as an intent frame. */
export function isIntentAction(action) {
    return INTENT_ACTIONS.has(action?.type);
}

/**
 * A command frame is an intent frame iff it carries a numeric
 * anchorServerAt (wire §4.4.11a). Remote-command frames (API-3) never do —
 * followers keep ignoring them (R-1: no replay, no seq-cursor update).
 */
export function isIntentFrame(frame) {
    return Boolean(frame) && typeof frame === 'object'
        && Number.isFinite(Number(frame.anchorServerAt));
}

/**
 * Engine action → wire command body {type, side?, stageId?, kind?};
 * null for actions outside the whitelist.
 */
export function intentBodyFromAction(action) {
    if (!isIntentAction(action)) {
        return null;
    }
    switch (action.type) {
        case 'APPLY_STAGE':
            return { type: 'applyStage', stageId: action.stageId };
        case 'SOUND_CHECK':
            return { type: 'soundCheck', kind: action.kind };
        case 'START':
        case 'STOP':
        case 'TOGGLE':
        case 'RESET':
            return { type: action.type.toLowerCase(), side: action.side };
        default:
            return null;
    }
}

/**
 * Wire intent body (+sessionId/anchors) → engine action for follower-side
 * replay. Translation mirrors the host's applyHostCommand: toggle resolves
 * against the follower's current running state.
 */
export function actionFromIntentBody(body, engineState) {
    const type = body?.type;
    if (type === 'applyStage') {
        return { type: 'APPLY_STAGE', stageId: body.stageId };
    }
    if (type === 'soundCheck') {
        return { type: 'SOUND_CHECK', kind: body.kind };
    }
    if (type === 'toggle') {
        const running = engineState?.sides?.[body.side]?.running;
        return { type: running ? 'STOP' : 'START', side: body.side };
    }
    if (type === 'start' || type === 'stop' || type === 'reset') {
        return { type: type.toUpperCase(), side: body.side };
    }
    return null;
}

/**
 * Host side: build the intent payload (command body + sessionId + anchors
 * in the server domain) from the just-dispatched action.
 *
 * `anchorsBook` is the anchor state written by the dispatch wrapper at the
 * moment of user intent (BEFORE the engine applies its whole-second view),
 * so it already carries the precise post-action ms. Engine ints are the
 * fallback for sides without an anchor yet.
 */
export function buildIntentPayload(action, engineState, anchorsBook, sessionId, clockOffsetMs, now = Date.now()) {
    const body = intentBodyFromAction(action);
    if (!body || !sessionId) {
        return null;
    }
    const offset = Number.isFinite(clockOffsetMs) ? clockOffsetMs : 0;
    const singleMode = engineState?.stageMode === 'single';
    const toWire = (side) => {
        const anchor = anchorsBook?.[side];
        const fallbackSec = engineState?.sides?.[side]?.remaining ?? 0;
        if (anchor?.running) {
            return { running: true, endAtServerMs: anchor.endAt + offset };
        }
        const frozenMs = anchor && !anchor.running
            ? anchor.frozenMs
            : Math.max(0, fallbackSec * 1000);
        return { running: false, frozenMs: Math.max(0, frozenMs) };
    };
    const affSide = singleMode ? 'single' : 'aff';
    const payload = {
        ...body,
        sessionId,
        anchorServerAt: now + offset,
        anchorAff: toWire(affSide),
    };
    if (!singleMode) {
        payload.anchorNeg = toWire('neg');
    }
    return payload;
}

/**
 * Follower-side replay gate (pure decision, D40/FR-C02-02-12). The display
 * stream carries BOTH frame kinds on one `command` event; this function
 * decides what a follower does with each:
 *
 * - Remote-command frames (no anchorServerAt): ignore, and leave the dedup
 *   cursor untouched (R-1 — replaying them would double-apply host state).
 * - Intent frames: dedup on the session-wide monotonic commandSeq with a
 *   sessionId generation guard (D23), translate to an engine action with
 *   the host's applyHostCommand rules, and convert the server-domain
 *   anchors to the local domain for wall-clock anchoring.
 *
 * Returns { accept: false, reason } to skip, or
 * { accept: true, seq, sessionId, generationReset, action, anchors }.
 */
export function planIntentReplay(frame, {
    lastSeq = 0, knownSessionId = null, skewMs = 0, engineState = null, now = Date.now(),
} = {}) {
    if (!isIntentFrame(frame)) {
        return { accept: false, reason: 'not-intent' }; // R-1: cursor untouched
    }
    const seq = Number(frame.commandSeq);
    if (!Number.isFinite(seq) || seq <= 0) {
        return { accept: false, reason: 'malformed-seq' };
    }
    const sessionId = typeof frame.sessionId === 'string' ? frame.sessionId : null;
    // D23: a changed session generation restarts the shared seq space.
    const generationReset = Boolean(sessionId) && Boolean(knownSessionId) && sessionId !== knownSessionId;
    if (!generationReset && seq <= lastSeq) {
        return { accept: false, reason: 'stale-seq' };
    }
    const action = actionFromIntentBody(frame, engineState);
    if (!action) {
        return { accept: false, reason: 'unsupported-type' };
    }
    const anchors = anchorsFromIntentFrame(frame, skewMs, now);
    return { accept: true, seq, sessionId, generationReset, action, anchors };
}

/**
 * Follower side: convert the frame's server-domain anchors to local-domain
 * remaining ms (running: endAtLocal − now; frozen: frozenMs as-is). Returns
 * the sides that carried a usable anchor.
 */
export function anchorsFromIntentFrame(frame, skewMs, now = Date.now()) {
    const skew = Number.isFinite(skewMs) ? skewMs : 0;
    const convert = (raw) => {
        if (raw == null || typeof raw !== 'object') {
            return undefined;
        }
        if (raw.running === true && Number.isFinite(Number(raw.endAtServerMs))) {
            return { running: true, remainMs: Number(raw.endAtServerMs) + skew - now };
        }
        if (raw.running !== true && Number.isFinite(Number(raw.frozenMs))) {
            return { running: false, frozenMs: Math.max(0, Number(raw.frozenMs)) };
        }
        return undefined;
    };
    const aff = convert(frame.anchorAff);
    const neg = convert(frame.anchorNeg);
    const out = {};
    if (aff) {
        out.aff = aff;
    }
    if (neg) {
        out.neg = neg;
    }
    return out;
}
