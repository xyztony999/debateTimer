import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import AuthShell from './components/AuthShell';
import { useAuth } from './context/AuthContext';
import { registerCopyKeys } from './utils/authCopy';
import { hasPendingGates, isTotpRequired, splitConsentLabel } from './utils/authFlow';
import { safeNextPath } from './utils/safeNextPath';
import { NOTICE_STATUS, usePrivacyNotice } from './components/account/usePrivacyNotice';

// Only downloaded when needed (R20 §9.6): the notice dialog when it is first
// opened, the second-factor step when the password step asks for it.
const PrivacyNoticeDialog = lazy(() => import('./components/account/PrivacyNoticeDialog'));
const TotpStep = lazy(() => import('./components/account/TotpStep'));

const STEP = Object.freeze({ CREDENTIALS: 'credentials', TOTP: 'totp' });
const BASE = import.meta.env.BASE_URL || '/';

export default function LoginPage() {
    const { t } = useTranslation();
    const { user, loading, status, login, register } = useAuth();
    const [searchParams] = useSearchParams();
    const nextParam = searchParams.get('next');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [mode, setMode] = useState('login');

    // Second-factor step: `ticket` proves the password step (server memory
    // only); it lives here, never in storage or the URL.
    const [step, setStep] = useState(STEP.CREDENTIALS);
    const [ticket, setTicket] = useState(null);

    // Privacy notice (R20 D50): shown before the form, consented to on sign-up.
    const [noticeOpen, setNoticeOpen] = useState(false);
    const [noticeDialogNeeded, setNoticeDialogNeeded] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [noticeUpdated, setNoticeUpdated] = useState(false);
    const {
        status: noticeStatus,
        notice,
        load: loadNotice,
        open: openNotice,
    } = usePrivacyNotice();

    useEffect(() => {
        if (status.registrationOpen && !status.hasUsers) {
            setMode('register');
        }
    }, [status.registrationOpen, status.hasUsers]);

    // Sign-up cannot accept consent before the notice is on screen, so the
    // text is fetched as soon as the register form appears.
    useEffect(() => {
        if (mode === 'register' && noticeStatus === NOTICE_STATUS.IDLE) {
            loadNotice();
        }
    }, [mode, noticeStatus, loadNotice]);

    // Consent is given to one wording on one form: leaving register mode, or
    // moving between the first-admin and the public sign-up wording, clears it.
    useEffect(() => {
        setAgreed(false);
        if (mode !== 'register') {
            setNoticeOpen(false);
        }
    }, [mode, status.hasUsers]);

    if (!loading && user) {
        // Still owing a step (privacy notice, mandatory two-step setup): the
        // gate page takes over, with the same destination for afterwards.
        if (hasPendingGates(user)) {
            return <Navigate to={`/gate?next=${encodeURIComponent(nextParam ?? '')}`} replace />;
        }
        return <Navigate to={safeNextPath(nextParam, BASE)} replace />;
    }

    const submittingDisabled = submitting
        || (mode === 'register' && (!agreed || noticeStatus !== NOTICE_STATUS.READY));

    const showNotice = () => {
        setNoticeDialogNeeded(true);
        setNoticeOpen(true);
        openNotice();
    };

    const submit = async (event) => {
        event.preventDefault();
        if (submittingDisabled) {
            return;
        }
        setError('');
        setNoticeUpdated(false);
        setSubmitting(true);
        try {
            if (mode === 'register') {
                const result = await register(username.trim(), password, {
                    agree: true,
                    privacyVersion: notice?.version ?? '',
                });
                if (result.success) {
                    return;
                }
                if (result.status === 409 && result.code === 'PRIVACY_NOTICE_UPDATED') {
                    // The wording changed under the visitor: show the new one
                    // and ask again, consent unchecked.
                    setAgreed(false);
                    setNoticeUpdated(true);
                    setError(t('auth.privacyUpdated'));
                    loadNotice();
                    return;
                }
                setError(result.message || t('auth.failed'));
                return;
            }

            const result = await login(username, password);
            if (result.success) {
                if (isTotpRequired(result.data)) {
                    setTicket(result.data.ticket);
                    setPassword('');
                    setStep(STEP.TOTP);
                }
                return;
            }
            setError(result.message || t('auth.failed'));
        } finally {
            setSubmitting(false);
        }
    };

    const backToCredentials = () => {
        setStep(STEP.CREDENTIALS);
        setTicket(null);
    };

    // The password step's proof ran out (or the server restarted): sign in
    // again from the start; the username is kept, the password was cleared.
    const handleTicketExpired = () => {
        backToCredentials();
        setError(t('auth.totp.expired'));
    };

    const registerCopy = registerCopyKeys(status.hasUsers);
    // The words inside the consent sentence that open the notice. They are
    // not the same as the link above the form in every language ("隐私说明"
    // inside the sentence, "查看隐私说明" above it).
    const consent = splitConsentLabel(t('auth.privacyConsent'), t('auth.privacyConsentLink'));

    return (
        <AuthShell maxWidth={420}>
            {step === STEP.TOTP ? (
                <Suspense fallback={<LinearProgress />}>
                    <TotpStep
                        ticket={ticket}
                        onBack={backToCredentials}
                        onExpired={handleTicketExpired}
                    />
                </Suspense>
            ) : (
                <Stack spacing={2.5} component="form" onSubmit={submit}>
                    <Stack spacing={0.75}>
                        <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
                            {mode === 'register' ? t(registerCopy.titleKey) : t('auth.loginTitle')}
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                            {mode === 'register' ? t(registerCopy.subtitleKey) : t('auth.loginSubtitle')}
                        </Typography>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                        {t('auth.privacyNoticeLine')}{' '}
                        <Link
                            component="button"
                            type="button"
                            underline="hover"
                            onClick={showNotice}
                            sx={{ fontSize: 'inherit', verticalAlign: 'baseline' }}
                        >
                            {t('auth.privacyNoticeLink')}
                        </Link>
                    </Typography>
                    {error ? (
                        <Alert severity={noticeUpdated ? 'warning' : 'error'}>{error}</Alert>
                    ) : null}
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
                    {mode === 'register' ? (
                        <Stack spacing={0.5}>
                            <FormControlLabel
                                control={(
                                    <Checkbox
                                        checked={agreed}
                                        disabled={noticeStatus !== NOTICE_STATUS.READY}
                                        onChange={(e) => setAgreed(e.target.checked)}
                                        inputProps={{ 'aria-label': t('auth.privacyConsent') }}
                                    />
                                )}
                                label={(
                                    <Typography variant="body2" component="span">
                                        {consent.before}
                                        <Link
                                            component="button"
                                            type="button"
                                            underline="hover"
                                            onClick={(e) => {
                                                // Inside a <label>: stop the click from also
                                                // toggling the checkbox it labels.
                                                e.preventDefault();
                                                showNotice();
                                            }}
                                        >
                                            {t('auth.privacyConsentLink')}
                                        </Link>
                                        {consent.after}
                                    </Typography>
                                )}
                            />
                            {noticeStatus === NOTICE_STATUS.LOADING ? (
                                <Typography variant="caption" color="text.secondary">
                                    {t('auth.privacyLoading')}
                                </Typography>
                            ) : null}
                            {noticeStatus === NOTICE_STATUS.ERROR ? (
                                <Alert
                                    severity="warning"
                                    action={(
                                        <Button color="inherit" size="small" onClick={loadNotice}>
                                            {t('auth.privacyRetry')}
                                        </Button>
                                    )}
                                >
                                    {t('auth.privacyLoadFailed')}
                                </Alert>
                            ) : null}
                        </Stack>
                    ) : null}
                    <Button
                        type="submit"
                        variant="contained"
                        size="large"
                        disabled={submittingDisabled}
                        sx={{ py: 1.25 }}
                    >
                        {mode === 'register' ? t('auth.register') : t('auth.login')}
                    </Button>
                    {status.registrationOpen && status.hasUsers ? (
                        <Button
                            type="button"
                            variant="text"
                            onClick={() => {
                                setError('');
                                setNoticeUpdated(false);
                                setMode((prev) => (prev === 'register' ? 'login' : 'register'));
                            }}
                        >
                            {mode === 'register' ? t('auth.haveAccount') : t('auth.needAccount')}
                        </Button>
                    ) : status.hasUsers && !status.registrationOpen ? (
                        <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center' }}>
                            {t('auth.registrationClosed')}
                        </Typography>
                    ) : null}
                </Stack>
            )}
            {noticeDialogNeeded ? (
                <Suspense fallback={null}>
                    <PrivacyNoticeDialog
                        open={noticeOpen}
                        onClose={() => setNoticeOpen(false)}
                        status={noticeStatus}
                        notice={notice}
                        onRetry={loadNotice}
                    />
                </Suspense>
            ) : null}
        </AuthShell>
    );
}
