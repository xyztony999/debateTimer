import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { accountService } from '../../services/accountService';
import { useFeedback } from '../../context/FeedbackContext';
import {
    classifyPasswordProofFailure,
    classifySecondFactorFailure,
    groupSecret,
    isOtpauthUri,
    isSixDigitCode,
} from '../../utils/authFlow';
import { COPY_RESULT, copyText } from '../../utils/clipboard';
import TotpQrCode from './TotpQrCode';

// password (only when the sign-in is not recent) → starting → scan → codes.
// startFailed is the starting request refused; retry goes back to starting.
const VIEW = Object.freeze({
    PASSWORD: 'password',
    STARTING: 'starting',
    START_FAILED: 'startFailed',
    SCAN: 'scan',
    CODES: 'codes',
});

const MONO = { fontFamily: 'Monaco, Consolas, "Courier New", monospace' };

/**
 * Binds an authenticator to the signed-in account (S-01 PageSpec §4.3, §5.2).
 * One implementation for both places it is used: the gate page (mandatory for
 * administrators) and the settings page (voluntary). They differ only in the
 * last button and what happens after it.
 *
 *   1. password proof, when `status.needsPassword` (session older than the
 *      server's recent-sign-in window)
 *   2. TOTP-SETUP → otpauth link + Base32 key (valid for 10 minutes)
 *   3. TOTP-CONFIRM with one code from the app → recovery codes
 *   4. the account confirms the codes are saved → `onDone()`
 *
 * The key and the recovery codes live in this component's state only; they
 * are gone when it unmounts (the codes are shown exactly once by design).
 *
 * @param {object} props
 * @param {{ available: boolean, needsPassword: boolean }} props.status from TOTP-STATUS
 * @param {() => void} props.onDone called after the account confirmed the codes are saved
 * @param {string} props.doneLabelKey i18n key of that last button
 * @param {(busy: boolean) => void} [props.onBusyChange] called when a request
 *   starts and when it ends. A dialog that shows this panel uses it to stay
 *   open while a request is on its way: a confirm that completes after the
 *   panel is gone would bind the key and lose the only copy of the codes.
 */
export default function TotpEnrollPanel({ status, onDone, doneLabelKey, onBusyChange }) {
    const { t } = useTranslation();
    const { notify } = useFeedback();
    const needsPassword = Boolean(status?.needsPassword);

    const [view, setView] = useState(() => (needsPassword ? VIEW.PASSWORD : VIEW.STARTING));
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    // Result of the last refused request, in the vocabulary of authFlow's
    // classifiers; cleared by the next attempt.
    const [failure, setFailure] = useState(null);
    // A message that must outlive the view it happened in ("setup timed out").
    const [notice, setNotice] = useState('');
    // Plain key while it is being bound; null once it is bound or discarded.
    const [setup, setSetup] = useState(null);
    const [code, setCode] = useState('');
    const [recoveryCodes, setRecoveryCodes] = useState([]);
    const [saved, setSaved] = useState(false);

    const codeInputRef = useRef(null);
    const secretRef = useRef(null);
    const codesRef = useRef(null);

    // Entering "starting" sends TOTP-SETUP. Keyed on the view so a retry
    // simply sets the view again; the password is sent when a proof is needed.
    useEffect(() => {
        if (view !== VIEW.STARTING) {
            return undefined;
        }
        let cancelled = false;
        setFailure(null);
        setSetup(null);
        accountService.setupTotp(needsPassword ? password : undefined).then((result) => {
            if (cancelled) {
                return;
            }
            if (result.success) {
                setSetup(result.data);
                setPassword('');
                setView(VIEW.SCAN);
            } else {
                setFailure(classifyPasswordProofFailure(result));
                setView(VIEW.START_FAILED);
            }
        });
        return () => {
            cancelled = true;
        };
    }, [view, needsPassword, password]);

    // Reports "a request is on its way" to the page that shows this panel.
    // The latest callback is read through a ref so a parent that re-creates it
    // on every render does not turn this into a loop.
    const onBusyChangeRef = useRef(onBusyChange);
    useEffect(() => {
        onBusyChangeRef.current = onBusyChange;
    }, [onBusyChange]);
    const working = busy || view === VIEW.STARTING;
    useEffect(() => {
        onBusyChangeRef.current?.(working);
    }, [working]);

    const alert = (() => {
        if (!failure) {
            return null;
        }
        if (failure.kind === 'wrongPassword') {
            return <Alert severity="error">{t('account.totp.wrongPassword')}</Alert>;
        }
        if (failure.kind === 'unavailable') {
            return <Alert severity="error">{t('account.totp.unavailable')}</Alert>;
        }
        if (failure.kind === 'tooMany') {
            return (
                <Alert severity="error">
                    {t('account.totp.tooMany', { minutes: failure.minutes, count: failure.minutes })}
                </Alert>
            );
        }
        if (failure.kind === 'invalid') {
            return <Alert severity="error">{t('account.totp.codeWrong')}</Alert>;
        }
        return <Alert severity="error">{failure.message || t('common.actionFailed')}</Alert>;
    })();

    // After a refused setup: the password proof was wrong or the service is
    // unavailable; offer to try again from the right view.
    const retryStart = () => {
        setFailure(null);
        setView(needsPassword ? VIEW.PASSWORD : VIEW.STARTING);
    };

    const submitPassword = async (event) => {
        event.preventDefault();
        if (busy || !password) {
            return;
        }
        setBusy(true);
        const result = await accountService.setupTotp(password);
        setBusy(false);
        if (result.success) {
            setSetup(result.data);
            setPassword('');
            setFailure(null);
            setView(VIEW.SCAN);
            return;
        }
        setFailure(classifyPasswordProofFailure(result));
    };

    // The key being bound is gone (timed out, or replaced by a newer setup):
    // begin again with a fresh key. With a password proof that means typing
    // it again — it is never kept around.
    const restartAfterExpiry = () => {
        setSetup(null);
        setCode('');
        setPassword('');
        setFailure(null);
        setNotice(t('account.totp.setupExpired'));
        setView(needsPassword ? VIEW.PASSWORD : VIEW.STARTING);
    };

    const submitCode = async (event) => {
        event.preventDefault();
        if (busy || !isSixDigitCode(code)) {
            return;
        }
        setBusy(true);
        const result = await accountService.confirmTotp(code);
        setBusy(false);
        if (result.success) {
            setRecoveryCodes(Array.isArray(result.data?.recoveryCodes) ? result.data.recoveryCodes : []);
            setCode('');
            setFailure(null);
            setNotice('');
            setSaved(false);
            // The key is bound now; its plain form is not needed any more.
            setSetup(null);
            setView(VIEW.CODES);
            return;
        }

        const next = classifySecondFactorFailure(result);
        if (next.kind === 'setupExpired') {
            restartAfterExpiry();
            return;
        }
        if (next.kind === 'invalid') {
            // The rejected code is spent: start the field over.
            setCode('');
            codeInputRef.current?.focus();
        }
        setFailure(next);
    };

    // "Copy" for the key and the recovery codes. When the clipboard cannot be
    // used, the text is selected on screen and the notice says so; if even
    // that is impossible nothing is reported — the text is right there.
    const copy = async (text, fallbackEl) => {
        const outcome = await copyText(text, fallbackEl);
        if (outcome === COPY_RESULT.COPIED) {
            notify(t('account.totp.copied'), { severity: 'success' });
        } else if (outcome === COPY_RESULT.SELECTED) {
            notify(t('account.totp.copyManual'));
        }
    };

    const copySecret = () => copy(setup?.secret ?? '', secretRef.current);
    const copyCodes = () => copy(recoveryCodes.join('\n'), codesRef.current);

    const locked = failure?.kind === 'tooMany' || failure?.kind === 'unavailable';

    if (view === VIEW.PASSWORD) {
        return (
            <Stack spacing={2.5} component="form" onSubmit={submitPassword}>
                {notice ? <Alert severity="warning">{notice}</Alert> : null}
                {alert}
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {t('account.totp.passwordPrompt')}
                </Typography>
                <TextField
                    autoFocus
                    fullWidth
                    required
                    type="password"
                    autoComplete="current-password"
                    label={t('auth.password')}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="submit" variant="contained" size="large" disabled={busy || !password} sx={{ py: 1.25 }}>
                    {t('account.totp.continue')}
                </Button>
            </Stack>
        );
    }

    if (view === VIEW.STARTING || view === VIEW.START_FAILED) {
        return (
            <Stack spacing={2.5}>
                {notice ? <Alert severity="warning">{notice}</Alert> : null}
                {view === VIEW.STARTING ? <LinearProgress aria-label={t('account.totp.enrollTitle')} /> : null}
                {alert}
                {view === VIEW.START_FAILED ? (
                    <Button variant="outlined" onClick={retryStart} sx={{ alignSelf: 'flex-start' }}>
                        {t('common.retry')}
                    </Button>
                ) : null}
            </Stack>
        );
    }

    if (view === VIEW.CODES) {
        return (
            <Stack spacing={2.5}>
                <Alert severity="warning">
                    <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                        {t('account.totp.step3')}
                    </Typography>
                </Alert>
                <Box
                    ref={codesRef}
                    component="pre"
                    aria-label={t('account.totp.recoveryLabel')}
                    sx={{
                        ...MONO,
                        m: 0,
                        p: 2,
                        borderRadius: 1,
                        bgcolor: 'action.hover',
                        fontSize: '1rem',
                        lineHeight: 1.9,
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all',
                    }}
                >
                    {recoveryCodes.join('\n')}
                </Box>
                <Button variant="outlined" onClick={copyCodes} sx={{ alignSelf: 'flex-start' }}>
                    {t('account.totp.copyAllCodes')}
                </Button>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {t('account.totp.otherDevicesOut')}
                </Typography>
                <FormControlLabel
                    control={(
                        <Checkbox
                            checked={saved}
                            onChange={(e) => setSaved(e.target.checked)}
                            inputProps={{ 'aria-label': t('account.totp.saved') }}
                        />
                    )}
                    label={t('account.totp.saved')}
                />
                <Button variant="contained" size="large" disabled={!saved} onClick={onDone} sx={{ py: 1.25 }}>
                    {t(doneLabelKey)}
                </Button>
            </Stack>
        );
    }

    const otpauthLink = isOtpauthUri(setup?.otpauthUri) ? setup.otpauthUri : null;

    return (
        <Stack spacing={2.5} component="form" onSubmit={submitCode}>
            {notice ? <Alert severity="warning">{notice}</Alert> : null}
            {alert}
            <Stack spacing={1.5}>
                <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                    {t('account.totp.step1')}
                </Typography>
                <TotpQrCode value={otpauthLink ?? setup?.otpauthUri} />
                {otpauthLink ? (
                    <Typography variant="body2" sx={{ textAlign: 'center', lineHeight: 1.6 }}>
                        <Link href={otpauthLink} underline="hover">
                            {t('account.totp.openInApp')}
                        </Link>
                    </Typography>
                ) : null}
                <Stack spacing={0.5}>
                    <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                            {t('account.totp.manualKey')}
                        </Typography>
                        <Button size="small" onClick={copySecret} sx={{ ml: 'auto' }}>
                            {t('account.totp.copy')}
                        </Button>
                    </Stack>
                    <Box
                        ref={secretRef}
                        component="div"
                        aria-label={t('account.totp.manualKey')}
                        sx={{ ...MONO, fontSize: '0.875rem', lineHeight: 1.8, wordBreak: 'break-all', userSelect: 'all' }}
                    >
                        {groupSecret(setup?.secret)}
                    </Box>
                </Stack>
            </Stack>
            <Stack spacing={1.5}>
                <Typography variant="body2" sx={{ lineHeight: 1.6 }}>
                    {t('account.totp.step2')}
                </Typography>
                <TextField
                    inputRef={codeInputRef}
                    fullWidth
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    label={t('auth.totp.codeLabel')}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputProps={{ maxLength: 6, pattern: '[0-9]*' }}
                />
            </Stack>
            <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={busy || locked || !isSixDigitCode(code)}
                sx={{ py: 1.25 }}
            >
                {t('account.totp.confirm')}
            </Button>
            {failure?.kind === 'tooMany' ? (
                // The lock-out lifts by itself; this only lets the form be
                // submitted again (the server still decides).
                <Button variant="text" onClick={() => setFailure(null)}>
                    {t('common.retry')}
                </Button>
            ) : null}
        </Stack>
    );
}
