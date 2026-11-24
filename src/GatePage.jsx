import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import AuthShell from './components/AuthShell';
import PrivacyNoticeBody from './components/account/PrivacyNoticeBody';
import TotpEnrollPanel from './components/account/TotpEnrollPanel';
import { NOTICE_STATUS, usePrivacyNotice } from './components/account/usePrivacyNotice';
import { authService } from './services/authService';
import { accountService } from './services/accountService';
import { privacyService } from './services/privacyService';
import { useAuth } from './context/AuthContext';
import { GATE, currentGateStep } from './utils/authFlow';
import { GATE_SYNC_PARAM } from './utils/authRedirect';
import { gateExitPath } from './utils/safeNextPath';

const BASE = import.meta.env.BASE_URL || '/';

function ProgressShell() {
    const { t } = useTranslation();
    return (
        <AuthShell maxWidth={480}>
            <LinearProgress aria-label={t('common.loading')} />
        </AuthShell>
    );
}

/**
 * Step one: the privacy notice. The account agrees to the version it was just
 * shown, or signs out. Shown until the text is on screen — consent is never
 * collected for something that failed to load (S-01 PageSpec §4.2).
 */
function PrivacyConsentStep({ onAccepted, onDecline }) {
    const { t } = useTranslation();
    const { status, notice, load } = usePrivacyNotice({ autoLoad: true });
    const [busy, setBusy] = useState(false);
    const [banner, setBanner] = useState(null);

    const ready = status === NOTICE_STATUS.READY && Boolean(notice?.version);

    const accept = async () => {
        if (busy || !ready) {
            return;
        }
        setBusy(true);
        setBanner(null);
        const result = await privacyService.acceptConsent(notice.version);
        setBusy(false);
        if (result.success) {
            onAccepted(Array.isArray(result.data?.pending) ? result.data.pending : []);
            return;
        }
        if (result.status === 409 && result.code === 'PRIVACY_NOTICE_UPDATED') {
            // The wording changed since it was loaded: show the new one and
            // ask again. The button stays disabled until it has arrived.
            setBanner({ severity: 'warning', text: t('auth.privacyUpdated') });
            load();
            return;
        }
        setBanner({ severity: 'error', text: result.message || t('common.actionFailed') });
    };

    return (
        <Stack spacing={2.5}>
            <Stack spacing={0.75}>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                    {t('privacy.gate.title')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {t('privacy.gate.subtitle')}
                </Typography>
            </Stack>
            {banner ? <Alert severity={banner.severity}>{banner.text}</Alert> : null}
            <Box sx={{ maxHeight: '55vh', overflowY: 'scroll', pr: 1 }}>
                {status === NOTICE_STATUS.READY && notice ? (
                    <PrivacyNoticeBody notice={notice} />
                ) : status === NOTICE_STATUS.ERROR ? (
                    <Stack spacing={1.5}>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                            {t('auth.privacyLoadFailed')}
                        </Typography>
                        <Button variant="outlined" size="small" onClick={load} sx={{ alignSelf: 'flex-start' }}>
                            {t('auth.privacyRetry')}
                        </Button>
                    </Stack>
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        {t('auth.privacyLoading')}
                    </Typography>
                )}
            </Box>
            <Button variant="contained" size="large" disabled={busy || !ready} onClick={accept} sx={{ py: 1.25 }}>
                {t('privacy.gate.accept')}
            </Button>
            <Button variant="text" color="inherit" disabled={busy} onClick={onDecline} sx={{ py: 0.5 }}>
                {t('privacy.gate.decline')}
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ textAlign: 'center', lineHeight: 1.6 }}>
                {t('privacy.gate.declineHint')}
            </Typography>
        </Stack>
    );
}

/**
 * Step two: mandatory two-step setup for administrators. Reads the status
 * first (it says whether a password proof is needed), then runs the shared
 * enrollment panel (S-01 PageSpec §4.3).
 */
function TotpEnrollStep({ onDone }) {
    const { t } = useTranslation();
    const [status, setStatus] = useState(null);
    const [state, setState] = useState('loading');
    const requestSeqRef = useRef(0);

    const load = useCallback(async () => {
        const seq = ++requestSeqRef.current;
        setState('loading');
        const result = await accountService.getTotpStatus();
        if (seq !== requestSeqRef.current) {
            return;
        }
        if (result.success) {
            setStatus(result.data);
            setState('ready');
        } else {
            setState('error');
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const intro = (
        <Stack spacing={0.75}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                {t('account.totp.enrollTitle')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {t('account.totp.enrollRequired')}
            </Typography>
        </Stack>
    );

    if (state === 'loading') {
        return (
            <Stack spacing={2.5}>
                {intro}
                <LinearProgress aria-label={t('account.totp.enrollTitle')} />
            </Stack>
        );
    }

    if (state === 'error') {
        return (
            <Stack spacing={2.5}>
                {intro}
                <Alert severity="error">{t('common.loadFailed')}</Alert>
                <Button variant="outlined" onClick={load} sx={{ alignSelf: 'flex-start' }}>
                    {t('common.retry')}
                </Button>
            </Stack>
        );
    }

    if (status?.available !== true) {
        // Cannot happen while the server lists this step (it does not list it
        // without a key); kept as a way out rather than a dead end.
        return (
            <Stack spacing={2.5}>
                {intro}
                <Alert severity="warning">{t('account.totp.unavailable')}</Alert>
                <Button variant="contained" onClick={onDone} sx={{ alignSelf: 'flex-start' }}>
                    {t('account.totp.continue')}
                </Button>
            </Stack>
        );
    }

    return (
        <Stack spacing={2.5}>
            {intro}
            <TotpEnrollPanel status={status} onDone={onDone} doneLabelKey="account.totp.finish" />
        </Stack>
    );
}

/**
 * `/gate` — the page an account lands on while it still owes a post-login
 * step: confirming the current privacy notice, and (administrators only)
 * binding an authenticator. Until every step is done the server refuses all
 * business calls with 403 GATE_REQUIRED, so nothing else of the app is
 * reachable (S-01 PageSpec §4).
 *
 * Which step to show comes from `user.pending`, in the server's order. The
 * page is its own guard: no session → sign-in page; nothing owed → the
 * destination in `next`, or the home route.
 */
export default function GatePage() {
    const { t } = useTranslation();
    const { user, loading, logout, refresh, adoptSession, setPending } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const nextParam = searchParams.get('next');
    // Arrived through a 403 on another page: the step list in memory predates
    // it and must be re-read before the page decides anything.
    const mustSync = searchParams.get(GATE_SYNC_PARAM) === '1';
    const [syncing, setSyncing] = useState(mustSync);
    const [syncError, setSyncError] = useState(false);
    const [leaving, setLeaving] = useState(false);
    const aliveRef = useRef(true);

    useEffect(() => {
        aliveRef.current = true;
        return () => {
            aliveRef.current = false;
        };
    }, []);

    /**
     * Re-reads the account (GET /me). A failed read for any reason other than
     * "no session" keeps the page here with a retry: the session is most
     * likely fine and sending the account to the sign-in form would mislead.
     */
    const sync = useCallback(async () => {
        setSyncing(true);
        setSyncError(false);
        const result = await authService.me();
        if (!aliveRef.current) {
            return;
        }
        if (result.success) {
            await adoptSession(result.data);
            if (aliveRef.current) {
                setSyncing(false);
            }
            return;
        }
        if (result.status === 401) {
            // No session: clearing `user` sends the account to sign in.
            await refresh();
            return;
        }
        setSyncError(true);
        setSyncing(false);
    }, [adoptSession, refresh]);

    useEffect(() => {
        if (mustSync) {
            sync();
        }
    }, [mustSync, sync]);

    // "Disagree and sign out" and the card's own sign-out button: one request,
    // then the sign-in page (without a destination to come back to).
    const leave = async () => {
        setLeaving(true);
        try {
            await logout();
        } finally {
            navigate('/login', { replace: true });
        }
    };

    if (leaving) {
        return <ProgressShell />;
    }
    if (syncError) {
        return (
            <AuthShell maxWidth={480}>
                <Stack spacing={2.5}>
                    <Alert severity="error">{t('common.loadFailed')}</Alert>
                    <Stack direction="row" spacing={1}>
                        <Button variant="outlined" onClick={sync}>{t('common.retry')}</Button>
                        <Button color="inherit" onClick={leave}>{t('auth.logout')}</Button>
                    </Stack>
                </Stack>
            </AuthShell>
        );
    }
    if (loading || syncing) {
        return <ProgressShell />;
    }
    if (!user) {
        return <Navigate to={`/login?next=${encodeURIComponent(nextParam ?? '')}`} replace />;
    }

    const step = currentGateStep(user);
    if (step === 'done') {
        return <Navigate to={gateExitPath(nextParam, BASE)} replace />;
    }

    let body;
    if (step === GATE.PRIVACY_CONSENT) {
        body = <PrivacyConsentStep onAccepted={setPending} onDecline={leave} />;
    } else if (step === GATE.TOTP_ENROLL) {
        // After binding, re-read the account: the response says whether the
        // privacy step appeared meanwhile (a new notice version).
        body = <TotpEnrollStep onDone={sync} />;
    } else {
        // A step this build does not know (added by a newer server): say so
        // and offer the way out instead of showing an empty card.
        body = (
            <Stack spacing={2.5}>
                <Typography variant="h5" component="h1" sx={{ fontWeight: 600 }}>
                    {t('privacy.gate.title')}
                </Typography>
                <Alert severity="error">{t('privacy.gate.unsupported')}</Alert>
            </Stack>
        );
    }

    return (
        <AuthShell maxWidth={480}>
            <Stack spacing={2}>
                {body}
                <Button variant="text" color="inherit" onClick={leave} sx={{ py: 0.5 }}>
                    {t('auth.logout')}
                </Button>
            </Stack>
        </AuthShell>
    );
}
