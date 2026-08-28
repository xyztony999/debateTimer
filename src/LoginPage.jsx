import React, { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import LanguageSwitcher from './components/LanguageSwitcher';
import { useAuth } from './context/AuthContext';
import { useColorMode } from './context/ColorModeContext';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';

function safeNextPath(raw) {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
        return '/';
    }
    return raw;
}

export default function LoginPage() {
    const { t } = useTranslation();
    const { user, loading, status, login, register } = useAuth();
    const { darkMode, toggleDarkMode } = useColorMode();
    const [searchParams] = useSearchParams();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [mode, setMode] = useState('login');

    useEffect(() => {
        document.body.classList.add('settings-body');
        return () => {
            document.body.classList.remove('settings-body');
        };
    }, []);

    useEffect(() => {
        if (status.registrationOpen && !status.hasUsers) {
            setMode('register');
        }
    }, [status.registrationOpen, status.hasUsers]);

    if (!loading && user) {
        return <Navigate to={safeNextPath(searchParams.get('next'))} replace />;
    }

    const submit = async (event) => {
        event.preventDefault();
        setError('');
        setSubmitting(true);
        const action = mode === 'register' ? register : login;
        const result = await action(username.trim(), password);
        setSubmitting(false);
        if (!result.success) {
            setError(result.message || t('auth.failed'));
        }
    };

    return (
        <Box
            sx={{
                minHeight: '100vh',
                bgcolor: 'background.default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
            }}
        >
            <Card sx={{ width: '100%', maxWidth: 420 }}>
                <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2.5} component="form" onSubmit={submit}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="h5" component="h1">
                                {mode === 'register' ? t('auth.registerTitle') : t('auth.loginTitle')}
                            </Typography>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <LanguageSwitcher variant="mui" size="small" />
                                <Tooltip title={darkMode ? t('timer.darkLight') : t('timer.darkDark')}>
                                    <IconButton
                                        onClick={toggleDarkMode}
                                        aria-label={darkMode ? t('timer.darkLight') : t('timer.darkDark')}
                                    >
                                        {darkMode ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                            {mode === 'register' ? t('auth.registerSubtitle') : t('auth.loginSubtitle')}
                        </Typography>
                        {error ? <Alert severity="error">{error}</Alert> : null}
                        <TextField
                            required
                            autoComplete="username"
                            label={t('auth.username')}
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            helperText={t('auth.usernameHint')}
                        />
                        <TextField
                            required
                            type="password"
                            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                            label={t('auth.password')}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            helperText={t('auth.passwordHint')}
                        />
                        <Button type="submit" variant="contained" size="large" disabled={submitting}>
                            {mode === 'register' ? t('auth.register') : t('auth.login')}
                        </Button>
                        {status.registrationOpen && status.hasUsers ? (
                            <Button
                                type="button"
                                variant="text"
                                onClick={() => {
                                    setError('');
                                    setMode((prev) => (prev === 'register' ? 'login' : 'register'));
                                }}
                            >
                                {mode === 'register' ? t('auth.haveAccount') : t('auth.needAccount')}
                            </Button>
                        ) : null}
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
}
