import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { useFeedback } from '../../context/FeedbackContext';
import { accountService } from '../../services/accountService';
import { auditService } from '../../services/auditService';
import { pageCount } from '../../utils/auditView';
import { classifyPasswordProofFailure } from '../../utils/authFlow';
import { formatDateTime } from '../../utils/dateTime';
import TotpEnrollPanel from './TotpEnrollPanel';

const MONO = { fontFamily: 'Monaco, Consolas, "Courier New", monospace' };
const DASH = '—';

/** True while a dialog's own request is on its way; never closed then. */
function keepOpenWhileBusy(busy, close) {
    return (_event, _reason) => {
        if (!busy) {
            close();
        }
    };
}

/**
 * Two-step verification on the signed-in account (S-01 PageSpec §5.1).
 * Voluntary for standard accounts, mandatory for administrators (who then
 * have no way to turn it off here). The binding itself runs in a dialog and
 * is the same TotpEnrollPanel the gate page uses.
 */
function TotpCard() {
    const { t } = useTranslation();
    const { notify, confirm } = useFeedback();
    const [status, setStatus] = useState(null);
    const [state, setState] = useState('loading'); // loading | ready | error
    const requestSeqRef = useRef(0);

    const load = useCallback(async () => {
        const seq = ++requestSeqRef.current;
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

    // 0 = closed; any other value identifies one opening, so every opening
    // starts a fresh panel and nothing of an earlier attempt is carried over.
    const [enrolling, setEnrolling] = useState(0);
    const [panelBusy, setPanelBusy] = useState(false);
    const closeEnroll = useCallback(() => {
        if (!panelBusy) {
            setEnrolling(0);
        }
    }, [panelBusy]);
    const doneEnroll = useCallback(() => {
        setEnrolling(0);
        notify(t('account.totp.bindDone'), { severity: 'success' });
        load();
    }, [load, notify, t]);

    const [turningOff, setTurningOff] = useState(false);
    const [offPassword, setOffPassword] = useState('');
    const [offBusy, setOffBusy] = useState(false);
    const [offFailure, setOffFailure] = useState(null);
    const closeTurnOff = useCallback(() => {
        if (!offBusy) {
            setTurningOff(false);
        }
    }, [offBusy]);

    // Turning the second factor off is the downgrade an intruder wants, so it
    // takes a confirmation and then the password, however young the session.
    const askTurnOff = async () => {
        const accepted = await confirm({
            title: t('settings.confirmTitle'),
            message: t('account.totp.turnOffConfirm'),
        });
        if (accepted) {
            setOffPassword('');
            setOffFailure(null);
            setTurningOff(true);
        }
    };

    const submitTurnOff = async (event) => {
        event.preventDefault();
        if (offBusy || !offPassword) {
            return;
        }
        setOffBusy(true);
        const result = await accountService.disableTotp(offPassword);
        setOffBusy(false);
        if (result.success) {
            setTurningOff(false);
            notify(t('account.totp.turnedOff'));
            load();
            return;
        }
        setOffFailure(classifyPasswordProofFailure(result));
    };

    let body;
    if (state === 'loading') {
        body = <LinearProgress aria-label={t('account.totp.cardTitle')} />;
    } else if (state === 'error') {
        body = (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <Alert severity="error">{t('common.loadFailed')}</Alert>
                <Button variant="outlined" size="small" onClick={load}>{t('common.retry')}</Button>
            </Stack>
        );
    } else if (status?.available !== true) {
        // Not configured on this server: said plainly, and no button at all.
        body = (
            <Stack spacing={1.5}>
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {t('account.totp.cardDesc')}
                </Typography>
                <Alert severity="info">{t('account.totp.unavailable')}</Alert>
            </Stack>
        );
    } else {
        const enabled = status.enabled === true;
        const left = enabled ? status.recoveryCodesRemaining : null;
        const offFailureAlert = offFailure
            ? (
                <Alert severity="error">
                    {offFailure.kind === 'wrongPassword' && t('account.totp.wrongPassword')}
                    {offFailure.kind === 'unavailable' && t('account.totp.unavailable')}
                    {offFailure.kind === 'other' && (offFailure.message || t('common.actionFailed'))}
                </Alert>
            )
            : null;

        body = (
            <React.Fragment>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                    <Chip
                        size="small"
                        color={enabled ? 'success' : 'default'}
                        label={enabled ? t('account.totp.statusOn') : t('account.totp.statusOff')}
                    />
                    {enabled && Number.isInteger(left)
                        ? <Typography variant="body2">{t('account.totp.recoveryLeft', { count: left })}</Typography>
                        : null}
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                    {t('account.totp.cardDesc')}
                </Typography>
                {enabled && left === 0
                    ? <Alert severity="warning" sx={{ mb: 2 }}>{t('account.totp.recoveryEmpty')}</Alert>
                    : null}
                {enabled && status.enforced === true
                    ? (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                            {t('account.totp.adminNoOff')}
                        </Typography>
                    )
                    : null}
                {/* `gap`, so that a wrapped button row does not start indented. */}
                <Stack direction="row" useFlexGap spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                    <Button variant="contained" onClick={() => setEnrolling((opening) => opening + 1)}>
                        {enabled ? t('account.totp.rebind') : t('account.totp.turnOn')}
                    </Button>
                    {enabled && status.enforced !== true
                        ? <Button color="error" onClick={askTurnOff}>{t('account.totp.turnOff')}</Button>
                        : null}
                </Stack>

                <Dialog
                    open={turningOff}
                    onClose={keepOpenWhileBusy(offBusy, closeTurnOff)}
                    disableEscapeKeyDown={offBusy}
                    fullWidth
                    maxWidth="xs"
                    aria-labelledby="totp-off-title"
                >
                    <DialogTitle id="totp-off-title">{t('account.totp.turnOff')}</DialogTitle>
                    <DialogContent>
                        <Stack spacing={2.5} component="form" onSubmit={submitTurnOff}>
                            {offFailureAlert}
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
                                value={offPassword}
                                onChange={(e) => setOffPassword(e.target.value)}
                                error={offFailure?.kind === 'wrongPassword'}
                            />
                            <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
                                <Button color="inherit" disabled={offBusy} onClick={closeTurnOff}>
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    type="submit"
                                    variant="contained"
                                    color="error"
                                    disabled={offBusy || !offPassword}
                                >
                                    {t('account.totp.turnOff')}
                                </Button>
                            </Stack>
                        </Stack>
                    </DialogContent>
                </Dialog>
            </React.Fragment>
        );
    }

    return (
        <React.Fragment>
            <Card>
                <CardHeader title={t('account.totp.cardTitle')} />
                <CardContent>{body}</CardContent>
            </Card>

            <Dialog
                open={enrolling > 0}
                onClose={keepOpenWhileBusy(panelBusy, closeEnroll)}
                disableEscapeKeyDown={panelBusy}
                fullWidth
                maxWidth="sm"
                aria-labelledby="totp-enroll-title"
            >
                <DialogTitle
                    id="totp-enroll-title"
                    sx={{ pr: 7 }}
                >
                    {t('account.totp.enrollTitle')}
                    {!panelBusy
                        ? (
                            <IconButton
                                aria-label={t('common.cancel')}
                                onClick={closeEnroll}
                                sx={{ position: 'absolute', right: 8, top: 8 }}
                            >
                                <CloseIcon />
                            </IconButton>
                        )
                        : null}
                </DialogTitle>
                <DialogContent dividers>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2, lineHeight: 1.6 }}>
                        {status?.enabled === true ? t('account.totp.rebindHint') : t('account.totp.cardDesc')}
                    </Typography>
                    {enrolling > 0
                        ? (
                            <TotpEnrollPanel
                                key={enrolling}
                                status={status}
                                onDone={doneEnroll}
                                doneLabelKey="account.totp.savedClose"
                                onBusyChange={setPanelBusy}
                            />
                        )
                        : null}
                </DialogContent>
            </Dialog>
        </React.Fragment>
    );
}

/**
 * The account's own sign-in history (S-01 PageSpec §5.3). Read-only: no
 * export, no filter, no delete. The server already hides the end of the IP
 * on failed attempts; what it sends is shown as it is.
 */
function MyLoginsCard() {
    const { t, i18n } = useTranslation();
    const [page, setPage] = useState(1);
    const [data, setData] = useState(null); // { items, total }
    const [state, setState] = useState('loading'); // loading | ready | error
    const [busy, setBusy] = useState(false);
    const requestSeqRef = useRef(0);
    const requestedPageRef = useRef(1);

    const load = useCallback(async (target) => {
        const seq = ++requestSeqRef.current;
        requestedPageRef.current = target;
        setBusy(true);
        const result = await auditService.listMyLogins(target);
        if (seq !== requestSeqRef.current) {
            return;
        }
        setBusy(false);
        if (result.success) {
            setData(result.data);
            setPage(target);
            setState('ready');
        } else {
            setState('error');
        }
    }, []);

    useEffect(() => {
        load(1);
    }, [load]);

    const items = Array.isArray(data?.items) ? data.items : [];
    const total = Number.isInteger(data?.total) ? data.total : 0;
    const pages = pageCount(total);

    const table = state === 'loading'
        ? <LinearProgress aria-label={t('account.logins.cardTitle')} />
        : state === 'error'
            ? (
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Alert severity="error">{t('common.loadFailed')}</Alert>
                    <Button
                        variant="outlined"
                        size="small"
                        onClick={() => load(requestedPageRef.current)}
                    >
                        {t('common.retry')}
                    </Button>
                </Stack>
            )
            : (
                <Box sx={{ overflowX: 'auto', opacity: busy ? 0.5 : 1 }}>
                    <Table size="small" sx={{ whiteSpace: 'nowrap' }}>
                        <TableHead>
                            <TableRow>
                                <TableCell>{t('account.logins.time')}</TableCell>
                                <TableCell>{t('account.logins.event')}</TableCell>
                                <TableCell>{t('account.logins.result')}</TableCell>
                                <TableCell>{t('account.logins.ip')}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.length === 0
                                ? (
                                    <TableRow>
                                        <TableCell colSpan={4}>{t('account.logins.empty')}</TableCell>
                                    </TableRow>
                                )
                                : items.map((item) => {
                                    const full = formatDateTime(item.at, i18n.language, 'full');
                                    const reason = item.result === 'failure' && typeof item.detail?.reason === 'string'
                                        ? item.detail.reason
                                        : null;
                                    return (
                                        <TableRow key={item.id}>
                                            <TableCell title={full ?? undefined}>
                                                {formatDateTime(item.at, i18n.language) ?? DASH}
                                            </TableCell>
                                            <TableCell>
                                                {t(`audit.login.${item.type}`, { defaultValue: String(item.type ?? '') })}
                                                {reason
                                                    ? (
                                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                                            {t(`audit.loginReason.${reason}`, { defaultValue: reason })}
                                                        </Typography>
                                                    )
                                                    : null}
                                            </TableCell>
                                            <TableCell>
                                                {t(`audit.result.${item.result}`, { defaultValue: String(item.result ?? '') })}
                                            </TableCell>
                                            <TableCell>
                                                {item.ip
                                                    ? <Box component="span" sx={MONO}>{item.ip}</Box>
                                                    : t('account.logins.noIp')}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                        </TableBody>
                    </Table>
                </Box>
            );

    return (
        <Card>
            <CardHeader title={t('account.logins.cardTitle')} subheader={t('account.logins.cardDesc')} />
            <CardContent>
                {table}
                {state === 'ready'
                    ? (
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end', mt: 1.5 }}>
                            <Typography variant="caption" color="text.secondary">
                                {t('account.logins.pageInfo', { page, pages, total })}
                            </Typography>
                            <Button size="small" disabled={busy || page <= 1} onClick={() => load(page - 1)}>
                                {t('account.logins.prev')}
                            </Button>
                            <Button size="small" disabled={busy || page >= pages} onClick={() => load(page + 1)}>
                                {t('account.logins.next')}
                            </Button>
                        </Stack>
                    )
                    : null}
            </CardContent>
        </Card>
    );
}

/**
 * "Account and security" — the block at the foot of the settings page: the
 * account's two-step verification and its own sign-in history. Loaded on
 * demand, so none of this is in the first screen of the timer or sign-in page
 * (S-01 PageSpec §1 FX-005, §5).
 */
export default function AccountSecuritySection() {
    const { t } = useTranslation();
    return (
        <Box sx={{ mt: 4 }}>
            <Typography variant="h6" component="h2" sx={{ mb: 2, fontWeight: 600 }}>
                {t('account.sectionTitle')}
            </Typography>
            <Stack spacing={3}>
                <TotpCard />
                <MyLoginsCard />
            </Stack>
        </Box>
    );
}
