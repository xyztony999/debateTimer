import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Alert, Box, Button, Card, CardActionArea, CardContent, Chip, CircularProgress,
    Container, Dialog, DialogActions, DialogContent, DialogTitle, Grid,
    Stack, TextField, Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import GalleryService from './services/GalleryService';
import { useAuth } from './context/AuthContext';
import { useColorMode } from './context/ColorModeContext';
import LanguageSwitcher from './components/LanguageSwitcher';
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

    const load = useCallback(async ({ before } = {}) => {
        const result = await GalleryService.listTemplates({ before });
        if (!result.success) {
            setState('error');
            return;
        }
        setItems((prev) => (before ? [...prev, ...result.data.items] : result.data.items));
        setNextBefore(result.data.nextBefore);
        setState('ok');
    }, []);

    useEffect(() => {
        load();
    }, [load]);

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
        <div className={darkMode ? 'gallery-page dark-mode' : 'gallery-page'}>
            <div className="settings-header">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {user ? (
                        <Button onClick={() => navigate('/')}>{t('timer.title')}</Button>
                    ) : (
                        <Button onClick={() => navigate('/login')}>{t('auth.login')}</Button>
                    )}
                    <LanguageSwitcher variant="mui" size="small" />
                    <Button onClick={toggleDarkMode} title={darkMode ? t('timer.darkLight') : t('timer.darkDark')}>
                        {darkMode ? '☀️' : '🌙'}
                    </Button>
                </Box>
                <Typography variant="h5">{t('gallery.title')}</Typography>
                <Box sx={{ width: 120 }} />
            </div>

            <Container maxWidth="md" sx={{ pb: 4 }}>
                {state === 'error' ? (
                    <Stack spacing={2} sx={{ alignItems: 'center', py: 4 }}>
                        <Alert severity="error">{t('gallery.loadFailed')}</Alert>
                        <Button onClick={() => load()}>{t('records.retry')}</Button>
                    </Stack>
                ) : items.length === 0 && !id ? (
                    <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
                        {t('gallery.empty')}
                    </Alert>
                ) : (
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        {items.map((item) => (
                            <Grid key={item.id} size={{ xs: 12, sm: 6 }}>
                                <Card variant="outlined">
                                    <CardActionArea onClick={() => openDetail(item)}>
                                        <CardContent>
                                            <Typography variant="h6" noWrap>{item.name}</Typography>
                                            <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap' }}>
                                                <Chip size="small" label={t('gallery.stageCount', { n: item.stageCount })} />
                                                <Chip size="small" label={formatDuration(item.totalSeconds)} />
                                            </Stack>
                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                                {item.modeSummary} · {new Date(item.updatedAt).toLocaleDateString()}
                                            </Typography>
                                        </CardContent>
                                    </CardActionArea>
                                </Card>
                            </Grid>
                        ))}
                        {nextBefore ? (
                            <Grid size={{ xs: 12 }} sx={{ textAlign: 'center' }}>
                                <Button onClick={() => load({ before: nextBefore })}>
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
                                <Chip size="small" label={formatDuration(detail.totalSeconds)} />
                            </Stack>
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
        </div>
    );
}
