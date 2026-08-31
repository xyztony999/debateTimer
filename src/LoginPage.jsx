import React, { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AuthShell from './components/AuthShell';
import { useAuth } from './context/AuthContext';

function safeNextPath(raw) {
    if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
        return '/';
    }
    return raw;
}

export default function LoginPage() {
    const { t } = useTranslation();
    const { user, loading, status, login, register } = useAuth();
    const [searchParams] = useSearchParams();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [mode, setMode] = useState('login');

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
        <AuthShell maxWidth={420}>
            <Stack spacing={2.5} component="form" onSubmit={submit}>
                <Stack spacing={0.75}>
                    <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
                        {mode === 'register' ? t('auth.registerTitle') : t('auth.loginTitle')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                        {mode === 'register' ? t('auth.registerSubtitle') : t('auth.loginSubtitle')}
                    </Typography>
                </Stack>
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
                <Button type="submit" variant="contained" size="large" disabled={submitting} sx={{ py: 1.25 }}>
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
        </AuthShell>
    );
}
