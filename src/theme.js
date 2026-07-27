import { createTheme } from '@mui/material/styles';

const FONT_FAMILY = [
    'Roboto',
    '"Noto Sans SC"',
    '"PingFang SC"',
    '"Microsoft YaHei"',
    'sans-serif',
].join(',');

const shared = {
    typography: {
        fontFamily: FONT_FAMILY,
        h4: {
            fontWeight: 500,
            letterSpacing: '-0.01em',
        },
        h6: {
            fontWeight: 500,
        },
        button: {
            textTransform: 'none',
            fontWeight: 500,
        },
    },
    shape: {
        borderRadius: 10,
    },
    components: {
        MuiCssBaseline: {
            styleOverrides: {
                body: {
                    fontFamily: FONT_FAMILY,
                },
            },
        },
        MuiButton: {
            defaultProps: {
                disableElevation: true,
            },
        },
    },
};

/**
 * Build light or dark Material theme for DebateTimer.
 * Deep blue-grey primary — avoids default purple / cream looks.
 * @param {'light' | 'dark'} mode
 */
export function createAppTheme(mode = 'light') {
    const isDark = mode === 'dark';

    return createTheme({
        ...shared,
        palette: {
            mode,
            primary: isDark
                ? {
                    main: '#90caf9',
                    light: '#e3f2fd',
                    dark: '#42a5f5',
                    contrastText: '#0d1b2a',
                }
                : {
                    main: '#1e3a5f',
                    light: '#3d5a80',
                    dark: '#0f2744',
                    contrastText: '#ffffff',
                },
            secondary: isDark
                ? {
                    main: '#81a4c9',
                    contrastText: '#0d1b2a',
                }
                : {
                    main: '#4a6fa5',
                    contrastText: '#ffffff',
                },
            error: {
                main: isDark ? '#ef5350' : '#c62828',
            },
            success: {
                main: isDark ? '#66bb6a' : '#2e7d32',
            },
            background: isDark
                ? {
                    default: '#0f1419',
                    paper: '#1a2332',
                }
                : {
                    default: '#f0f2f5',
                    paper: '#ffffff',
                },
            text: isDark
                ? {
                    primary: '#e8eef4',
                    secondary: '#9aa8b8',
                }
                : {
                    primary: '#1a2332',
                    secondary: '#5a6577',
                },
        },
        components: {
            ...shared.components,
            MuiCard: {
                styleOverrides: {
                    root: {
                        boxShadow: isDark
                            ? '0 1px 3px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.25)'
                            : '0 1px 3px rgba(30, 58, 95, 0.08), 0 4px 16px rgba(30, 58, 95, 0.06)',
                    },
                },
            },
            MuiAppBar: {
                styleOverrides: {
                    root: isDark
                        ? {
                            backgroundImage: 'none',
                            backgroundColor: '#1a2332',
                            color: '#e8eef4',
                        }
                        : undefined,
                },
            },
        },
    });
}

/** @deprecated Prefer createAppTheme(mode) — kept for accidental default imports. */
export default createAppTheme('light');
