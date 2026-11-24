import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { authService } from '../services/authService';
import { isTotpRequired } from '../utils/authFlow';

const AuthContext = createContext({
    user: null,
    loading: true,
    status: { hasUsers: true, registrationOpen: false },
    login: async () => ({ success: false }),
    register: async () => ({ success: false }),
    logout: async () => {},
    refresh: async () => {},
    adoptSession: async () => {},
    setPending: () => {},
});

/**
 * `user` is the server's session user: { id, username, role, pending }.
 * `pending` lists the post-login steps the account still owes
 * ('privacy_consent' | 'totp_enroll'); while it is non-empty the rest of the
 * app is closed and the account is routed to /gate (R20).
 */
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState({ hasUsers: true, registrationOpen: false });
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const refreshStatus = useCallback(async () => {
        const result = await authService.status();
        if (!mountedRef.current) {
            return result;
        }
        if (result.success) {
            setStatus(result.data);
        }
        return result;
    }, []);

    const refresh = useCallback(async () => {
        const result = await authService.me();
        if (!mountedRef.current) {
            return result;
        }
        setUser(result.success ? result.data : null);
        return result;
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            await refreshStatus();
            await refresh();
            if (!cancelled) {
                setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [refresh, refreshStatus]);

    /**
     * Stores a session user that a sign-in, sign-up or second-factor response
     * handed back. Only called with a real session: a LOGIN that asks for a
     * second factor carries a ticket instead and starts no session.
     */
    const adoptSession = useCallback(async (data) => {
        if (!mountedRef.current) {
            return;
        }
        setUser(data);
        await refreshStatus();
    }, [refreshStatus]);

    /**
     * Replaces the pending steps on the current session user, from a response
     * that reports them (privacy consent). `pending` is the only field that
     * changes, so the rest of `user` is kept as is.
     */
    const setPending = useCallback((pending) => {
        setUser((prev) => (prev ? { ...prev, pending: Array.isArray(pending) ? pending : [] } : prev));
    }, []);

    const login = useCallback(async (username, password) => {
        const result = await authService.login(username, password);
        // A second-factor response (status 'totp_required') holds a ticket
        // and no session: the page runs the verification step instead.
        if (result.success && !isTotpRequired(result.data)) {
            await adoptSession(result.data);
        }
        return result;
    }, [adoptSession]);

    const register = useCallback(async (username, password, consent) => {
        const result = await authService.register(username, password, consent);
        if (!mountedRef.current) {
            return result;
        }
        if (result.success) {
            await adoptSession(result.data);
        }
        return result;
    }, [adoptSession]);

    const logout = useCallback(async () => {
        await authService.logout();
        if (!mountedRef.current) {
            return;
        }
        setUser(null);
        await refreshStatus();
    }, [refreshStatus]);

    const value = useMemo(
        () => ({
            user,
            loading,
            status,
            login,
            register,
            logout,
            refresh,
            adoptSession,
            setPending,
        }),
        [user, loading, status, login, register, logout, refresh, adoptSession, setPending],
    );

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    return useContext(AuthContext);
}
