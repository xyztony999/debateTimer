/**
 * C-02-08 P2P direct link: a WebRTC DataChannel between the thin remote and
 * the host when both sit on the same LAN (host candidates only — no
 * STUN/TURN, no cross-network hole punching). Signaling frames ride the
 * existing session channel (POST /session/signal + SSE `signal` event).
 *
 * Everything degrades gracefully: if the channel never opens (or drops),
 * callers keep using the server-relayed path; open() resolves to null.
 */

const OPEN_TIMEOUT_MS = 3000;

function freshPc() {
    // iceServers: [] → host candidates only (same-LAN direct or nothing).
    return new RTCPeerConnection({ iceServers: [] });
}

/**
 * Remote side: initiate. Returns a controller; `onMessage` receives host
 * frames ({ snapshot } | { pong }); `onState('open'|'closed')` drives the
 * UI badge and the fallback decision.
 */
export function initiateDirectChannel({ sendSignal, onSignal, onMessage, onState }) {
    let settled = false;
    let signalOff = null;
    // Host candidates can beat the answer over the relay — buffer them.
    let remoteDescriptionSet = false;
    const pendingIce = [];
    const pc = freshPc();
    const channel = pc.createDataChannel('remote', { ordered: true });

    const finish = (state) => {
        if (settled) {
            return;
        }
        settled = true;
        onState?.(state);
    };

    const timer = window.setTimeout(() => {
        // Handshake didn't complete in time → give up, stay on server path.
        try { pc.close(); } catch { /* already closed */ }
        finish('closed');
    }, OPEN_TIMEOUT_MS);

    channel.onopen = () => {
        window.clearTimeout(timer);
        finish('open');
    };
    channel.onclose = () => {
        window.clearTimeout(timer);
        finish('closed');
    };
    channel.onmessage = (event) => {
        try {
            onMessage?.(JSON.parse(event.data));
        } catch {
            // Ignore malformed frames.
        }
    };

    pc.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal({ to: 'host', payload: { kind: 'ice', candidate: event.candidate } });
        }
    };

    signalOff = onSignal((frame) => {
        (async () => {
            try {
                if (frame?.from !== 'host') {
                    return;
                }
                const payload = frame.payload || {};
                if (payload.kind === 'answer') {
                    await pc.setRemoteDescription(payload.description);
                    remoteDescriptionSet = true;
                    for (const candidate of pendingIce.splice(0)) {
                        await pc.addIceCandidate(candidate);
                    }
                } else if (payload.kind === 'ice' && payload.candidate) {
                    if (remoteDescriptionSet) {
                        await pc.addIceCandidate(payload.candidate);
                    } else {
                        pendingIce.push(payload.candidate);
                    }
                }
            } catch {
                // Bad frame / state race → the open timeout handles fallback.
            }
        })();
    });

    (async () => {
        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            sendSignal({ to: 'host', payload: { kind: 'offer', description: pc.localDescription } });
        } catch {
            window.clearTimeout(timer);
            try { pc.close(); } catch { /* ignore */ }
            finish('closed');
        }
    })();

    return {
        get isOpen() {
            return channel.readyState === 'open';
        },
        send(message) {
            if (channel.readyState !== 'open') {
                return false;
            }
            channel.send(JSON.stringify(message));
            return true;
        },
        close() {
            window.clearTimeout(timer);
            signalOff?.();
            try { pc.close(); } catch { /* ignore */ }
        },
    };
}

/**
 * Host side: answer automatically when the remote initiates. `onMessage`
 * receives remote frames (commands); `onState` mirrors the remote's.
 */
export function answerDirectChannel({ sendSignal, onSignal, onMessage, onState }) {
    let settled = false;
    let pc = null;
    let channel = null;
    let signalOff = null;
    // Remote candidates can beat the offer over the relay — buffer them.
    let pendingIce = [];

    const finish = (state) => {
        if (settled) {
            return;
        }
        settled = true;
        onState?.(state);
    };

    signalOff = onSignal((frame) => {
        (async () => {
            try {
                if (frame?.from !== 'remote') {
                    return;
                }
                const payload = frame.payload || {};
                if (payload.kind === 'offer') {
                    pc?.close();
                    pc = freshPc();
                    channel = null;
                    settled = false;
                    pendingIce = [];
                    pc.ondatachannel = (event) => {
                        channel = event.channel;
                        channel.onopen = () => finish('open');
                        channel.onclose = () => {
                            finish('closed');
                            channel = null;
                        };
                        channel.onmessage = (msg) => {
                            try {
                                onMessage?.(JSON.parse(msg.data));
                            } catch {
                                // Ignore malformed frames.
                            }
                        };
                    };
                    pc.onicecandidate = (event) => {
                        if (event.candidate) {
                            sendSignal({ to: 'remote', payload: { kind: 'ice', candidate: event.candidate } });
                        }
                    };
                    await pc.setRemoteDescription(payload.description);
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    sendSignal({ to: 'remote', payload: { kind: 'answer', description: pc.localDescription } });
                    for (const candidate of pendingIce.splice(0)) {
                        await pc.addIceCandidate(candidate);
                    }
                } else if (payload.kind === 'ice' && payload.candidate) {
                    if (pc?.remoteDescription) {
                        await pc.addIceCandidate(payload.candidate);
                    } else {
                        pendingIce.push(payload.candidate);
                    }
                }
            } catch {
                // Handshake race → the remote's timeout falls back to relay.
            }
        })();
    });

    return {
        get isOpen() {
            return channel?.readyState === 'open';
        },
        send(message) {
            if (!channel || channel.readyState !== 'open') {
                return false;
            }
            channel.send(JSON.stringify(message));
            return true;
        },
        close() {
            signalOff?.();
            try { pc?.close(); } catch { /* ignore */ }
        },
    };
}
