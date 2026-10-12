import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Alert, Box, Button, Card, CardContent, CardHeader, Chip,
    CircularProgress, Container, Stack, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HistoryIcon from '@mui/icons-material/History';
import MatchLogService from './services/MatchLogService';
import { useAuth } from './context/AuthContext';
import { useColorMode } from './context/ColorModeContext';
import LanguageSwitcher from './components/LanguageSwitcher';

function formatDateTime(value) {
    if (!value) {
        return '—';
    }
    return new Date(value).toLocaleString();
}

export default function RecordsPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { t } = useTranslation();
    const { user } = useAuth();
    const { darkMode, toggleDarkMode } = useColorMode();
    const ownerId = user?.role === 'admin' ? (searchParams.get('ownerId') || undefined) : undefined;

    const [state, setState] = useState('loading'); // loading | ok | error
    const [items, setItems] = useState([]);
    const [nextBefore, setNextBefore] = useState(null);
    const [loadingMore, setLoadingMore] = useState(false);

    const load = useCallback(async ({ before } = {}) => {
        const result = await MatchLogService.listRecords({ before }, ownerId);
        if (!result.success) {
            setState('error');
            return;
        }
        setItems((prev) => (before ? [...prev, ...result.data.items] : result.data.items));
        setNextBefore(result.data.nextBefore);
        setState('ok');
    }, [ownerId]);

    useEffect(() => {
        load();
    }, [load]);

    const teams = (record) => {
        const aff = record.teamNames?.aff || t('timer.affirmative');
        const neg = record.teamNames?.neg || t('timer.negative');
        return `${aff} vs ${neg}`;
    };

    return (
        <div className={darkMode ? 'records-page dark-mode' : 'records-page'}>
            <div className="settings-header">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Button startIcon={<ArrowBackIcon />} onClick={() => navigate('/')}>
                        {t('timer.title')}
                    </Button>
                    <LanguageSwitcher variant="mui" size="small" />
                    <Button
                        onClick={toggleDarkMode}
                        title={darkMode ? t('timer.darkLight') : t('timer.darkDark')}
                    >
                        {darkMode ? '☀️' : '🌙'}
                    </Button>
                </Box>
                <Typography variant="h5">{t('records.title')}</Typography>
                <Box sx={{ width: 120 }} />
            </div>

            <Container maxWidth="md" sx={{ pb: 4 }}>
                <Card>
                    <CardHeader
                        avatar={<HistoryIcon color="primary" />}
                        title={t('records.title')}
                        subheader={t('records.subtitle')}
                    />
                    <CardContent>
                        {state === 'loading' ? (
                            <Stack sx={{ alignItems: 'center', py: 4 }}>
                                <CircularProgress size={28} />
                            </Stack>
                        ) : state === 'error' ? (
                            <Stack spacing={2}>
                                <Alert severity="error">{t('records.loadFailed')}</Alert>
                                <Button onClick={() => load()}>{t('records.retry')}</Button>
                            </Stack>
                        ) : items.length === 0 ? (
                            <Alert severity="info" variant="outlined">{t('records.empty')}</Alert>
                        ) : (
                            <Stack spacing={1}>
                                {items.map((record) => (
                                    <Stack
                                        key={record.id}
                                        direction="row"
                                        spacing={2}
                                        sx={{
                                            alignItems: 'center',
                                            cursor: 'pointer',
                                            p: 1,
                                            borderRadius: 1,
                                            '&:hover': { bgcolor: 'action.hover' },
                                        }}
                                        onClick={() => navigate(`/records/${record.id}`)}
                                    >
                                        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                            <Typography variant="body1" noWrap>
                                                {record.configName} · {teams(record)}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {formatDateTime(record.savedAt)}
                                                {' · '}
                                                {t('records.stageCount', { n: record.stageCount })}
                                            </Typography>
                                        </Box>
                                        {record.overrunCount > 0 ? (
                                            <Chip
                                                size="small"
                                                color="warning"
                                                label={t('records.overruns', { n: record.overrunCount })}
                                            />
                                        ) : (
                                            <Chip size="small" variant="outlined" label="✓" />
                                        )}
                                    </Stack>
                                ))}
                                {nextBefore ? (
                                    <Button
                                        disabled={loadingMore}
                                        onClick={async () => {
                                            setLoadingMore(true);
                                            await load({ before: nextBefore });
                                            setLoadingMore(false);
                                        }}
                                    >
                                        {loadingMore ? '…' : t('records.loadMore')}
                                    </Button>
                                ) : null}
                            </Stack>
                        )}
                    </CardContent>
                </Card>
            </Container>
        </div>
    );
}
