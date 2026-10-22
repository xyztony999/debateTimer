import { apiClient, getApiBaseUrl, toServiceError } from './apiClient';

function sessionPath(name) {
    return `/api/configurations/${encodeURIComponent(name)}/session`;
}

/**
 * Control-session client: the controller (timer page) starts/stops a session
 * and reports timer snapshots; the display page reads/follows them. See
 * workspace/02-detailed/api/api-timer-session.md for the contract.
 */
class TimerSessionService {
    async startSession(name) {
        try {
            const { data, status } = await apiClient.post(sessionPath(name), undefined, { timeout: 10000 });
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            console.error('Error starting timer session:', error);
            return toServiceError(error, 'Error starting timer session');
        }
    }

    async stopSession(name) {
        try {
            const { data, status } = await apiClient.delete(sessionPath(name));
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            console.error('Error stopping timer session:', error);
            return toServiceError(error, 'Error stopping timer session');
        }
    }

    async reportSnapshot(name, snapshot) {
        try {
            const { data, status } = await apiClient.put(
                `${sessionPath(name)}/state`,
                snapshot,
                { timeout: 5000 },
            );
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                    code: data.code ?? null, // D29 §18: session_taken arbitration
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            return toServiceError(error, 'Error reporting timer state');
        }
    }

    async loadDisplayState(token) {
        try {
            const { data, status } = await apiClient.get(
                `/api/display/${encodeURIComponent(token)}/state`,
                { skipAuthRedirect: true },
            );
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            console.error('Error loading display state:', error);
            return toServiceError(error, 'Error loading display state');
        }
    }

    /**
     * C-02-07 remote command relay: thin-remote buttons post a command, the
     * host executes it (ack = the next snapshot flowing back).
     */
    async sendCommand(name, command) {
        try {
            const { data, status } = await apiClient.post(
                `${sessionPath(name)}/command`,
                command,
            );
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            return toServiceError(error, 'Error sending remote command');
        }
    }

    /**
     * C-02 pairing: attach to my live host session by its 4-digit code.
     */
    async pair(code) {
        try {
            const { data, status } = await apiClient.post('/api/session/pair', { code });
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            return toServiceError(error, 'Error pairing');
        }
    }

    /**
     * C-02-08 signaling relay for the P2P direct link (one-shot RTC frames).
     */
    async sendSignal(name, body) {
        try {
            const { data, status } = await apiClient.post(
                `${sessionPath(name)}/signal`,
                body,
            );
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            return toServiceError(error, 'Error sending signal');
        }
    }

    /**
     * Display-side live subscription. One EventSource on the shared display
     * stream; native auto-reconnect, with onOpen fired after every (re)connect
     * so the caller can re-sync via loadDisplayState. C-02-07: hosts listen
     * for `command` events on the same stream (remote buttons → host).
     * C-02-08: `signal` events carry the one-shot RTC handshake frames.
     */
    onDisplayState(token, { onState, onSession, onOpen, onCommand, onSignal } = {}) {
        if (typeof EventSource === 'undefined') {
            return () => {};
        }
        const streamUrl = `${getApiBaseUrl()}/api/display/${encodeURIComponent(token)}/stream`;
        let stopped = false;
        let eventSource = null;

        const safe = (fn) => (...args) => {
            if (stopped) {
                return;
            }
            try {
                fn?.(...args);
            } catch (error) {
                console.error('Timer session listener error:', error);
            }
        };

        const connect = () => {
            if (stopped) {
                return;
            }
            eventSource = new EventSource(streamUrl);
            eventSource.addEventListener('open', safe(() => onOpen?.()));
            eventSource.addEventListener('state', safe((event) => {
                try {
                    onState?.(JSON.parse(event.data));
                } catch (error) {
                    console.error('Invalid state payload:', error);
                }
            }));
            eventSource.addEventListener('session', safe((event) => {
                try {
                    onSession?.(JSON.parse(event.data));
                } catch (error) {
                    console.error('Invalid session payload:', error);
                }
            }));
            eventSource.addEventListener('command', safe((event) => {
                try {
                    onCommand?.(JSON.parse(event.data));
                } catch (error) {
                    console.error('Invalid command payload:', error);
                }
            }));
            eventSource.addEventListener('signal', safe((event) => {
                try {
                    onSignal?.(JSON.parse(event.data));
                } catch (error) {
                    console.error('Invalid signal payload:', error);
                }
            }));
            // No onerror handler: let EventSource retry with backoff, then
            // re-sync through onOpen when the stream comes back.
        };

        connect();

        return () => {
            stopped = true;
            eventSource?.close();
        };
    }
}

export default new TimerSessionService();
