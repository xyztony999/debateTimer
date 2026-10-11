import { buildSnapshot, adoptSnapshot } from './snapshotCodec.js';
import { reducer, initialState } from './engine.js';

function stateFor({ mode = 'single', durationSec = 60, graceSec = 0 } = {}) {
    return reducer(initialState(), { type: 'APPLY_STAGE', stageId: 's1', mode, durationSec, graceSec });
}

test('buildSnapshot mirrors the single clock onto both wire sides', () => {
    let state = stateFor({ mode: 'single', durationSec: 120 });
    state = reducer(state, { type: 'START', side: 'single' });
    state = reducer(state, { type: 'TICK' });

    const snap = buildSnapshot(state, 7);
    expect(snap).toMatchObject({
        seq: 7,
        stageId: 's1',
        stageMode: 'single',
        remainingAffMs: 119000,
        remainingNegMs: 119000,
        runningAff: true,
        runningNeg: false,
        activeSide: 'none',
        phaseAff: 'running',
        phaseNeg: 'running',
        graceAffMs: 0,
        graceNegMs: 0,
    });
});

test('buildSnapshot keeps dual sides independent and reports activeSide in free mode', () => {
    let state = stateFor({ mode: 'free', durationSec: 60 });
    state = reducer(state, { type: 'START', side: 'aff' });
    state = reducer(state, { type: 'TICK' });

    const snap = buildSnapshot(state, 1);
    expect(snap.remainingAffMs).toBe(59000);
    expect(snap.remainingNegMs).toBe(60000);
    expect(snap.activeSide).toBe('aff');
    expect(snap.runningAff).toBe(true);
    expect(snap.runningNeg).toBe(false);
});

test('buildSnapshot encodes the grace phase with nonzero grace ms', () => {
    let state = stateFor({ mode: 'double', durationSec: 1, graceSec: 30 });
    state = reducer(state, { type: 'START', side: 'neg' });
    state = reducer(state, { type: 'TICK' }); // → grace

    const snap = buildSnapshot(state, 2);
    expect(snap.phaseNeg).toBe('grace');
    expect(snap.graceNegMs).toBe(30000);
    expect(snap.phaseAff).toBe('running');
    expect(snap.graceAffMs).toBe(0);
});

test('adopt→build round trip is lossless for a running dual snapshot', () => {
    let state = stateFor({ mode: 'double', durationSec: 90 });
    state = reducer(state, { type: 'START', side: 'aff' });
    state = reducer(state, { type: 'TICK' });
    state = reducer(state, { type: 'TICK' });

    const adopted = adoptSnapshot(buildSnapshot(state, 4));
    expect(adopted.seq).toBe(4);
    expect(adopted.stageId).toBe('s1');
    expect(adopted.sides.aff).toMatchObject({ remaining: 88, running: true, phase: 'running', graceLeft: null });
    expect(adopted.sides.neg).toMatchObject({ remaining: 90, running: false, phase: 'running' });
    expect(buildSnapshot({ ...state, sides: adopted.sides }, 5).remainingAffMs).toBe(88000);
});

test('adopt mirrors a single snapshot onto the single clock only', () => {
    const adopted = adoptSnapshot({
        seq: 3,
        stageId: 's1',
        stageMode: 'single',
        remainingAffMs: 42000,
        remainingNegMs: 42000,
        runningAff: true,
        runningNeg: false,
        activeSide: 'none',
        phaseAff: 'running',
        phaseNeg: 'running',
        graceAffMs: 0,
        graceNegMs: 0,
    });
    expect(adopted.sides.single).toMatchObject({ remaining: 42, running: true, phase: 'running' });
    expect(adopted.sides.aff.running).toBe(false);
    expect(adopted.sides.neg.running).toBe(false);
});

test('adopt carries grace and locked phases', () => {
    const adopted = adoptSnapshot({
        seq: 9,
        stageId: 's2',
        stageMode: 'double',
        remainingAffMs: 0,
        remainingNegMs: 30000,
        runningAff: false,
        runningNeg: false,
        activeSide: 'none',
        phaseAff: 'grace',
        phaseNeg: 'running',
        graceAffMs: 7000,
        graceNegMs: 0,
    });
    expect(adopted.sides.aff).toMatchObject({ phase: 'grace', graceLeft: 7, running: false });
    expect(adopted.sides.neg).toMatchObject({ phase: 'running', remaining: 30 });
});

test('adopt falls back to deriving locked for pre-v2 snapshots', () => {
    const adopted = adoptSnapshot({
        seq: 2,
        stageId: 's1',
        stageMode: 'single',
        remainingAffMs: 0,
        remainingNegMs: 0,
        runningAff: false,
        runningNeg: false,
    });
    expect(adopted.sides.single.phase).toBe('locked');
});

test('adopt returns null for unusable payloads', () => {
    expect(adoptSnapshot(null)).toBeNull();
    expect(adoptSnapshot({})).toBeNull();
});
