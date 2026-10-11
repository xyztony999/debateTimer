import {
    reducer,
    initialState,
    isBlinking,
    isFreeLocked,
    activeSide,
    hasClockActivity,
    isStageFullyEnded,
    anyInGrace,
    formatTime,
} from './engine.js';

function applyStage(state, { stageId = 'stage1', mode = 'single', durationSec = 60, graceSec = 0 }) {
    return reducer(state, { type: 'APPLY_STAGE', stageId, mode, durationSec, graceSec });
}

function ticks(state, count) {
    for (let i = 0; i < count; i += 1) {
        state = reducer(state, { type: 'TICK' });
    }
    return state;
}

function sounds(state) {
    return state.events.filter((e) => e.type === 'sound').map((e) => e.node);
}

function overruns(state) {
    return state.events.filter((e) => e.type === 'overrun').map((e) => e.side);
}

// Tick and keep the accumulated events for assertions, then clear them.
function step(state, count = 1) {
    const after = ticks(state, count);
    const events = { sounds: sounds(after), overruns: overruns(after) };
    return [reducer(after, { type: 'CONSUME_EVENTS' }), events];
}

test('APPLY_STAGE resets every side clock to the stage duration', () => {
    let state = applyStage(initialState(), { durationSec: 120, mode: 'double' });
    state = reducer(state, { type: 'START', side: 'aff' });
    state = ticks(state, 5);

    state = applyStage(state, { stageId: 'stage2', mode: 'single', durationSec: 90 });
    expect(state.stageId).toBe('stage2');
    expect(state.stageMode).toBe('single');
    expect(state.sides.single).toMatchObject({ remaining: 90, running: false, phase: 'running' });
    expect(state.sides.aff).toMatchObject({ remaining: 90, running: false });
    expect(state.sides.neg).toMatchObject({ remaining: 90, running: false });
    expect(state.advance).toBeNull();
    expect(state.freeAutoSwitch).toBe(false);
});

test('single clock ticks, warns at 30s, and locks with mustStop at zero', () => {
    let state = applyStage(initialState(), { mode: 'single', durationSec: 32 });
    state = reducer(state, { type: 'START', side: 'single' });

    let events;
    [state, events] = step(state, 2); // 32 → 30
    expect(state.sides.single.remaining).toBe(30);
    expect(events.sounds).toEqual(['warn30']);
    expect(isBlinking(state.sides.single)).toBe(true);

    [state] = step(state, 4); // 30 → 26: blink window over
    expect(state.sides.single.remaining).toBe(26);
    expect(isBlinking(state.sides.single)).toBe(false);

    [state, events] = step(state, 26); // → 0
    expect(state.sides.single).toMatchObject({ remaining: 0, running: false, phase: 'locked' });
    expect(events.sounds).toEqual(['mustStop']);
    expect(events.overruns).toEqual(['Aff']);
    expect(isStageFullyEnded(state)).toBe(true);
});

test('time up with grace opens the grace window then locks', () => {
    let state = applyStage(initialState(), { mode: 'single', durationSec: 2, graceSec: 3 });
    state = reducer(state, { type: 'START', side: 'single' });

    let events;
    [state, events] = step(state, 2);
    expect(state.sides.single).toMatchObject({ phase: 'grace', graceLeft: 3, running: false });
    expect(events.sounds).toEqual(['timeUp']);
    expect(anyInGrace(state)).toBe(true);
    expect(isStageFullyEnded(state)).toBe(false);

    [state] = step(state, 1);
    expect(state.sides.single.graceLeft).toBe(2);

    [state, events] = step(state, 2);
    expect(state.sides.single).toMatchObject({ phase: 'locked', graceLeft: null });
    expect(events.sounds).toEqual(['mustStop']);
    expect(events.overruns).toEqual(['Aff']);
});

test('free debate: running out hands the floor to the other side', () => {
    let state = applyStage(initialState(), { mode: 'free', durationSec: 3 });
    state = reducer(state, { type: 'START', side: 'aff' });
    expect(state.freeAutoSwitch).toBe(true);

    let events;
    [state, events] = step(state, 3);
    expect(state.sides.aff).toMatchObject({ remaining: 0, phase: 'locked' });
    expect(state.sides.neg.running).toBe(true); // floor handed over
    expect(events.overruns).toEqual(['Aff']);

    [state, events] = step(state, 3);
    expect(state.sides.neg.phase).toBe('locked');
    expect(isFreeLocked(state)).toBe(true);
    expect(events.overruns).toEqual(['Neg']);
});

test('free debate: explicit stop hands over, explicit start re-arms the switch', () => {
    let state = applyStage(initialState(), { mode: 'free', durationSec: 60 });
    state = reducer(state, { type: 'START', side: 'aff' });
    state = reducer(state, { type: 'STOP', side: 'aff' });
    expect(state.sides.aff.running).toBe(false);
    expect(state.sides.neg.running).toBe(true);

    state = reducer(state, { type: 'STOP', side: 'neg' });
    expect(state.sides.aff.running).toBe(true);

    // Disarm (via RESET) and stop: no handover.
    state = reducer(state, { type: 'RESET', side: 'aff' });
    expect(state.freeAutoSwitch).toBe(false);
    state = reducer(state, { type: 'STOP', side: 'aff' });
    expect(state.sides.neg.running).toBe(false);
});

test('free debate: no handover to a side that already ran out', () => {
    let state = applyStage(initialState(), { mode: 'free', durationSec: 2 });
    // Burn the neg clock: its time-up hands the floor to aff (still has time).
    state = reducer(state, { type: 'START', side: 'neg' });
    [state] = step(state, 2);
    expect(state.sides.neg.phase).toBe('locked');
    expect(state.sides.aff.running).toBe(true);

    // neg is locked, so aff stopping must NOT hand back.
    state = reducer(state, { type: 'STOP', side: 'aff' });
    expect(state.sides.neg.running).toBe(false);
    expect(state.sides.aff.running).toBe(false);
});

test('double mode: sides tick independently and never hand over', () => {
    let state = applyStage(initialState(), { mode: 'double', durationSec: 5 });
    state = reducer(state, { type: 'START', side: 'aff' });
    state = ticks(state, 5);
    expect(state.sides.aff.phase).toBe('locked');
    expect(state.sides.neg).toMatchObject({ remaining: 5, running: false, phase: 'running' });
    expect(activeSide(state)).toBe('none');
});

test('activeSide tracks the speaking side in free mode only', () => {
    let state = applyStage(initialState(), { mode: 'free', durationSec: 60 });
    expect(activeSide(state)).toBe('none');
    state = reducer(state, { type: 'START', side: 'neg' });
    expect(activeSide(state)).toBe('neg');
});

test('TOGGLE flips a clock and RESET restores the stage duration', () => {
    let state = applyStage(initialState(), { mode: 'single', durationSec: 45 });
    state = reducer(state, { type: 'TOGGLE', side: 'single' });
    expect(state.sides.single.running).toBe(true);
    state = ticks(state, 10);
    state = reducer(state, { type: 'TOGGLE', side: 'single' });
    expect(state.sides.single.running).toBe(false);

    state = reducer(state, { type: 'RESET', side: 'single' });
    expect(state.sides.single).toMatchObject({ remaining: 45, running: false, phase: 'running' });
});

test('auto-advance countdown ticks down to zero and can be cancelled', () => {
    let state = applyStage(initialState(), { mode: 'single', durationSec: 1 });
    state = reducer(state, { type: 'START', side: 'single' });
    [state] = step(state, 1);

    state = reducer(state, { type: 'SET_ADVANCE', value: 3 });
    state = reducer(state, { type: 'ADVANCE_TICK' });
    expect(state.advance).toBe(2);
    state = reducer(state, { type: 'ADVANCE_TICK' });
    state = reducer(state, { type: 'ADVANCE_TICK' });
    expect(state.advance).toBe(0);

    state = reducer(state, { type: 'SET_ADVANCE', value: null });
    expect(state.advance).toBeNull();
});

test('manual start/stop cancels a pending auto advance', () => {
    let state = applyStage(initialState(), { mode: 'free', durationSec: 60 });
    state = reducer(state, { type: 'SET_ADVANCE', value: 3 });
    state = reducer(state, { type: 'START', side: 'aff' });
    expect(state.advance).toBeNull();

    state = reducer(state, { type: 'SET_ADVANCE', value: 3 });
    state = reducer(state, { type: 'STOP', side: 'aff' });
    expect(state.advance).toBeNull();
});

test('SOUND_CHECK previews the 30s blink and the end bell', () => {
    let state = applyStage(initialState(), { mode: 'single', durationSec: 60, stageId: 'sound_check' });

    let events;
    [state, events] = step(reducer(state, { type: 'SOUND_CHECK', kind: 'warn30' }));
    expect(state.sides.single).toMatchObject({ remaining: 30, running: false });
    expect(isBlinking(state.sides.single)).toBe(true);
    expect(events.sounds).toEqual(['warn30']);

    [state, events] = step(reducer(state, { type: 'SOUND_CHECK', kind: 'end' }));
    expect(state.sides.single).toMatchObject({ remaining: 0, phase: 'locked' });
    expect(events.sounds).toEqual(['mustStop']);
});

test('PREP_ZERO zeroes the sound-check clock without locking it', () => {
    let state = applyStage(initialState(), { mode: 'single', durationSec: 31, stageId: 'sound_check' });
    state = reducer(state, { type: 'PREP_ZERO' });
    expect(state.sides.single).toMatchObject({ remaining: 0, phase: 'running', running: false });
});

test('START on a locked clock re-rings the bell and stays stopped', () => {
    let state = applyStage(initialState(), { mode: 'single', durationSec: 1 });
    state = reducer(state, { type: 'START', side: 'single' });
    [state] = step(state, 1);
    expect(state.sides.single.phase).toBe('locked');

    let events;
    [state, events] = step(reducer(state, { type: 'START', side: 'single' }));
    expect(state.sides.single.running).toBe(false);
    expect(state.sides.single.phase).toBe('locked');
    expect(events.sounds).toEqual(['mustStop']);
    expect(events.overruns).toEqual(['Aff']);
});

test('START mid-grace restarts the grace window and rings the time-up bell', () => {
    let state = applyStage(initialState(), { mode: 'double', durationSec: 1, graceSec: 10 });
    state = reducer(state, { type: 'START', side: 'aff' });
    let events;
    [state, events] = step(state, 1);
    expect(state.sides.aff.phase).toBe('grace');
    expect(events.sounds).toEqual(['timeUp']);

    [state] = step(state, 4);
    expect(state.sides.aff.graceLeft).toBe(6);

    const restarted = reducer(state, { type: 'START', side: 'aff' });
    expect(restarted.sides.aff.running).toBe(false);
    expect(restarted.sides.aff.graceLeft).toBe(10);
    expect(sounds(restarted)).toEqual(['timeUp']);
});

test('STOP_ALL freezes every clock (display session ended)', () => {
    let state = applyStage(initialState(), { mode: 'free', durationSec: 60 });
    state = reducer(state, { type: 'START', side: 'aff' });
    state = reducer(state, { type: 'STOP_ALL' });
    expect(hasClockActivity(state)).toBe(false);
    expect(state.sides.aff.running).toBe(false);
    expect(state.sides.neg.running).toBe(false);
});

test('TICK is a no-op when nothing is active', () => {
    let state = applyStage(initialState(), { durationSec: 60 });
    const next = reducer(state, { type: 'TICK' });
    expect(next).toBe(state);
});

test('formatTime pads minutes and seconds', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(600)).toBe('10:00');
});
