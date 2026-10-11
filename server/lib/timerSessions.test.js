import { createTimerSessionRegistry, validateSnapshot } from './timerSessions.js';

function fakeSse() {
    const sent = [];
    return {
        sent,
        sendToToken: (token, event, payload) => {
            sent.push({ token, event, payload });
        },
    };
}

function configDoc(overrides = {}) {
    return {
        _id: 'cfg1',
        name: 'default',
        ownerId: 'owner1',
        shareEnabled: true,
        shareToken: 'tok1',
        debateStages: { sound_check: 30, free_debate: 180 },
        timerSettings: { sound_check: 'single', free_debate: 'free' },
        stageOrder: ['sound_check', 'free_debate'],
        ...overrides,
    };
}

function registry(sse = fakeSse(), options = {}) {
    return { sse, reg: createTimerSessionRegistry({ sse, ...options }) };
}

test('create requires sharing to be enabled', () => {
    const { reg } = registry();
    expect(() => reg.create({ doc: configDoc({ shareEnabled: false }) })).toThrow();
});

test('create emits started + initial state keyed by share token', () => {
    const { sse, reg } = registry();
    const session = reg.create({ doc: configDoc() });
    expect(session.shareToken).toBe('tok1');
    expect(session.lastSnapshot).toMatchObject({
        seq: 0,
        stageId: 'sound_check',
        stageMode: 'single',
        remainingAffMs: 30000,
        runningAff: false,
    });
    const events = sse.sent.map((s) => s.event);
    expect(events).toContain('session');
    expect(events).toContain('state');
    expect(sse.sent.every((s) => s.token === 'tok1')).toBe(true);
    expect(sse.sent.find((s) => s.event === 'session').payload.type).toBe('started');
});

test('recreating a session supersedes the previous one', () => {
    const { sse, reg } = registry();
    reg.create({ doc: configDoc() });
    const second = reg.create({ doc: configDoc() });
    const reasons = sse.sent.filter((s) => s.event === 'session').map((s) => s.payload);
    expect(reasons).toEqual([
        { type: 'started', reason: null, sessionId: expect.any(String) },
        { type: 'ended', reason: 'superseded', sessionId: expect.any(String) },
        { type: 'started', reason: null, sessionId: second.sessionId },
    ]);
});

test('report validates and normalizes snapshots', () => {
    const { reg } = registry();
    reg.create({ doc: configDoc() });
    const session = reg.get('tok1');

    const snapshot = validateSnapshot({
        seq: 1,
        stageId: 'free_debate',
        stageMode: 'free',
        remainingAffMs: 95000,
        remainingNegMs: 61000,
        runningAff: false,
        runningNeg: true,
        activeSide: 'neg',
    }, session);
    expect(snapshot.activeSide).toBe('neg');
    expect(snapshot.serverTime).toBeGreaterThan(0);

    // single mode collapses neg into aff and clears activeSide
    const single = validateSnapshot({
        seq: 2,
        stageId: 'sound_check',
        stageMode: 'single',
        remainingAffMs: 12000,
        remainingNegMs: 99000,
        runningAff: true,
        runningNeg: true,
        activeSide: 'aff',
    }, session);
    expect(single.remainingNegMs).toBe(12000);
    expect(single.runningNeg).toBe(false);
    expect(single.activeSide).toBe('none');
});

test('report rejects stale seq, unknown stage, bad mode, bad values', () => {
    const { reg } = registry();
    reg.create({ doc: configDoc() });
    const session = reg.get('tok1');

    const base = {
        seq: 1,
        stageId: 'free_debate',
        stageMode: 'free',
        remainingAffMs: 1000,
        remainingNegMs: 1000,
        runningAff: true,
        runningNeg: false,
        activeSide: 'aff',
    };
    expect(() => validateSnapshot({ ...base, seq: 0 }, session)).toThrow(/seq/);
    expect(() => validateSnapshot({ ...base, stageId: 'nope' }, session)).toThrow(/stageId/);
    expect(() => validateSnapshot({ ...base, stageMode: 'rapid' }, session)).toThrow(/stageMode/);
    expect(() => validateSnapshot({ ...base, remainingAffMs: -5 }, session)).toThrow(/remaining/);
    expect(() => validateSnapshot({ ...base, remainingAffMs: 1.5 }, session)).toThrow(/remaining/);
});

test('report updates lastSeen/lastSeq and broadcasts state', () => {
    const { sse, reg } = registry();
    reg.create({ doc: configDoc() });
    const session = reg.report('tok1', {
        seq: 7,
        stageId: 'free_debate',
        stageMode: 'free',
        remainingAffMs: 90000,
        remainingNegMs: 88000,
        runningAff: true,
        runningNeg: false,
        activeSide: 'aff',
    });
    expect(session.lastSeq).toBe(7);
    const last = sse.sent[sse.sent.length - 1];
    expect(last.event).toBe('state');
    expect(last.payload.seq).toBe(7);

    // stale seq is rejected by report too
    expect(() => reg.report('tok1', {
        seq: 7,
        stageId: 'free_debate',
        stageMode: 'free',
        remainingAffMs: 80000,
        remainingNegMs: 88000,
        runningAff: true,
        runningNeg: false,
        activeSide: 'aff',
    })).toThrow(/seq/);
});

test('sessions expire lazily after the heartbeat timeout', () => {
    const { sse, reg } = registry(fakeSse(), { heartbeatTimeoutMs: 50 });
    reg.create({ doc: configDoc() });
    expect(reg.get('tok1')).not.toBeNull();

    // "wait" past the timeout
    const start = Date.now();
    while (Date.now() - start < 60) { /* busy-wait 60ms */ }

    expect(reg.get('tok1')).toBeNull();
    const expired = sse.sent.find((s) => s.event === 'session' && s.payload.type === 'expired');
    expect(expired.payload.reason).toBe('heartbeat_timeout');
});

test('end is idempotent and emits ended', () => {
    const { sse, reg } = registry();
    reg.create({ doc: configDoc() });
    expect(reg.end('tok1')).toBe(true);
    expect(reg.end('tok1')).toBe(false);
    const ended = sse.sent.filter((s) => s.event === 'session').map((s) => s.payload.type);
    expect(ended).toEqual(['started', 'ended']);
});

test('capacity limit rejects with 409', () => {
    const { reg } = registry(fakeSse(), { capacity: 1 });
    reg.create({ doc: configDoc() });
    let caught;
    try {
        reg.create({ doc: configDoc({ shareToken: 'tok2', debateStages: { a: 10 }, stageOrder: ['a'] }) });
    } catch (error) {
        caught = error;
    }
    expect(caught?.status).toBe(409);
});

test('snapshot phases default to running and validate grace consistency', () => {
    const { reg } = registry();
    reg.create({ doc: configDoc() });
    const session = reg.get('tok1');

    const base = {
        seq: 1,
        stageId: 'free_debate',
        stageMode: 'free',
        remainingAffMs: 0,
        remainingNegMs: 61000,
        runningAff: false,
        runningNeg: true,
        activeSide: 'neg',
    };
    // No phase fields: defaults to running/grace 0.
    const plain = validateSnapshot(base, session);
    expect(plain.phaseAff).toBe('running');
    expect(plain.graceAffMs).toBe(0);

    // Grace phase requires graceMs > 0.
    expect(() => validateSnapshot({ ...base, seq: 2, phaseAff: 'grace' }, session)).toThrow(/mismatch/);
    expect(() => validateSnapshot({ ...base, seq: 2, phaseAff: 'running', graceAffMs: 5000 }, session)).toThrow(/mismatch/);
    expect(() => validateSnapshot({ ...base, seq: 2, phaseAff: 'grace', graceAffMs: 300001 }, session)).toThrow(/range/);

    const grace = validateSnapshot({ ...base, seq: 2, phaseAff: 'grace', graceAffMs: 8000 }, session);
    expect(grace.phaseAff).toBe('grace');
    expect(grace.graceAffMs).toBe(8000);
    expect(grace.phaseNeg).toBe('running');

    // Single mode collapses neg phase/grace into aff.
    const single = validateSnapshot({
        seq: 3,
        stageId: 'sound_check',
        stageMode: 'single',
        remainingAffMs: 0,
        remainingNegMs: 999,
        runningAff: false,
        runningNeg: true,
        activeSide: 'aff',
        phaseAff: 'grace',
        phaseNeg: 'running',
        graceAffMs: 7000,
        graceNegMs: 0,
    }, session);
    expect(single.phaseNeg).toBe('grace');
    expect(single.graceNegMs).toBe(7000);
});
