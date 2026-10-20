/**
 * Snapshot codec: the single place that maps engine state ⇄ the wire
 * snapshot the controller reports and the display adopts
 * (see workspace/02-detailed/api/api-timer-session.md). Previously this
 * mapping was hand-written three times (controller build, display adopt,
 * server validate).
 */

import { PHASE_GRACE, PHASE_LOCKED, PHASE_RUNNING } from './engine.js';

// D21 (PageSpec §15): upper bound for in-flight compensation. Covers relay
// latency + modest clock skew between the display and the API server;
// anything larger is treated as skew and ignored.
const MAX_IN_FLIGHT_MS = 3000;

/**
 * D21: shift a relayed snapshot forward by the time it spent in flight
 * (now - serverTime), so a display adopts the clock position the host has
 * *now* instead of the one it had at capture. Only running clocks (and
 * running grace countdowns) move; direct-link frames carry no serverTime
 * and pass through untouched. Must run BEFORE adoptSnapshot's second
 * floor — it works on the millisecond wire fields.
 */
export function compensateInFlight(snapshot, now = Date.now(), skewMs = 0) {
    const sentAt = Number(snapshot?.serverTime);
    if (!Number.isFinite(sentAt)) {
        return snapshot;
    }
    // D34: skewMs is the consumer's estimated (local − server) clock offset
    // (EMA of frame arrival samples) — subtracting it makes `now` comparable
    // with the server clock the stamp lives in.
    const lagMs = Math.min(Math.max(now - sentAt - skewMs, 0), MAX_IN_FLIGHT_MS);
    if (lagMs <= 0) {
        return snapshot;
    }
    const shift = (ms) => Math.max(0, ms - lagMs);
    return {
        ...snapshot,
        remainingAffMs: snapshot.runningAff ? shift(snapshot.remainingAffMs) : snapshot.remainingAffMs,
        remainingNegMs: snapshot.runningNeg ? shift(snapshot.remainingNegMs) : snapshot.remainingNegMs,
        graceAffMs: snapshot.phaseAff === 'grace' ? shift(snapshot.graceAffMs) : snapshot.graceAffMs,
        graceNegMs: snapshot.phaseNeg === 'grace' ? shift(snapshot.graceNegMs) : snapshot.graceNegMs,
    };
}

function makeSide(remaining, running, phase, graceLeft) {
    return { remaining, running, phase, graceLeft, blinkOverride: false };
}

/**
 * Controller side: engine state → wire snapshot. In single mode the single
 * clock is mirrored onto both wire sides (server enforces the mirror).
 */
export function buildSnapshot(state, seq, liveMs = null) {
    const single = state.stageMode === 'single';
    const aff = single ? state.sides.single : state.sides.aff;
    const neg = single ? state.sides.single : state.sides.neg;
    const graceAffMs = aff.phase === PHASE_GRACE ? (aff.graceLeft ?? 0) * 1000 : 0;
    const graceNegMs = neg.phase === PHASE_GRACE ? (neg.graceLeft ?? 0) * 1000 : 0;
    return {
        seq,
        stageId: state.stageId,
        stageMode: state.stageMode,
        // D38 (PageSpec §20): prefer the wall-clock anchor extrapolation —
        // the engine int is a whole-second quantization that loses the
        // sub-second phase the display needs to flip in lockstep.
        remainingAffMs: Math.max(0, Math.round(liveMs?.affMs ?? aff.remaining * 1000)),
        remainingNegMs: Math.max(0, Math.round(liveMs?.negMs ?? (single ? aff.remaining : neg.remaining) * 1000)),
        runningAff: aff.running,
        runningNeg: single ? false : neg.running,
        activeSide: state.stageMode === 'free'
            ? (state.sides.aff.running ? 'aff' : state.sides.neg.running ? 'neg' : 'none')
            : 'none',
        phaseAff: aff.phase,
        phaseNeg: single ? aff.phase : neg.phase,
        graceAffMs: aff.phase === PHASE_GRACE ? graceAffMs : 0,
        graceNegMs: single ? (aff.phase === PHASE_GRACE ? graceAffMs : 0) : graceNegMs,
    };
}

/**
 * Display side: wire snapshot → engine side states + the carried seq.
 * Pre-v2 snapshots without phases fall back to deriving `locked` from a
 * zero remaining time. Returns null for unusable payloads.
 */
export function adoptSnapshot(snapshot) {
    if (!snapshot || !snapshot.stageId) {
        return null;
    }
    // D35 (PageSpec §19): ROUND, not floor. The wire value is quantized to
    // whole seconds at the host; in-flight compensation subtracts the real
    // lag before this conversion, so flooring would push the adopted second
    // below the host's current second whenever lag > 0 (a systematic -1s).
    // Rounding keeps the digits identical for total flight < 500ms.
    const roundS = (ms) => Math.max(0, Math.round(ms / 1000));
    const secondsAff = roundS(snapshot.remainingAffMs || 0);
    const secondsNeg = roundS(snapshot.remainingNegMs || 0);
    const single = snapshot.stageMode === 'single';
    const affPhase = snapshot.phaseAff || (secondsAff <= 0 ? PHASE_LOCKED : PHASE_RUNNING);
    const negPhase = snapshot.phaseNeg
        || (single ? affPhase : (secondsNeg <= 0 ? PHASE_LOCKED : PHASE_RUNNING));
    const graceSecAff = roundS(snapshot.graceAffMs || 0);
    const graceSecNeg = roundS(snapshot.graceNegMs || 0);

    return {
        seq: Number(snapshot.seq) || 0,
        stageId: snapshot.stageId,
        stageMode: snapshot.stageMode,
        sides: {
            single: makeSide(
                secondsAff,
                single ? Boolean(snapshot.runningAff) : false,
                single ? affPhase : PHASE_RUNNING,
                single && affPhase === PHASE_GRACE ? graceSecAff : null,
            ),
            aff: makeSide(
                secondsAff,
                !single && Boolean(snapshot.runningAff),
                affPhase,
                !single && affPhase === PHASE_GRACE ? graceSecAff : null,
            ),
            neg: makeSide(
                single ? secondsAff : secondsNeg,
                !single && Boolean(snapshot.runningNeg),
                negPhase,
                !single && negPhase === PHASE_GRACE ? graceSecNeg : null,
            ),
        },
    };
}
