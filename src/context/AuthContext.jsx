import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
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

    const refreshStatus = useCallback(async () => {
        const result = await authService.status();
        if (result.success) {
            setStatus(result.data);
        }
        return result;
    }, []);

    const refresh = useCallback(async () => {
        const result = await authService.me();
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
        if (result.success) {
            setUser(result.data);
            await refreshStatus();
        }
        return result;
    }, [refreshStatus]);

    const register = useCallback(async (username, password) => {
        const result = await authService.register(username, password);
        if (result.success) {
            setUser(result.data);
            await refreshStatus();
        }
        return result;
    }, [refreshStatus]);

    const logout = useCallback(async () => {
        await authService.logout();
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
