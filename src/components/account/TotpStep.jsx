import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { authService } from '../../services/authService';
import { useAuth } from '../../context/AuthContext';
import {
    classifySecondFactorFailure,
    isRecoveryCode,
    isSixDigitCode,
} from '../../utils/authFlow';

const METHOD = Object.freeze({ CODE: 'code', RECOVERY: 'recovery' });

/**
 * Second-factor step of the sign-in page (S-01 PageSpec §5.6).
 *
 * Shown after the password was accepted for an account that has two-step
 * verification on. No session exists yet: `ticket` only proves the password
 * step. It is kept in this component's state and sent with every attempt —
 * never stored, never put in the URL, never logged.
 *
 * On success the response is a session user, handed to AuthContext; the sign-in
 * page then redirects exactly as it does after a password-only sign-in.
 * Loaded on demand by LoginPage, so it is not in the page's first chunk.
 */
export default function TotpStep({ ticket, onBack, onExpired }) {
    const { t } = useTranslation();
    const { adoptSession } = useAuth();
    const [method, setMethod] = useState(METHOD.CODE);
    const [code, setCode] = useState('');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState(null);
    const codeInputRef = useRef(null);

    // Locked out, or the server cannot verify: nothing to submit until the
    // visitor comes back from the password step.
    const locked = failure?.kind === 'tooMany' || failure?.kind === 'unavailable';
    const canSubmit = !busy
        && !locked
        && (method === METHOD.CODE ? isSixDigitCode(code) : isRecoveryCode(recoveryCode));

    const switchMethod = () => {
        setMethod((prev) => (prev === METHOD.CODE ? METHOD.RECOVERY : METHOD.CODE));
        setCode('');
        setRecoveryCode('');
        setFailure(null);
    };

    const submit = async (event) => {
        event.preventDefault();
        if (!canSubmit) {
            return;
        }
        setBusy(true);
        const result = method === METHOD.CODE
            ? await authService.verifyTotp(ticket, code)
            : await authService.recoverWithCode(ticket, recoveryCode);
        setBusy(false);

        if (result.success) {
            await adoptSession(result.data);
            return;
        }

        const next = classifySecondFactorFailure(result);
        if (next.kind === 'expired') {
            onExpired();
            return;
        }
        if (next.kind === 'invalid' && method === METHOD.CODE) {
            // A rejected one-time code is spent: start the field over.
            setCode('');
            codeInputRef.current?.focus();
        }
        setFailure(next);
    };

    const alert = (() => {
        if (!failure) {
            return null;
        }
        if (failure.kind === 'invalid' && failure.count !== null) {
            return (
                <Alert severity="error">
                    {t(method === METHOD.CODE ? 'auth.totp.invalid' : 'auth.totp.invalidRecovery', {
                        count: failure.count,
                    })}
                </Alert>
            );
        }
        if (failure.kind === 'tooMany') {
            // `count` lets i18next pick the singular form for "1 minute".
            return (
                <Alert severity="error">
                    {t('auth.totp.tooMany', { minutes: failure.minutes, count: failure.minutes })}
                </Alert>
            );
        }
        return <Alert severity="error">{failure.message || t('auth.failed')}</Alert>;
    })();

    return (
        <Stack spacing={2.5} component="form" onSubmit={submit}>
            <Stack spacing={0.75}>
                <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
                    {t('auth.totp.title')}
                </Typography>
                {method === METHOD.CODE ? (
                    <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                        {t('auth.totp.subtitle')}
                    </Typography>
                ) : null}
            </Stack>
            {alert}
            {method === METHOD.CODE ? (
                <TextField
                    inputRef={codeInputRef}
                    autoFocus
                    fullWidth
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    label={t('auth.totp.codeLabel')}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    inputProps={{ maxLength: 6, pattern: '[0-9]*' }}
                />
            ) : (
                <TextField
                    autoFocus
                    fullWidth
                    autoComplete="off"
                    spellCheck={false}
                    label={t('auth.totp.recoveryLabel')}
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value)}
                />
            )}
            <Button
                type="submit"
                variant="contained"
                size="large"
                disabled={!canSubmit}
                sx={{ py: 1.25 }}
            >
                {t('auth.totp.submit')}
            </Button>
            {!locked ? (
                <Button type="button" variant="text" onClick={switchMethod}>
                    {method === METHOD.CODE ? t('auth.totp.useRecovery') : t('auth.totp.useCode')}
                </Button>
            ) : null}
            <Button type="button" variant="text" onClick={onBack}>
                {t('auth.totp.back')}
            </Button>
        </Stack>
    );
}
