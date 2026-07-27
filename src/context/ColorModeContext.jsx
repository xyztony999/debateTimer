import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from '../theme';

const STORAGE_KEY = 'darkMode';

const ColorModeContext = createContext({
    darkMode: false,
    toggleDarkMode: () => {},
    setDarkMode: () => {},
});

function readInitialDarkMode() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored !== null) {
            return stored === 'true';
        }
    } catch {
        // ignore
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
}

export function ColorModeProvider({ children }) {
    const [darkMode, setDarkModeState] = useState(readInitialDarkMode);

    const setDarkMode = useCallback((next) => {
        setDarkModeState(next);
        try {
            localStorage.setItem(STORAGE_KEY, String(next));
        } catch {
            // ignore
        }
    }, []);

    const toggleDarkMode = useCallback(() => {
        setDarkModeState((prev) => {
            const next = !prev;
            try {
                localStorage.setItem(STORAGE_KEY, String(next));
            } catch {
                // ignore
            }
            return next;
        });
    }, []);

    // Keep legacy CSS dark-mode hooks (timer page) in sync without wiping other body classes.
    useEffect(() => {
        document.body.classList.toggle('dark-mode', darkMode);
    }, [darkMode]);

    // Follow system preference only when the user has not set an explicit choice.
    useEffect(() => {
        let stored = null;
        try {
            stored = localStorage.getItem(STORAGE_KEY);
        } catch {
            // ignore
        }
        if (stored !== null) return undefined;

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = (e) => setDarkModeState(e.matches);
        media.addEventListener('change', handleChange);
        return () => media.removeEventListener('change', handleChange);
    }, []);

    const theme = useMemo(
        () => createAppTheme(darkMode ? 'dark' : 'light'),
        [darkMode],
    );

    const value = useMemo(
        () => ({ darkMode, toggleDarkMode, setDarkMode }),
        [darkMode, toggleDarkMode, setDarkMode],
    );

    return (
        <ColorModeContext.Provider value={value}>
            <ThemeProvider theme={theme}>
                <CssBaseline />
                {children}
            </ThemeProvider>
        </ColorModeContext.Provider>
    );
}

export function useColorMode() {
    return useContext(ColorModeContext);
}
