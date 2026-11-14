/**
 * Gate 2 critical cases for the v1.1 sync refactor, at the pure-decision
 * layer (bun test has no DOM — renderHook is not available, so the hooks
 * stay thin executors around these functions):
 *
 * - R-1: remote-command frames (no anchorServerAt) never replay on a
 *   follower and never advance the intent dedup cursor — a remote toggle
 *   must not double-apply once the host's intent frame arrives.
 * - R-2: a lost intent heals via the reconciliation snapshot with a
 *   single pull, never a repeated back-and-forth drag.
 * - R-3: sessions hosted by an old client (no intent stream) keep the
 *   display on the pure snapshot-adoption path.
 */
import { planIntentReplay } from './intentCodec.js';
import { adoptSnapshot, isSmoothAdoptable } from './snapshotCodec.js';

const ENGINE = {
    stageMode: 'double',
    stageId: 'free_debate',
    sides: {
        single: { remaining: 0, running: false, phase: 'running', graceLeft: null },
        aff: { remaining: 60, running: true, phase: 'running', graceLeft: null },
        neg: { remaining: 30, running: false, phase: 'running', graceLeft: null },
    },
};

const wire = (over = {}) => ({
    stageId: 'free_debate',
    stageMode: 'double',
    remainingAffMs: 60400,
    remainingNegMs: 30000,
    runningAff: true,
    runningNeg: false,
    phaseAff: 'running',
    phaseNeg: 'running',
    ...over,
});

// ---------------------------------------------------------------------------
// R-1: remote commands are ignored, cursor untouched
// ---------------------------------------------------------------------------

test('R-1: a remote-command frame (no anchor) is rejected as not-intent', () => {
    const remoteCommand = { type: 'toggle', side: 'aff', commandSeq: 7, at: 1700000000000 };
    const verdict = planIntentReplay(remoteCommand, { lastSeq: 5, engineState: ENGINE });
    expect(verdict).toEqual({ accept: false, reason: 'not-intent' });
});

test('R-1: ignored remote-command frames never advance the intent cursor', () => {
    // The remote frame carries seq 7 — higher than the pending intent's 6.
    // Because it is NOT an intent frame, the cursor must stay at 5 so the
    // host's subsequent intent frame (seq 6, lower than 7) still replays.
    expect(planIntentReplay(
        { type: 'toggle', side: 'aff', commandSeq: 7 },
        { lastSeq: 5, engineState: ENGINE },
    ).accept).toBe(false);
    const intent = planIntentReplay(
        {
            type: 'stop', side: 'aff', commandSeq: 6, sessionId: 's1',
            anchorServerAt: 1700000000000,
            anchorAff: { running: false, frozenMs: 60400 },
        },
        { lastSeq: 5, knownSessionId: 's1', engineState: ENGINE },
    );
    expect(intent.accept).toBe(true);
    expect(intent.action).toEqual({ type: 'STOP', side: 'aff' });
});

test('R-1: stale intent frames are dropped by the monotonic cursor', () => {
    const frame = {
        type: 'stop', side: 'aff', commandSeq: 4, sessionId: 's1',
        anchorServerAt: 1, anchorAff: { running: false, frozenMs: 1000 },
    };
    expect(planIntentReplay(frame, { lastSeq: 5, engineState: ENGINE }))
        .toEqual({ accept: false, reason: 'stale-seq' });
});

test('malformed seq is dropped without touching the cursor', () => {
    const frame = {
        type: 'stop', side: 'aff', sessionId: 's1',
        anchorServerAt: 1, anchorAff: { running: false, frozenMs: 1000 },
    };
    expect(planIntentReplay(frame, { lastSeq: 5, engineState: ENGINE }))
        .toEqual({ accept: false, reason: 'malformed-seq' });
});

// ---------------------------------------------------------------------------
// Session-generation guard (D23) shared with snapshot adoption
// ---------------------------------------------------------------------------

test('a new session generation resets the dedup and accepts low seqs', () => {
    const frame = {
        type: 'start', side: 'neg', commandSeq: 1, sessionId: 's2',
        anchorServerAt: 1,
        anchorAff: { running: false, frozenMs: 0 },
        anchorNeg: { running: true, endAtServerMs: 30000 },
    };
    const verdict = planIntentReplay(frame, {
        lastSeq: 42, // far ahead from the previous generation
        knownSessionId: 's1',
        engineState: ENGINE,
    });
    expect(verdict.accept).toBe(true);
    expect(verdict.generationReset).toBe(true);
    expect(verdict.action).toEqual({ type: 'START', side: 'neg' });
    // The caller applies Math.max(0, seq) after the reset → cursor becomes 1.
});

test('an unknown wire type is refused even with valid anchors', () => {
    const frame = {
        type: 'detonate', side: 'aff', commandSeq: 9, sessionId: 's1',
        anchorServerAt: 1, anchorAff: { running: false, frozenMs: 1000 },
    };
    expect(planIntentReplay(frame, { lastSeq: 5, engineState: ENGINE }))
        .toEqual({ accept: false, reason: 'unsupported-type' });
});

test('accepted frames carry local-domain anchors (skew = local − server)', () => {
    const now = 1_000_000;
    const frame = {
        type: 'stop', side: 'aff', commandSeq: 6, sessionId: 's1',
        anchorServerAt: now + 200,
        anchorAff: { running: true, endAtServerMs: now + 50_000 },
    };
    const verdict = planIntentReplay(frame, {
        lastSeq: 5, knownSessionId: 's1', skewMs: 1000, engineState: ENGINE, now,
    });
    expect(verdict.anchors.aff).toEqual({ running: true, remainMs: 51_000 });
});

// ---------------------------------------------------------------------------
// R-3: old-host compatibility — pure snapshot path stays intact
// ---------------------------------------------------------------------------

test('R-3: an old host (intent-less) leaves followers on snapshot adoption', () => {
    // Everything an old host emits on the command event lacks anchors:
    ['toggle', 'start', 'applyStage'].forEach((type) => {
        expect(planIntentReplay(
            { type, side: 'aff', stageId: 'x', commandSeq: 99 },
            { lastSeq: 0, engineState: ENGINE },
        )).toEqual({ accept: false, reason: 'not-intent' });
    });
    // …and snapshots still adopt normally through the unchanged codec path.
    const adopted = adoptSnapshot(wire({ seq: 3 }));
    expect(adopted.sides.aff).toMatchObject({ remaining: 60, running: true });
});

// ---------------------------------------------------------------------------
// R-2: reconciliation pulls at most once per real divergence
// ---------------------------------------------------------------------------

test('R-2: intent-anchored follower is NOT re-pulled by a close snapshot', () => {
    // The intent frame anchored the clock precisely; 5s later the
    // reconciliation snapshot arrives 80ms off the local extrapolation.
    expect(isSmoothAdoptable(wire({ remainingAffMs: 60_080 }), ENGINE)).toBe(true);
});

test('R-2: a structural change (lost STOP) is a real divergence → pull', () => {
    // The STOP intent frame was lost; the local clock still runs while the
    // reconciliation snapshot says frozen — structure differs, adopt once.
    expect(isSmoothAdoptable(wire({ runningAff: false }), ENGINE)).toBe(false);
});

test('R-2: a value divergence beyond the window pulls once, the next beat is smooth', () => {
    // A lost RESET intent: local extrapolates 42s, host froze 120s.
    const diverged = { ...ENGINE, sides: { ...ENGINE.sides, aff: { ...ENGINE.sides.aff, remaining: 42, running: false } } };
    expect(isSmoothAdoptable(wire({ runningAff: false, remainingAffMs: 120_000 }), diverged)).toBe(false);
    // After the single pull the engine sits on 120; the next 5s beat lands
    // inside the window → keep ticking locally, no second pull.
    const pulled = { ...ENGINE, sides: { ...ENGINE.sides, aff: { ...ENGINE.sides.aff, remaining: 120, running: false } } };
    expect(isSmoothAdoptable(wire({ runningAff: false, remainingAffMs: 120_150 }), pulled)).toBe(true);
});

test('a stage change is structural — always adopts (stage switches ride intents)', () => {
    expect(isSmoothAdoptable(wire({ stageId: 'aff_c1' }), ENGINE)).toBe(false);
});

test('grace compares on its own whole-second scale (1s slack)', () => {
    const graceEngine = {
        ...ENGINE,
        sides: {
            ...ENGINE.sides,
            aff: { ...ENGINE.sides.aff, running: false, phase: 'grace', graceLeft: 14 },
        },
    };
    const graceWire = wire({ runningAff: false, phaseAff: 'grace', remainingAffMs: 0, graceAffMs: 14_400 });
    expect(isSmoothAdoptable(graceWire, graceEngine)).toBe(true);
    expect(isSmoothAdoptable(
        wire({ runningAff: false, phaseAff: 'grace', remainingAffMs: 0, graceAffMs: 12_400 }),
        graceEngine,
    )).toBe(false); // 2s apart on the grace clock — beyond the 1s slack
});
