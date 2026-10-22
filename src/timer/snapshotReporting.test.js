import { createSnapshotQueue, snapshotFailureAction } from './snapshotReporting.js';
import { createTimerSessionRegistry } from '../../server/lib/timerSessions.js';

function deferred() {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
}

function registry() {
    const reg = createTimerSessionRegistry({ sse: { sendToToken() {} } });
    const session = reg.create({ doc: {
        _id: 'cfg1', name: 'default', ownerId: 'owner1',
        shareEnabled: true, shareToken: 'tok1',
        debateStages: { sound_check: 31 }, timerSettings: { sound_check: 'single' },
    } });
    return { reg, session };
}

function snapshot(session, seq, ms = 31000) {
    return {
        sessionId: session.sessionId, seq, stageId: 'sound_check', stageMode: 'single',
        remainingAffMs: ms, remainingNegMs: ms, runningAff: false, runningNeg: false,
        activeSide: 'none',
    };
}

test('out-of-order reports reproduce a recoverable 400 while the server session remains active', () => {
    const { reg, session } = registry();
    reg.report('tok1', snapshot(session, 2));
    let error;
    try {
        reg.report('tok1', snapshot(session, 1));
    } catch (caught) {
        error = caught;
    }
    expect(error.status).toBe(400);
    expect(snapshotFailureAction(error)).toBe('ignore');
    expect(reg.get('tok1')).toBe(session);
    reg.report('tok1', snapshot(session, 3));
    expect(reg.snapshotOf('tok1').seq).toBe(3);
});

test('slow heartbeat and rapid operations are serialized and coalesced into the latest snapshot', async () => {
    const { reg, session } = registry();
    const queue = createSnapshotQueue();
    const blocked = deferred();
    const started = deferred();
    const sent = [];
    let seq = 0;
    let remainingMs = 31000;
    const report = async () => {
        const body = snapshot(session, ++seq, remainingMs);
        sent.push(body);
        if (seq === 1) {
            started.resolve();
            await blocked.promise;
        }
        reg.report('tok1', body);
    };
    const first = queue.enqueue(report);
    await started.promise;
    remainingMs = 30000;
    queue.enqueue(report);
    remainingMs = 0;
    const last = queue.enqueue(report);

    expect(sent).toHaveLength(1);
    blocked.resolve();
    await Promise.all([first, last]);
    expect(sent.map((body) => body.seq)).toEqual([1, 2]);
    expect(reg.snapshotOf('tok1')).toMatchObject({ seq: 2, remainingAffMs: 0 });
});

test('a failed request does not block the pending refresh or later heartbeats', async () => {
    const queue = createSnapshotQueue();
    const blocked = deferred();
    const started = deferred();
    const calls = [];
    const first = queue.enqueue(async () => {
        started.resolve();
        await blocked.promise;
        calls.push('network error');
        return { success: false, message: 'Network Error' };
    });
    await started.promise;
    queue.enqueue(async () => { calls.push('latest state'); });
    blocked.resolve();
    await first;
    await queue.enqueue(async () => { calls.push('next heartbeat'); });
    expect(calls).toEqual(['network error', 'latest state', 'next heartbeat']);
});

test('an unexpected exception releases the queue for subsequent reports', async () => {
    const queue = createSnapshotQueue();
    await expect(queue.enqueue(async () => { throw new Error('unexpected'); })).rejects.toThrow('unexpected');
    const calls = [];
    await queue.enqueue(async () => { calls.push('recovered'); });
    expect(calls).toEqual(['recovered']);
});

test('expired sessions recover, and snapshot validation or network failures keep the host attached', () => {
    expect(snapshotFailureAction({ status: 400, message: 'No active session' })).toBe('recover');
    expect(snapshotFailureAction({ status: 400, message: 'Invalid snapshot: unknown stageId' })).toBe('retry');
    expect(snapshotFailureAction({ status: 400, message: 'Invalid snapshot: phase/grace mismatch for aff' })).toBe('retry');
    expect(snapshotFailureAction({ message: 'Network Error' })).toBe('retry');
    expect(snapshotFailureAction({ status: 503 })).toBe('retry');
});

test('ownership and access failures still terminate reporting', () => {
    expect(snapshotFailureAction({ status: 409, code: 'session_taken' })).toBe('yield');
    expect(snapshotFailureAction({ status: 403 })).toBe('end');
    expect(snapshotFailureAction({ status: 404 })).toBe('end');
});
