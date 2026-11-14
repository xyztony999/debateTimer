import {
    actionFromIntentBody,
    anchorsFromIntentFrame,
    buildIntentPayload,
    intentBodyFromAction,
    isIntentAction,
    isIntentFrame,
} from './intentCodec.js';

const ENGINE = {
    stageMode: 'double',
    sides: {
        single: { remaining: 0 },
        aff: { remaining: 42, running: true },
        neg: { remaining: 7, running: false },
    },
};

test('isIntentAction whitelists operator-intent actions only', () => {
    expect(isIntentAction({ type: 'START', side: 'aff' })).toBe(true);
    expect(isIntentAction({ type: 'SOUND_CHECK', kind: 'warn30' })).toBe(true);
    expect(isIntentAction({ type: 'TICK', elapsedMs: 1000 })).toBe(false);
    expect(isIntentAction({ type: 'ADOPT' })).toBe(false);
    expect(isIntentAction({ type: 'PREP_ZERO' })).toBe(false);
    expect(isIntentAction({ type: 'CONSUME_EVENTS' })).toBe(false);
});

test('isIntentFrame keys off the anchorServerAt field (R-1)', () => {
    const intent = { type: 'stop', side: 'aff', commandSeq: 3, anchorServerAt: 1700000000000 };
    const remoteCommand = { type: 'toggle', side: 'single', commandSeq: 2, at: 1700000000000 };
    expect(isIntentFrame(intent)).toBe(true);
    expect(isIntentFrame(remoteCommand)).toBe(false);
    expect(isIntentFrame(null)).toBe(false);
});

test('intentBodyFromAction maps engine actions to the wire whitelist', () => {
    expect(intentBodyFromAction({ type: 'START', side: 'neg' })).toEqual({ type: 'start', side: 'neg' });
    expect(intentBodyFromAction({ type: 'APPLY_STAGE', stageId: 'free_debate' }))
        .toEqual({ type: 'applyStage', stageId: 'free_debate' });
    expect(intentBodyFromAction({ type: 'SOUND_CHECK', kind: 'end' }))
        .toEqual({ type: 'soundCheck', kind: 'end' });
    expect(intentBodyFromAction({ type: 'TICK' })).toBeNull();
});

test('actionFromIntentBody mirrors the host command translation', () => {
    expect(actionFromIntentBody({ type: 'start', side: 'aff' }, ENGINE))
        .toEqual({ type: 'START', side: 'aff' });
    expect(actionFromIntentBody({ type: 'stop', side: 'neg' }, ENGINE))
        .toEqual({ type: 'STOP', side: 'neg' });
    expect(actionFromIntentBody({ type: 'toggle', side: 'aff' }, ENGINE))
        .toEqual({ type: 'STOP', side: 'aff' });
    expect(actionFromIntentBody({ type: 'toggle', side: 'neg' }, ENGINE))
        .toEqual({ type: 'START', side: 'neg' });
    expect(actionFromIntentBody({ type: 'applyStage', stageId: 'x' }, ENGINE))
        .toEqual({ type: 'APPLY_STAGE', stageId: 'x' });
    expect(actionFromIntentBody({ type: 'detonate' }, ENGINE)).toBeNull();
});

test('buildIntentPayload carries server-domain anchors (offset = server − local)', () => {
    const now = 1_000_000;
    const anchors = {
        aff: { running: true, endAt: now + 60_000, frozenMs: 0 },
        neg: { running: false, endAt: 0, frozenMs: 7_000 },
    };
    const payload = buildIntentPayload(
        { type: 'STOP', side: 'aff' },
        ENGINE,
        anchors,
        'session-1',
        +1500, // host clock runs 1.5s behind the server
        now,
    );
    expect(payload).toEqual({
        type: 'stop',
        side: 'aff',
        sessionId: 'session-1',
        anchorServerAt: now + 1500,
        anchorAff: { running: true, endAtServerMs: now + 60_000 + 1500 },
        anchorNeg: { running: false, frozenMs: 7000 },
    });
});

test('buildIntentPayload collapses single mode to one anchor and falls back to engine ints', () => {
    const now = 5_000_000;
    const singleEngine = { stageMode: 'single', sides: { single: { remaining: 30 } } };
    const payload = buildIntentPayload(
        { type: 'TOGGLE', side: 'single' },
        singleEngine,
        {}, // no anchors yet — engine fallback
        'session-2',
        NaN,
        now,
    );
    expect(payload.anchorAff).toEqual({ running: false, frozenMs: 30000 });
    expect(payload.anchorNeg).toBeUndefined();
    expect(payload.anchorServerAt).toBe(now); // NaN offset → 0
});

test('buildIntentPayload drops actions without a session', () => {
    expect(buildIntentPayload({ type: 'START', side: 'aff' }, ENGINE, {}, null, 0)).toBeNull();
});

test('anchorsFromIntentFrame converts to the local domain (skew = local − server)', () => {
    const now = 2_000_000;
    const frame = {
        anchorAff: { running: true, endAtServerMs: now + 50_000 },
        anchorNeg: { running: false, frozenMs: 8_000 },
    };
    // local clock runs 2s ahead of the server → end arrives 2s later locally
    const out = anchorsFromIntentFrame(frame, +2000, now);
    expect(out.aff).toEqual({ running: true, remainMs: 52_000 });
    expect(out.neg).toEqual({ running: false, frozenMs: 8000 });
});

test('anchorsFromIntentFrame tolerates missing or malformed anchors', () => {
    const out = anchorsFromIntentFrame({ anchorAff: { running: true } }, 0);
    expect(out.aff).toBeUndefined();
    expect(out.neg).toBeUndefined();
    expect(Object.keys(out)).toHaveLength(0);
});
