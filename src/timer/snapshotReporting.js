// Keep one request in flight and one pending refresh. Capture the pending
// snapshot only when it is sent, so a slow network cannot build a stale backlog.
export function createSnapshotQueue() {
    let pending = null;
    let draining = null;
    return {
        enqueue(task) {
            pending = task;
            if (!draining) {
                draining = Promise.resolve().then(async () => {
                    try {
                        while (pending) {
                            const next = pending;
                            pending = null;
                            await next();
                        }
                    } finally {
                        draining = null;
                    }
                });
            }
            return draining;
        },
    };
}

export function snapshotFailureAction(result) {
    if (result.status === 409 && result.code === 'session_taken') {
        return 'yield';
    }
    if ([403, 404].includes(result.status)) {
        return 'end';
    }
    if (result.status === 400 && /no active session/i.test(String(result.message))) {
        return 'recover';
    }
    if (result.status === 400 && /seq must be greater/i.test(String(result.message))) {
        return 'ignore';
    }
    // A rejected snapshot or a network error does not end the session.
    return 'retry';
}
