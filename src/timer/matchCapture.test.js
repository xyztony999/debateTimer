import {
    beginStageCapture,
    closeCurrentEntry,
    bumpOverrun,
    buildMatchPayload,
    computeActuals,
} from './matchCapture.js';

const T0 = 1000000;

function entryOf(overrides = {}) {
    return {
        stageId: 's1',
        label: 'Stage 1',
        mode: 'single',
        plannedSeconds: 120,
        graceSeconds: 30,
        actualAffSeconds: 0,
        actualNegSeconds: 0,
        overrunAff: 0,
        overrunNeg: 0,
        enteredAt: T0,
        exitedAt: null,
        ...overrides,
    };
}

test('computeActuals: untouched clock = grace fully unused', () => {
    const actuals = computeActuals(entryOf(), { aff: { remaining: 120, graceLeft: null, locked: false }, neg: null });
    expect(actuals).toEqual({ actualAffSeconds: 0, actualNegSeconds: 0 });
});

test('computeActuals: mid-grace counts elapsed time plus elapsed grace', () => {
    // 30s spoken, then 10s of grace burned: 40s actual.
    const actuals = computeActuals(entryOf(), { aff: { remaining: 90, graceLeft: 20, locked: false }, neg: null });
    expect(actuals.actualAffSeconds).toBe(40);
});

test('computeActuals: locked with no grace left counts the whole window', () => {
    const actuals = computeActuals(entryOf(), { aff: { remaining: 0, graceLeft: null, locked: true }, neg: null });
    expect(actuals.actualAffSeconds).toBe(150);
});

test('computeActuals: dual mode sums both sides independently', () => {
    const actuals = computeActuals(entryOf({ mode: 'double' }), {
        aff: { remaining: 100, graceLeft: null, locked: false },
        neg: { remaining: 60, graceLeft: null, locked: false },
    });
    expect(actuals).toEqual({ actualAffSeconds: 20, actualNegSeconds: 60 });
});

test('beginStageCapture closes the previous entry and opens a new one', () => {
    const first = beginStageCapture(null, {
        stageId: 's1', label: 'One', mode: 'single', plannedSeconds: 60, graceSeconds: 0, now: T0, sidesNow: null,
    });
    expect(first.startedAt).toBe(T0);
    expect(first.entries).toHaveLength(1);

    const second = beginStageCapture(first, {
        stageId: 's2', label: 'Two', mode: 'double', plannedSeconds: 90, graceSeconds: 0,
        now: T0 + 30000,
        sidesNow: { aff: { remaining: 45, graceLeft: null, locked: false }, neg: { remaining: 90, graceLeft: null, locked: false } },
    });
    expect(second.startedAt).toBe(T0);
    expect(second.entries).toHaveLength(2);
    expect(second.entries[0]).toMatchObject({ actualAffSeconds: 15, exitedAt: T0 + 30000 });
    expect(second.entries[1]).toMatchObject({ stageId: 's2', exitedAt: null });
});

test('closeCurrentEntry is idempotent', () => {
    const closed = closeCurrentEntry(entryOf(), { aff: { remaining: 30, graceLeft: null, locked: false }, neg: null }, T0 + 10);
    expect(closed.exitedAt).toBe(T0 + 10);
    expect(closeCurrentEntry(closed, { aff: { remaining: 0, graceLeft: null, locked: false }, neg: null }, T0 + 20)).toBe(closed);
});

test('bumpOverrun only touches the open entry of the current stage', () => {
    let capture = { startedAt: T0, entries: [entryOf()] };
    capture = bumpOverrun(capture, 'Aff', 's1');
    capture = bumpOverrun(capture, 'Aff', 's1');
    capture = bumpOverrun(capture, 'Neg', 's1');
    expect(capture.entries[0]).toMatchObject({ overrunAff: 2, overrunNeg: 1 });

    // Wrong stage or closed entry: no-op.
    expect(bumpOverrun(capture, 'Aff', 'other')).toBe(capture);
    const closed = { startedAt: T0, entries: [closeCurrentEntry(capture.entries[0], null, T0 + 5)] };
    expect(bumpOverrun(closed, 'Aff', 's1')).toBe(closed);
});

test('buildMatchPayload closes all entries and includes team names when set', () => {
    let capture = beginStageCapture(null, {
        stageId: 's1', label: 'One', mode: 'single', plannedSeconds: 60, graceSeconds: 0, now: T0, sidesNow: null,
    });
    const payload = buildMatchPayload(capture, {
        configName: 'default',
        teamNames: { aff: '清华', neg: '北大' },
        now: T0 + 60000,
        sidesNow: { aff: { remaining: 10, graceLeft: null, locked: false }, neg: null },
    });
    expect(payload.configName).toBe('default');
    expect(payload.teamNames).toEqual({ aff: '清华', neg: '北大' });
    expect(payload.startedAt).toBe(T0);
    expect(payload.endedAt).toBe(T0 + 60000);
    expect(payload.stages[0]).toMatchObject({ actualAffSeconds: 50, exitedAt: T0 + 60000 });
});

test('buildMatchPayload omits empty team names and returns null without entries', () => {
    const payload = buildMatchPayload(
        { startedAt: T0, entries: [entryOf()] },
        { configName: 'x', teamNames: {}, now: T0 + 1, sidesNow: null },
    );
    expect(payload.teamNames).toBeUndefined();

    expect(buildMatchPayload(null, { configName: 'x', teamNames: {}, now: T0, sidesNow: null })).toBeNull();
    expect(buildMatchPayload({ startedAt: T0, entries: [] }, { configName: 'x', teamNames: {}, now: T0, sidesNow: null })).toBeNull();
});
