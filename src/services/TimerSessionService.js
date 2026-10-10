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
            const { data, status } = await apiClient.post(sessionPath(name));
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
     * Display-side live subscription. One EventSource on the shared display
     * stream; native auto-reconnect, with onOpen fired after every (re)connect
     * so the caller can re-sync via loadDisplayState.
     */
    onDisplayState(token, { onState, onSession, onOpen } = {}) {
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
