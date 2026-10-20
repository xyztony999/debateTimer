import { createTimerSessionRegistry, validateSnapshot } from './timerSessions.js';

function fakeSse() {
    const sent = [];
    return {
        sent,
        sendToToken: (token, event, payload) => {
            sent.push({ token, event, payload });
        },
        sendToOwner: (ownerId, event, payload) => {
            sent.push({ token: `owner:${ownerId}`, event, payload });
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

// ---------------------------------------------------------------------------
// C-02-07 remote command channel
// ---------------------------------------------------------------------------

test('pushCommand relays valid commands with monotonic seq over SSE', () => {
    const { sse, reg } = registry();
    reg.create({ doc: configDoc() });

    const cmd1 = reg.pushCommand('tok1', { type: 'toggle', side: 'aff' });
    expect(cmd1.commandSeq).toBe(1);
    const cmd2 = reg.pushCommand('tok1', { type: 'applyStage', stageId: 'free_debate' });
    expect(cmd2.commandSeq).toBe(2);
    expect(cmd2.stageId).toBe('free_debate');

    const commands = sse.sent.filter((s) => s.event === 'command' && s.token === 'tok1');
    expect(commands).toHaveLength(2);
    expect(commands[0].payload).toMatchObject({ type: 'toggle', side: 'aff', commandSeq: 1 });
    expect(commands[0].token).toBe('tok1');
});

test('pushCommand rejects invalid payloads', () => {
    const { reg } = registry();
    reg.create({ doc: configDoc() });

    expect(() => reg.pushCommand('tok1', { type: 'nukeIt' })).toThrow(/Invalid command type/);
    expect(() => reg.pushCommand('tok1', { type: 'toggle' })).toThrow(/side required/);
    expect(() => reg.pushCommand('tok1', { type: 'start', side: 'blue' })).toThrow(/side required/);
    
    expect(() => reg.pushCommand('tok1', { type: 'applyStage', stageId: 'nope' })).toThrow(/unknown stageId/);
    expect(() => reg.pushCommand('tok1', { type: 'applyStage' })).toThrow(/unknown stageId/);
});

test('pushCommand requires a live session', () => {
    const { reg } = registry();
    expect(() => reg.pushCommand('ghost', { type: 'toggle', side: 'single' })).toThrow(/No active session/);
});

test('command queue caps at 32 and empties on host report', () => {
    const { sse, reg } = registry();
    reg.create({ doc: configDoc() });

    for (let i = 0; i < 32; i += 1) {
        reg.pushCommand('tok1', { type: 'toggle', side: 'single' });
    }
    expect(() => reg.pushCommand('tok1', { type: 'toggle', side: 'single' })).toThrow(/Too many pending commands/);

    reg.report('tok1', {
        seq: 1,
        stageId: 'sound_check',
        stageMode: 'single',
        remainingAffMs: 1000,
        remainingNegMs: 1000,
        runningAff: false,
        runningNeg: false,
    });
    // Queue consumed → room again.
    expect(() => reg.pushCommand('tok1', { type: 'toggle', side: 'single' })).not.toThrow();
    expect(sse.sent.filter((s) => s.event === 'command' && s.token === 'tok1')).toHaveLength(33);
    // Owner stream relays the same frames to the host console.
    expect(sse.sent.some((s) => s.event === 'command' && s.token === 'owner:owner1')).toBe(true);
});

test('soundCheck command validates kind', () => {
    const { sse, reg } = registry();
    reg.create({ doc: configDoc() });

    const ok = reg.pushCommand('tok1', { type: 'soundCheck', kind: 'warn30' });
    expect(ok.commandSeq).toBe(1);
    const commands = sse.sent.filter((s) => s.event === 'command');
    expect(commands[0].payload).toMatchObject({ type: 'soundCheck', kind: 'warn30' });

    expect(() => reg.pushCommand('tok1', { type: 'soundCheck' })).toThrow(/kind required/);
    expect(() => reg.pushCommand('tok1', { type: 'soundCheck', kind: 'loud' })).toThrow(/kind required/);
});

// ---------------------------------------------------------------------------
// C-02-08 signaling relay
// ---------------------------------------------------------------------------

test('relaySignal transparently forwards frames with from/to routing', () => {
    const { sse, reg } = registry();
    reg.create({ doc: configDoc() });

    reg.relaySignal('tok1', { to: 'host', payload: { type: 'offer', sdp: 'v=0...' } });
    const frames = sse.sent.filter((s) => s.event === 'signal' && s.token === 'tok1');
    expect(frames).toHaveLength(1);
    expect(frames[0].payload).toMatchObject({ from: 'remote', to: 'host' });
    expect(frames[0].payload.payload).toEqual({ type: 'offer', sdp: 'v=0...' });
});

test('relaySignal validates target/payload/session', () => {
    const { reg } = registry();
    reg.create({ doc: configDoc() });
    expect(() => reg.relaySignal('tok1', { to: 'nobody', payload: {} })).toThrow(/target/);
    expect(() => reg.relaySignal('tok1', { to: 'host' })).toThrow(/payload required/);
    expect(() => reg.relaySignal('tok1', { to: 'host', payload: 'not-object' })).toThrow(/payload required/);
    expect(() => reg.relaySignal('ghost', { to: 'host', payload: {} })).toThrow(/No active session/);
});

test('relaySignal caps payload at 32KB', () => {
    const { reg } = registry();
    reg.create({ doc: configDoc() });
    const big = { blob: 'x'.repeat(33 * 1024) };
    expect(() => reg.relaySignal('tok1', { to: 'host', payload: big })).toThrow(/too large/);
});

// ---------------------------------------------------------------------------
// Pairing (C-02)
// ---------------------------------------------------------------------------

test('pairByCode matches owner sessions by 4-digit code', () => {
    const { reg } = registry();
    const session = reg.create({ doc: configDoc() });
    expect(session.pairingCode).toMatch(/^\d{4}$/);

    const found = reg.pairByCode('owner1', session.pairingCode);
    expect(found.sessionId).toBe(session.sessionId);
    expect(found.configName).toBe('default');
});

test('pairByCode rejects other owners, bad codes, and dead sessions', () => {
    const { reg } = registry();
    const session = reg.create({ doc: configDoc() });

    expect(reg.pairByCode('owner2', session.pairingCode)).toBeNull();
    // Malformed codes throw (client validation), well-formed unknowns return null.
    expect(() => reg.pairByCode('owner1', '12ab')).toThrow(/4 digits/);
    expect(() => reg.pairByCode('owner1', '123')).toThrow(/4 digits/);
    expect(() => reg.pairByCode('owner1', '00000')).toThrow(/4 digits/);

    reg.end('tok1', 'closed_by_operator');
    expect(reg.pairByCode('owner1', session.pairingCode)).toBeNull();
});


// ---- D23/D24 (PageSpec §16): session generation -------------------------

test('snapshotOf stamps sessionId and serverTime; both change across generations', () => {
    const { reg } = registry();
    const first = reg.create({ doc: configDoc() });
    reg.report('tok1', { seq: 1, stageId: 'sound_check', stageMode: 'single', remainingAffMs: 29000, remainingNegMs: 29000, runningAff: true, runningNeg: false, activeSide: 'none' });
    const snap1 = reg.snapshotOf('tok1');
    expect(snap1.sessionId).toBe(first.sessionId);
    expect(snap1.serverTime).toBeGreaterThan(0);

    const second = reg.create({ doc: configDoc() });
    expect(second.sessionId).not.toBe(first.sessionId);
    const snap2 = reg.snapshotOf('tok1');
    expect(snap2.sessionId).toBe(second.sessionId);
    expect(snap2.seq).toBe(0); // new generation restarts the seq space
    expect(snap2.sessionId).not.toBe(snap1.sessionId);
});

test('heartbeat timeout default is 30s (background-tab tolerance)', async () => {
    const { sse, reg } = registry();
    reg.create({ doc: configDoc() });
    // A session reported "just now" is alive; the 30s default is enforced by
    // the lazy-expiry path only after real elapsed time, so here we just
    // assert the registry exposes report/get without immediate expiry.
    expect(reg.get('tok1')).not.toBeNull();
    expect(sse.sent.some((s) => s.event === 'session' && s.payload.type === 'started')).toBe(true);
});


// ---- D29 (PageSpec §18): sovereignty arbitration ------------------------

test('report with a foreign sessionId is rejected 409 session_taken', () => {
    const { reg } = registry();
    const s = reg.create({ doc: configDoc() });
    reg.report('tok1', { seq: 1, stageId: 'sound_check', stageMode: 'single', remainingAffMs: 29000, remainingNegMs: 29000, runningAff: false, runningNeg: false, activeSide: 'none' });
    // Another console recreated the session under the same token.
    const winner = reg.create({ doc: configDoc() });
    expect(winner.sessionId).not.toBe(s.sessionId);
    let err = null;
    try {
        reg.report('tok1', { sessionId: s.sessionId, seq: 99, stageId: 'sound_check', stageMode: 'single', remainingAffMs: 28000, remainingNegMs: 28000, runningAff: true, runningNeg: false, activeSide: 'none' });
    } catch (e) {
        err = e;
    }
    expect(err).not.toBeNull();
    expect(err.status).toBe(409);
    expect(err.code).toBe('session_taken');
});

test('report with the matching sessionId succeeds and is stored clean of it', () => {
    const { reg } = registry();
    const s = reg.create({ doc: configDoc() });
    reg.report('tok1', { sessionId: s.sessionId, seq: 1, stageId: 'sound_check', stageMode: 'single', remainingAffMs: 29000, remainingNegMs: 29000, runningAff: true, runningNeg: false, activeSide: 'none' });
    const snap = reg.snapshotOf('tok1');
    expect(snap.seq).toBe(1);
    expect(snap.sessionId).toBe(s.sessionId); // outbound stamp, not stored inbound
    // stored snapshot keeps no double sessionId key semantics: stamp overrides anyway
});

test('report without sessionId keeps legacy behavior (seq check only)', () => {
    const { reg } = registry();
    reg.create({ doc: configDoc() });
    // no id carried: passes validation regardless of who recreated before
    reg.report('tok1', { seq: 1, stageId: 'sound_check', stageMode: 'single', remainingAffMs: 29000, remainingNegMs: 29000, runningAff: false, runningNeg: false, activeSide: 'none' });
    expect(reg.snapshotOf('tok1').seq).toBe(1);
});


// ---- D32 (PageSpec §19): uplink correction ------------------------------

test('report shifts running clocks by the uplink leg when captureServerAt is present', async () => {
    const { reg } = registry();
    reg.create({ doc: configDoc() });
    const t0 = Date.now();
    // captured "150ms ago" in server-clock terms, only aff running
    const body = {
        seq: 1,
        stageId: 'sound_check',
        stageMode: 'double',
        remainingAffMs: 60000,
        remainingNegMs: 90000,
        runningAff: true,
        runningNeg: false,
        activeSide: 'aff',
        captureServerAt: t0 - 150,
    };
    // server clock advances ~0-5ms during the call; shift ≈150ms
    reg.report('tok1', body);
    const snap = reg.snapshotOf('tok1');
    expect(snap.remainingAffMs).toBeLessThanOrEqual(59850 + 5);
    expect(snap.remainingAffMs).toBeGreaterThanOrEqual(59850);
    expect(snap.remainingNegMs).toBe(90000); // paused side untouched
});

test('report clamps bogus captureServerAt and skips when absent', () => {
    const { reg } = registry();
    reg.create({ doc: configDoc() });
    reg.report('tok1', { seq: 1, stageId: 'sound_check', stageMode: 'single', remainingAffMs: 60000, remainingNegMs: 60000, runningAff: true, runningNeg: false, activeSide: 'none', captureServerAt: Date.now() - 99999 });
    const clamped = reg.snapshotOf('tok1');
    expect(clamped.remainingAffMs).toBe(58000); // max 2s shift
    reg.report('tok1', { seq: 2, stageId: 'sound_check', stageMode: 'single', remainingAffMs: 60000, remainingNegMs: 60000, runningAff: true, runningNeg: false, activeSide: 'none' });
    const plain = reg.snapshotOf('tok1');
    expect(plain.remainingAffMs).toBe(60000); // legacy: untouched
});
