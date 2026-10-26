import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Alert, AppBar, Box, Button, Card, CardContent, CardHeader, Chip, CircularProgress,
    Container, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow,
    Toolbar, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import MatchLogService from './services/MatchLogService';
import { downloadCsv } from './utils/matchRecordCsv';
import { useFeedback } from './context/FeedbackContext';
import { useColorMode } from './context/ColorModeContext';
import LanguageSwitcher from './components/LanguageSwitcher';

function mmss(total) {
    const seconds = Math.max(0, Number(total) || 0);
    const minutes = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return `${minutes}:${String(rem).padStart(2, '0')}`;
}

export default function RecordDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { notify, confirm } = useFeedback();
    const { darkMode, toggleDarkMode } = useColorMode();
    const [state, setState] = useState('loading');
    const [record, setRecord] = useState(null);

    useEffect(() => {
        let mounted = true;
        (async () => {
            const result = await MatchLogService.loadRecord(id);
            if (!mounted) return;
            if (result.success) {
                setRecord(result.data);
                setState('ok');
            } else if (result.notFound) {
                setState('missing');
            } else {
                setState('error');
            }
        })();
        return () => {
            mounted = false;
        };
    }, [id]);

    const handleDelete = useCallback(async () => {
        const accepted = await confirm({
            title: t('records.deleteConfirmTitle'),
            message: t('records.deleteConfirm'),
            confirmColor: 'error',
            confirmLabel: t('common.delete'),
        });
        if (!accepted) return;
        const result = await MatchLogService.deleteRecord(id);
        if (result.success) {
            navigate('/records', { replace: true });
        } else {
            notify(result.message, { severity: 'error' });
        }
    }, [confirm, id, navigate, notify, t]);

    const appBar = (title, actions = null) => (
        <AppBar position="sticky" elevation={2}>
            <Toolbar sx={{ gap: 1 }}>
                <IconButton
                    color="inherit"
                    onClick={() => navigate('/records')}
                    title={t('records.backToList')}
                >
                    <ArrowBackIcon />
                </IconButton>
                <Typography variant="h6" component="h1" noWrap sx={{ fontWeight: 700, mr: 'auto' }}>
                    📋 {title}
                </Typography>
                {actions}
                <LanguageSwitcher variant="mui" size="small" />
                <IconButton
                    color="inherit"
                    onClick={toggleDarkMode}
                    title={darkMode ? t('timer.darkLight') : t('timer.darkDark')}
                >
                    {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
                </IconButton>
            </Toolbar>
        </AppBar>
    );

    if (state === 'loading') {
        return (
            <Box sx={{ minHeight: '100dvh' }}>
                {appBar(t('records.title'))}
                <Container maxWidth="md">
                    <Stack sx={{ alignItems: 'center', py: 6 }}>
                        <CircularProgress />
                    </Stack>
                </Container>
            </Box>
        );
    }
    if (state !== 'ok' || !record) {
        return (
            <Box sx={{ minHeight: '100dvh' }}>
                {appBar(t('records.title'))}
                <Container maxWidth="md" sx={{ py: 4 }}>
                    <Alert severity={state === 'missing' ? 'warning' : 'error'}>
                        {state === 'missing' ? t('records.notFound') : t('records.loadFailed')}
                    </Alert>
                    <Button sx={{ mt: 2 }} startIcon={<ArrowBackIcon />} onClick={() => navigate('/records')}>
                        {t('records.backToList')}
                    </Button>
                </Container>
            </Box>
        );
    }

    const aff = record.teamNames?.aff || t('timer.affirmative');
    const neg = record.teamNames?.neg || t('timer.negative');
    const actions = (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mr: 1 }}>
            <Button
                size="small"
                color="inherit"
                startIcon={<FileDownloadIcon />}
                onClick={() => downloadCsv(record)}
            >
                CSV
            </Button>
            <Button
                size="small"
                color="inherit"
                startIcon={<FileDownloadIcon />}
                onClick={() => MatchLogService.downloadJsonExport(record.id)}
            >
                JSON
            </Button>
            <Button
                size="small"
                color="inherit"
                sx={{ color: (theme) => theme.palette.error.light }}
                startIcon={<DeleteOutlinedIcon />}
                onClick={handleDelete}
            >
                {t('common.delete')}
            </Button>
        </Stack>
    );

    return (
        <Box sx={{ minHeight: '100dvh' }}>
            {appBar(`${record.configName} · ${aff} vs ${neg}`, actions)}
            <Container maxWidth="md" sx={{ pb: 4, pt: 2.5 }}>
                <Card variant="outlined" sx={{ borderRadius: '16px' }}>
                    <CardHeader
                        title={t('records.subtitle')}
                        subheader={`${new Date(record.startedAt).toLocaleString()} → ${new Date(record.endedAt).toLocaleString()}`}
                    />
                    <CardContent>
                        <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
                            <Chip variant="outlined" label={`${t('records.plannedTotal')} ${mmss(record.summary.totalPlannedSeconds)}`} />
                            <Chip variant="outlined" label={`${t('records.actualTotal')} ${mmss(record.summary.totalActualSeconds)}`} />
                            <Chip
                                color={record.summary.overrunCount > 0 ? 'warning' : 'default'}
                                label={`${t('records.overruns', { n: record.summary.overrunCount })}`}
                            />
                            {record.truncated ? (
                                <Chip color="default" label={t('records.truncated')} />
                            ) : null}
                        </Stack>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>#</TableCell>
                                    <TableCell>{t('records.stage')}</TableCell>
                                    <TableCell>{t('records.mode')}</TableCell>
                                    <TableCell align="right">{t('records.planned')}</TableCell>
                                    <TableCell align="right">{t('records.actualAff', { team: aff })}</TableCell>
                                    <TableCell align="right">{t('records.actualNeg', { team: neg })}</TableCell>
                                    <TableCell align="center">{t('records.overrun')}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {record.stages.map((stage, index) => (
                                    <TableRow key={`${stage.stageId}-${index}`}>
                                        <TableCell>{index + 1}</TableCell>
                                        <TableCell>{stage.label}</TableCell>
                                        <TableCell>{t(`settings.${stage.mode === 'free' ? 'freeTimer' : stage.mode === 'double' ? 'doubleTimer' : 'singleTimer'}`)}</TableCell>
                                        <TableCell align="right">{mmss(stage.plannedSeconds)}</TableCell>
                                        <TableCell align="right">{mmss(stage.actualAffSeconds)}</TableCell>
                                        <TableCell align="right">
                                            {stage.mode === 'single' ? '—' : mmss(stage.actualNegSeconds)}
                                        </TableCell>
                                        <TableCell align="center">
                                            {stage.overrunAff > 0 ? <Chip size="small" color="error" label={`${aff} ×${stage.overrunAff}`} sx={{ mr: 0.5 }} /> : null}
                                            {stage.overrunNeg > 0 ? <Chip size="small" color="error" label={`${neg} ×${stage.overrunNeg}`} /> : null}
                                            {stage.overrunAff === 0 && stage.overrunNeg === 0 ? '—' : null}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </Container>
        </Box>
    );
}
