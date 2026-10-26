import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Alert, AppBar, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress,
    Container, IconButton, Stack, Toolbar, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import WhatshotIcon from '@mui/icons-material/Whatshot';
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

// Same card surface as the gallery page (PageSpec S-04 v1.1 G1).
const recordCardSx = {
    borderRadius: '16px',
    transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
    '&:hover': {
        transform: 'translateY(-2px)',
        boxShadow: (theme) => theme.palette.mode === 'dark'
            ? '0 6px 18px rgba(0,0,0,0.45)'
            : '0 6px 18px rgba(15,23,42,0.12)',
        borderColor: 'primary.main',
    },
};

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
        <Box sx={{ minHeight: '100dvh' }}>
            <AppBar position="sticky" elevation={2}>
                <Toolbar sx={{ gap: 1 }}>
                    <IconButton
                        color="inherit"
                        onClick={() => navigate('/')}
                        title={t('settings.backToTimer')}
                    >
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mr: 'auto' }}>
                        📋 {t('records.title')}
                    </Typography>
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

            <Container maxWidth="md" sx={{ pb: 4, pt: 2.5 }}>
                {state === 'loading' ? (
                    <Stack sx={{ alignItems: 'center', py: 6 }}>
                        <CircularProgress />
                    </Stack>
                ) : state === 'error' ? (
                    <Stack spacing={2} sx={{ alignItems: 'center', py: 4 }}>
                        <Alert severity="error">{t('records.loadFailed')}</Alert>
                        <Button onClick={() => load()}>{t('records.retry')}</Button>
                    </Stack>
                ) : items.length === 0 ? (
                    <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
                        {t('records.empty')}
                    </Alert>
                ) : (
                    <Stack spacing={2}>
                        {items.map((record) => (
                            <Card key={record.id} variant="outlined" sx={recordCardSx}>
                                <CardActionArea
                                    onClick={() => navigate(`/records/${record.id}`)}
                                    sx={{ borderRadius: 'inherit' }}
                                >
                                    <CardContent>
                                        <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                                <Typography variant="h6" noWrap>
                                                    {record.configName} · {teams(record)}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                                    {formatDateTime(record.savedAt)}
                                                    {' · '}
                                                    {t('records.stageCount', { n: record.stageCount })}
                                                </Typography>
                                            </Box>
                                            {record.overrunCount > 0 ? (
                                                <Chip
                                                    size="small"
                                                    color="warning"
                                                    icon={<WhatshotIcon />}
                                                    label={t('records.overruns', { n: record.overrunCount })}
                                                />
                                            ) : (
                                                <Chip size="small" variant="outlined" label="✓" />
                                            )}
                                        </Stack>
                                    </CardContent>
                                </CardActionArea>
                            </Card>
                        ))}
                        {nextBefore ? (
                            <Button
                                variant="outlined"
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
            </Container>
        </Box>
    );
}
