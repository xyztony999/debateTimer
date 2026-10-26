import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Alert, AppBar, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress,
    Container, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton,
    InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup, Toolbar, Typography,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LightModeIcon from '@mui/icons-material/LightMode';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import SearchIcon from '@mui/icons-material/Search';
import WhatshotIcon from '@mui/icons-material/Whatshot';
import ScheduleIcon from '@mui/icons-material/Schedule';
import GalleryService from './services/GalleryService';
import { useAuth } from './context/AuthContext';
import { useColorMode } from './context/ColorModeContext';
import LanguageSwitcher from './components/LanguageSwitcher';
import BrandMark from './components/BrandMark';
import StatusPage from './components/StatusPage';

function formatDuration(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const rem = totalSeconds % 60;
    return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
}

function stageLabel(stage, labels, language) {
    const localized = labels?.[stage]?.[language]
        || labels?.[stage]?.['zh-Hans']
        || labels?.[stage]?.en;
    return localized || stage;
}

export default function GalleryPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const { darkMode, toggleDarkMode } = useColorMode();

    const [state, setState] = useState('loading');
    const [items, setItems] = useState([]);
    const [nextBefore, setNextBefore] = useState(null);
    const [detail, setDetail] = useState(null);   // open dialog source
    const [detailState, setDetailState] = useState('loading');
    const [copyName, setCopyName] = useState('');
    const [copyBusy, setCopyBusy] = useState(false);
    const [copyError, setCopyError] = useState(null);
    const [searchInput, setSearchInput] = useState('');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('updated');

    const load = useCallback(async ({ before, q, sort: sortKey } = {}) => {
        const result = await GalleryService.listTemplates({ before, q, sort: sortKey });
        if (!result.success) {
            setState('error');
            return;
        }
        setItems((prev) => (before ? [...prev, ...result.data.items] : result.data.items));
        setNextBefore(result.data.nextBefore);
        setState('ok');
    }, []);

    useEffect(() => {
        load({ q: query, sort });
    }, [load, query, sort]);

    // Debounce the search box; only committed text hits the API.
    useEffect(() => {
        const timer = window.setTimeout(() => setQuery(searchInput.trim()), 300);
        return () => window.clearTimeout(timer);
    }, [searchInput]);

    // Deep link /gallery/:id opens the detail dialog directly (login next flow).
    useEffect(() => {
        if (!id) {
            setDetail(null);
            return;
        }
        let mounted = true;
        setDetailState('loading');
        (async () => {
            const result = await GalleryService.loadTemplate(id);
            if (!mounted) return;
            if (result.success) {
                setDetail(result.data);
                setCopyName(`${result.data.name} ${t('gallery.copySuffix')}`.trim());
                setDetailState('ok');
            } else {
                setDetailState('missing');
            }
        })();
        return () => {
            mounted = false;
        };
    }, [id, t]);

    const openDetail = async (item) => {
        navigate(`/gallery/${item.id}`);
    };

    const closeDetail = () => {
        setDetail(null);
        setCopyError(null);
        navigate('/gallery');
    };

    const handleCopy = async () => {
        if (!detail) {
            return;
        }
        const name = copyName.trim();
        if (!name) {
            setCopyError(t('settings.templateNameRequired'));
            return;
        }
        setCopyBusy(true);
        const result = await GalleryService.copyTemplate(detail.id, name);
        setCopyBusy(false);
        if (result.success) {
            navigate('/settings');
            return;
        }
        setCopyError(result.message || t('gallery.copyFailed'));
    };

    if (state === 'loading') {
        return (
            <Container maxWidth="md" sx={{ py: 8, textAlign: 'center' }}>
                <CircularProgress />
            </Container>
        );
    }

    return (
        <Box sx={{ minHeight: '100dvh' }}>
            {/* 顶部与计时器控制台同款 AppBar（PageSpec S-04 v1.1 G1） */}
            <AppBar position="sticky" elevation={2}>
                <Toolbar sx={{ gap: 1 }}>
                    <IconButton
                        color="inherit"
                        onClick={() => navigate(user ? '/' : '/login')}
                        title={user ? t('settings.backToTimer') : t('auth.login')}
                    >
                        <ArrowBackIcon />
                    </IconButton>
                    <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mr: 'auto' }}>
                        <BrandMark size={22} style={{ marginRight: 6 }} /> {t('gallery.title')}
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
                <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1.5}
                    sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', mb: 2 }}
                >
                    <TextField
                        size="small"
                        placeholder={t('gallery.search')}
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            },
                        }}
                        sx={{ maxWidth: { sm: 320 } }}
                    />
                    <ToggleButtonGroup
                        size="small"
                        exclusive
                        value={sort}
                        onChange={(_event, value) => value && setSort(value)}
                    >
                        <ToggleButton value="updated">
                            <ScheduleIcon sx={{ fontSize: 16, mr: 0.5 }} />{t('gallery.sortUpdated')}
                        </ToggleButton>
                        <ToggleButton value="copies">
                            <WhatshotIcon sx={{ fontSize: 16, mr: 0.5 }} />{t('gallery.sortCopies')}
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Stack>
                {state === 'error' ? (
                    <Stack spacing={2} sx={{ alignItems: 'center', py: 4 }}>
                        <Alert severity="error">{t('gallery.loadFailed')}</Alert>
                        <Button onClick={() => load({ q: query, sort })}>{t('records.retry')}</Button>
                    </Stack>
                ) : items.length === 0 && !id ? (
                    <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
                        {query ? t('gallery.noMatch') : t('gallery.empty')}
                    </Alert>
                ) : (
                    <Grid container spacing={2}>
                        {items.map((item) => (
                            <Grid key={item.id} size={{ xs: 12, sm: 6 }}>
                                <Card
                                    variant="outlined"
                                    sx={{
                                        borderRadius: '16px',
                                        transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease',
                                        '&:hover': {
                                            transform: 'translateY(-2px)',
                                            boxShadow: (theme) => theme.palette.mode === 'dark'
                                                ? '0 6px 18px rgba(0,0,0,0.45)'
                                                : '0 6px 18px rgba(15,23,42,0.12)',
                                            borderColor: 'primary.main',
                                        },
                                    }}
                                >
                                    <CardActionArea onClick={() => openDetail(item)} sx={{ borderRadius: 'inherit' }}>
                                        <CardContent>
                                            <Typography variant="h6" noWrap>{item.name}</Typography>
                                            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                                                <Chip size="small" label={t('gallery.stageCount', { n: item.stageCount })} />
                                                <Chip size="small" variant="outlined" label={formatDuration(item.totalSeconds)} />
                                                <Chip
                                                    size="small"
                                                    variant="outlined"
                                                    icon={<WhatshotIcon />}
                                                    label={item.copies || 0}
                                                />
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                                {item.modeSummary} · {new Date(item.updatedAt).toLocaleDateString()}
                                                {item.creditName ? ` · ${t('gallery.credit', { name: item.creditName })}` : ''}
                                            </Typography>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        ))}
                        {nextBefore ? (
                            <Grid size={{ xs: 12 }} sx={{ textAlign: 'center' }}>
                                <Button
                                    variant="outlined"
                                    onClick={() => load({ before: nextBefore, q: query, sort })}
                                >
                                    {t('records.loadMore')}
                                </Button>
                            </Grid>
                        ) : null}
                    </Grid>
                )}
            </Container>

            <Dialog open={Boolean(id)} onClose={closeDetail} maxWidth="sm" fullWidth>
                {detailState === 'loading' ? (
                    <DialogContent sx={{ textAlign: 'center', py: 4 }}><CircularProgress size={28} /></DialogContent>
                ) : detailState === 'missing' ? (
                    <DialogContent>
                        <StatusPage variant="notFound" />
                    </DialogContent>
                ) : detail ? (
                    <>
                        <DialogTitle>{detail.name}</DialogTitle>
                        <DialogContent>
                            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: 'wrap' }}>
                                <Chip size="small" label={t('gallery.stageCount', { n: detail.stageCount })} />
                                <Chip size="small" variant="outlined" label={formatDuration(detail.totalSeconds)} />
                                <Chip size="small" variant="outlined" icon={<WhatshotIcon />} label={detail.copies || 0} />
                            </Stack>
                            {detail.creditName ? (
                                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                    {t('gallery.credit', { name: detail.creditName })}
                                </Typography>
                            ) : null}
                            <Stack spacing={0.5}>
                                {(detail.stageOrder || Object.keys(detail.debateStages || {})).map((stage) => (
                                    <Stack key={stage} direction="row" sx={{ justifyContent: 'space-between' }}>
                                        <Typography variant="body2">
                                            {stageLabel(stage, detail.stageLabels, i18n.language)}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {formatDuration(detail.debateStages[stage] || 0)}
                                        </Typography>
                                    </Stack>
                                ))}
                            </Stack>
                            {user ? (
                                <TextField
                                    fullWidth
                                    size="small"
                                    label={t('gallery.copyName')}
                                    value={copyName}
                                    onChange={(event) => setCopyName(event.target.value)}
                                    sx={{ mt: 2 }}
                                />
                            ) : null}
                            {copyError ? (
                                <Alert severity="error" sx={{ mt: 1 }}>{copyError}</Alert>
                            ) : null}
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={closeDetail}>{t('common.cancel')}</Button>
                            {user ? (
                                <Button
                                    variant="contained"
                                    startIcon={<ContentCopyIcon />}
                                    disabled={copyBusy}
                                    onClick={handleCopy}
                                >
                                    {copyBusy ? '…' : t('gallery.copy')}
                                </Button>
                            ) : (
                                <Button
                                    variant="contained"
                                    onClick={() => navigate(`/login?next=${encodeURIComponent(`/gallery/${id}`)}`)}
                                >
                                    {t('gallery.loginToCopy')}
                                </Button>
                            )}
                        </DialogActions>
                    </>
                ) : null}
            </Dialog>
        </Box>
    );
}
