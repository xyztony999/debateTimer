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

const AuthContext = createContext({
    user: null,
    loading: true,
    status: { hasUsers: true, registrationOpen: false },
    login: async () => ({ success: false }),
    register: async () => ({ success: false }),
    logout: async () => {},
    refresh: async () => {},
});

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

    const login = useCallback(async (username, password) => {
        const result = await authService.login(username, password);
        if (!mountedRef.current) {
            return result;
        }
        if (result.success) {
            setUser(result.data);
            await refreshStatus();
        }
        return result;
    }, [refreshStatus]);

    const register = useCallback(async (username, password) => {
        const result = await authService.register(username, password);
        if (!mountedRef.current) {
            return result;
        }
        if (result.success) {
            setUser(result.data);
            await refreshStatus();
        }
        return result;
    }, [refreshStatus]);

    const logout = useCallback(async () => {
        await authService.logout();
        if (!mountedRef.current) {
            return;
        }
        setUser(null);
        await refreshStatus();
    }, [refreshStatus]);

    const value = useMemo(
        () => ({ user, loading, status, login, register, logout, refresh }),
        [user, loading, status, login, register, logout, refresh],
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
