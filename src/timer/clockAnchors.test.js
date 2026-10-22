import { anchorResetsForAction } from './clockAnchors.js';
import { initialState, reducer } from './engine.js';
import { buildSnapshot } from './snapshotCodec.js';

function soundCheckState() {
    return reducer(initialState(), {
        type: 'APPLY_STAGE', stageId: 'sound_check', mode: 'single', durationSec: 31,
    });
}

test('30-second sound test replaces the frozen 31-second display and wire time', () => {
    const state = soundCheckState();
    const action = { type: 'SOUND_CHECK', kind: 'warn30' };
    const ms = { single: 31000, ...anchorResetsForAction(state, action) };
    const next = reducer(state, action);

    expect(Math.floor(ms.single / 1000)).toBe(30);
    expect(next.sides.single).toMatchObject({ remaining: 30, running: false, blinkOverride: true });
    expect(buildSnapshot(next, 1, { affMs: ms.single, negMs: ms.single })).toMatchObject({
        remainingAffMs: 30000, remainingNegMs: 30000, runningAff: false,
    });
});

test('sound tests reset the display even while the clock is running', () => {
    const state = reducer(soundCheckState(), { type: 'START', side: 'single' });
    expect(anchorResetsForAction(state, { type: 'SOUND_CHECK', kind: 'warn30' })).toEqual({ single: 30000 });
    expect(anchorResetsForAction(state, { type: 'SOUND_CHECK', kind: 'end' })).toEqual({ single: 0 });
});

test('switching stages anchors the new duration even when it differs by only one second', () => {
    expect(anchorResetsForAction(soundCheckState(), {
        type: 'APPLY_STAGE', stageId: 's1', mode: 'double', durationSec: 32,
    })).toEqual({ single: 32000, aff: 32000, neg: 32000 });
});

test('reset and sound-check zero change only their intended clocks', () => {
    const state = soundCheckState();
    expect(anchorResetsForAction(state, { type: 'RESET', side: 'aff' })).toEqual({ aff: 31000 });
    expect(anchorResetsForAction(state, { type: 'PREP_ZERO' })).toEqual({ single: 0 });
    expect(anchorResetsForAction(state, { type: 'TICK', elapsedMs: 250 })).toEqual({});
});
