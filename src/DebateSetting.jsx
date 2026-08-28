import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
import CardContent from '@mui/material/CardContent';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Grid from '@mui/material/Grid';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import InputAdornment from '@mui/material/InputAdornment';
import Chip from '@mui/material/Chip';
import Alert from '@mui/material/Alert';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import ListItemIcon from '@mui/material/ListItemIcon';
import Divider from '@mui/material/Divider';
import Tooltip from '@mui/material/Tooltip';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import HelpOutlinedIcon from '@mui/icons-material/HelpOutlined';
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined';
import AddIcon from '@mui/icons-material/Add';
import SaveIcon from '@mui/icons-material/Save';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TuneIcon from '@mui/icons-material/Tune';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ReorderIcon from '@mui/icons-material/Reorder';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LinkOutlinedIcon from '@mui/icons-material/LinkOutlined';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import debateStagesData from './resources/debateTimeSettings.json';
import timerSettingsData from './resources/debateTimerSettings.json';
import ConfigurationService from './services/ConfigurationService';
import {
    DEFAULT_CONFIGURATION_NAME,
    getStoredConfigurationName,
    setStoredConfigurationName,
} from './config/configConstants';
import LanguageSwitcher from './components/LanguageSwitcher';
import { stageDisplayName } from './utils/stageDisplayName';
import { useColorMode } from './context/ColorModeContext';
import { useAuth } from './context/AuthContext';

/** Generate a short unique ID for custom stages. */
function generateCustomId() {
    return `custom_${Date.now().toString(36)}`;
}

const EMPTY_LABELS = { 'zh-Hans': '', 'en': '', 'fr-CA': '' };

function buildConfigSnapshot(debateStages, timerSettings, stageLabels, stageOrder) {
    return JSON.stringify({ debateStages, timerSettings, stageLabels, stageOrder });
}

function formatStageTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return `${minutes}:${rem.toString().padStart(2, '0')}`;
}

const DebateSetting = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const ownerId = searchParams.get('ownerId') || undefined;
    const { t, i18n } = useTranslation();
    const { darkMode, toggleDarkMode } = useColorMode();
    const { user, logout } = useAuth();

    const [debateStages, setDebateStages] = useState({});
    const [timerSettings, setTimerSettings] = useState({});
    const [stageLabels, setStageLabels] = useState({});
    const [stageOrder, setStageOrder] = useState([]);

    const [configurationNames, setConfigurationNames] = useState([]);
    const [selectedConfigName, setSelectedConfigName] = useState(DEFAULT_CONFIGURATION_NAME);
    const [newTemplateName, setNewTemplateName] = useState('');
    const savedSnapshotRef = useRef('');

    const [newItemLabels, setNewItemLabels] = useState({ ...EMPTY_LABELS });
    const [newItemTime, setNewItemTime] = useState(60);
    const [newItemMode, setNewItemMode] = useState('single');

    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverItem, setDragOverItem] = useState(null);
    const [shareEnabled, setShareEnabled] = useState(false);
    const [shareToken, setShareToken] = useState(null);
    const [shareBusy, setShareBusy] = useState(false);

    const markClean = useCallback((stages, settings, labels, order) => {
        savedSnapshotRef.current = buildConfigSnapshot(stages, settings, labels, order);
    }, []);

    const isDirty = useCallback(() => (
        savedSnapshotRef.current !== buildConfigSnapshot(
            debateStages,
            timerSettings,
            stageLabels,
            stageOrder,
        )
    ), [debateStages, timerSettings, stageLabels, stageOrder]);

    const getOrderedStages = () => {
        if (stageOrder.length > 0) {
            const orderedStages = [];
            stageOrder.forEach((stage) => {
                if (Object.prototype.hasOwnProperty.call(debateStages, stage)) {
                    orderedStages.push(stage);
                }
            });
            Object.keys(debateStages).forEach((stage) => {
                if (!stageOrder.includes(stage)) orderedStages.push(stage);
            });
            return orderedStages;
        }
        return Object.keys(debateStages);
    };

    const applyConfigData = useCallback((data) => {
        const labels = data.stageLabels || {};
        const order = data.stageOrder || Object.keys(data.debateStages);
        setDebateStages(data.debateStages);
        setTimerSettings(data.timerSettings);
        setStageLabels(labels);
        setStageOrder(order);
        markClean(data.debateStages, data.timerSettings, labels, order);
    }, [markClean]);

    const applyLocalFallback = useCallback(() => {
        const order = Object.keys(debateStagesData);
        setDebateStages(debateStagesData);
        setTimerSettings(timerSettingsData);
        setStageLabels({});
        setStageOrder(order);
        markClean(debateStagesData, timerSettingsData, {}, order);
    }, [markClean]);

    const refreshConfigurationList = useCallback(async () => {
        const listResult = await ConfigurationService.getConfigurations(ownerId);
        if (listResult.success) {
            const names = (listResult.data || []).map((item) => item.name);
            setConfigurationNames(names);
            return names;
        }
        return null;
    }, [ownerId]);

    const loadConfigByName = useCallback(async (name) => {
        const result = await ConfigurationService.loadConfiguration(name, ownerId);
        if (result.success) {
            applyConfigData(result.data);
            setSelectedConfigName(name);
            if (!ownerId) {
                setStoredConfigurationName(name);
            }
            setShareEnabled(Boolean(result.data.shareEnabled));
            setShareToken(result.data.shareToken || null);
            return true;
        }
        return false;
    }, [applyConfigData, ownerId]);

    useEffect(() => {
        document.body.classList.add('settings-body');
        return () => {
            document.body.classList.remove('settings-body');
        };
    }, []);

    useEffect(() => {
        const initializeSettings = async () => {
            try {
                await ConfigurationService.initializeDefaultConfigurations(ownerId);
                const names = await refreshConfigurationList() || [DEFAULT_CONFIGURATION_NAME];
                const preferred = getStoredConfigurationName();
                const target = names.includes(preferred) ? preferred : DEFAULT_CONFIGURATION_NAME;
                const loaded = await loadConfigByName(target);
                if (!loaded) {
                    applyLocalFallback();
                    setSelectedConfigName(DEFAULT_CONFIGURATION_NAME);
                }
            } catch (error) {
                console.error('Error initializing settings:', error);
                applyLocalFallback();
                setSelectedConfigName(DEFAULT_CONFIGURATION_NAME);
            }
        };
        initializeSettings();
    }, [refreshConfigurationList, loadConfigByName, applyLocalFallback, ownerId]);

    const handleTemplateSelect = async (event) => {
        const name = event.target.value;
        if (name === selectedConfigName) return;
        if (isDirty() && !window.confirm(t('settings.confirmSwitchTemplate'))) {
            return;
        }
        const loaded = await loadConfigByName(name);
        if (!loaded) {
            alert(t('settings.templateLoadFailed', { name }));
        }
    };

    const createTemplate = async () => {
        const name = newTemplateName.trim();
        if (!name) {
            alert(t('settings.templateNameRequired'));
            return;
        }
        if (configurationNames.includes(name)) {
            alert(t('settings.templateExists'));
            return;
        }

        try {
            const result = await ConfigurationService.saveConfiguration(
                name,
                debateStages,
                timerSettings,
                stageOrder,
                stageLabels,
                ownerId,
            );
            if (!result.success) {
                alert(t('settings.templateCreateFailed', { message: result.message }));
                return;
            }
            setNewTemplateName('');
            await refreshConfigurationList();
            setSelectedConfigName(name);
            if (!ownerId) {
                setStoredConfigurationName(name);
            }
            markClean(debateStages, timerSettings, stageLabels, stageOrder);
            alert(t('settings.templateCreated', { name }));
        } catch (error) {
            console.error('Error creating template:', error);
            alert(t('settings.templateCreateRetry'));
        }
    };

    const deleteTemplate = async () => {
        if (selectedConfigName === DEFAULT_CONFIGURATION_NAME) {
            alert(t('settings.templateCannotDeleteDefault'));
            return;
        }
        if (!window.confirm(t('settings.confirmDeleteTemplate', { name: selectedConfigName }))) {
            return;
        }

        const deletedName = selectedConfigName;
        try {
            const result = await ConfigurationService.deleteConfiguration(selectedConfigName, ownerId);
            if (!result.success) {
                alert(t('settings.templateDeleteFailed', { message: result.message }));
                return;
            }
            const names = await refreshConfigurationList() || [DEFAULT_CONFIGURATION_NAME];
            const next = names.includes(DEFAULT_CONFIGURATION_NAME)
                ? DEFAULT_CONFIGURATION_NAME
                : (names[0] || DEFAULT_CONFIGURATION_NAME);
            const loaded = await loadConfigByName(next);
            if (!loaded) {
                applyLocalFallback();
                setSelectedConfigName(next);
                if (!ownerId) {
                    setStoredConfigurationName(next);
                }
            }
            alert(t('settings.templateDeleted', { name: deletedName, next }));
        } catch (error) {
            console.error('Error deleting template:', error);
            alert(t('settings.templateDeleteRetry'));
        }
    };

    const displayShareUrl = shareEnabled && shareToken
        ? `${window.location.origin}/display/${encodeURIComponent(shareToken)}`
        : '';

    const handleShareToggle = async (enabled) => {
        setShareBusy(true);
        const result = await ConfigurationService.updateShare(
            selectedConfigName,
            { enabled },
            ownerId,
        );
        setShareBusy(false);
        if (!result.success) {
            alert(result.message);
            return;
        }
        setShareEnabled(Boolean(result.data?.shareEnabled));
        setShareToken(result.data?.shareToken || null);
    };

    const handleShareRotate = async () => {
        setShareBusy(true);
        const result = await ConfigurationService.updateShare(
            selectedConfigName,
            { enabled: true, rotate: true },
            ownerId,
        );
        setShareBusy(false);
        if (!result.success) {
            alert(result.message);
            return;
        }
        setShareEnabled(Boolean(result.data?.shareEnabled));
        setShareToken(result.data?.shareToken || null);
    };

    const copyShareLink = async () => {
        if (!displayShareUrl) return;
        try {
            await navigator.clipboard.writeText(displayShareUrl);
            alert(t('share.copied'));
        } catch {
            window.prompt(t('share.copyPrompt'), displayShareUrl);
        }
    };

    const handleDebateStageChange = (key, value) => {
        setDebateStages({ ...debateStages, [key]: value });
    };

    const handleTimerSettingChange = (key, value) => {
        setTimerSettings({ ...timerSettings, [key]: value });
    };

    const saveChanges = async () => {
        try {
            const result = await ConfigurationService.saveConfiguration(
                selectedConfigName,
                debateStages,
                timerSettings,
                stageOrder,
                stageLabels,
                ownerId,
            );
            if (result.success) {
                markClean(debateStages, timerSettings, stageLabels, stageOrder);
                alert(t('settings.savedSuccess', { name: selectedConfigName }));
            } else {
                alert(t('settings.saveFailed', { message: result.message }));
            }
        } catch (error) {
            console.error('Error saving configuration:', error);
            alert(t('settings.saveRetry'));
        }
    };

    const loadLocalSettings = () => {
        if (!window.confirm(t('settings.confirmReset'))) {
            return;
        }
        setDebateStages(debateStagesData);
        setTimerSettings(timerSettingsData);
        setStageLabels({});
        setStageOrder(Object.keys(debateStagesData));
    };

    const addTimerItem = () => {
        const hasAnyLabel = Object.values(newItemLabels).some((v) => v.trim());
        if (!hasAnyLabel) {
            alert(t('settings.labelRequired'));
            return;
        }

        const id = generateCustomId();
        const trimmedLabels = {};
        Object.entries(newItemLabels).forEach(([lang, val]) => {
            if (val.trim()) trimmedLabels[lang] = val.trim();
        });

        setDebateStages((prev) => ({ ...prev, [id]: newItemTime }));
        setTimerSettings((prev) => ({ ...prev, [id]: newItemMode }));
        setStageLabels((prev) => ({ ...prev, [id]: trimmedLabels }));
        setStageOrder((prev) => [...prev, id]);

        setNewItemLabels({ ...EMPTY_LABELS });
        setNewItemTime(60);
        setNewItemMode('single');
    };

    const deleteTimerItem = (itemName) => {
        if (window.confirm(t('settings.confirmDelete', {
            name: stageDisplayName(t, itemName, stageLabels, i18n.language),
        }))) {
            const newDebateStages = { ...debateStages };
            const newTimerSettings = { ...timerSettings };
            const newStageLabels = { ...stageLabels };

            delete newDebateStages[itemName];
            delete newTimerSettings[itemName];
            delete newStageLabels[itemName];

            setDebateStages(newDebateStages);
            setTimerSettings(newTimerSettings);
            setStageLabels(newStageLabels);
            setStageOrder((prev) => prev.filter((stage) => stage !== itemName));
        }
    };

    const handleDragStart = (e, itemName) => {
        setDraggedItem(itemName);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, itemName) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverItem(itemName);
    };

    const handleDragLeave = () => { setDragOverItem(null); };

    const handleDrop = (e, dropTargetItem) => {
        e.preventDefault();
        if (!draggedItem || draggedItem === dropTargetItem) {
            setDraggedItem(null);
            setDragOverItem(null);
            return;
        }
        const currentOrder = [...stageOrder];
        const draggedIndex = currentOrder.indexOf(draggedItem);
        const targetIndex = currentOrder.indexOf(dropTargetItem);
        currentOrder.splice(draggedIndex, 1);
        currentOrder.splice(targetIndex, 0, draggedItem);
        setStageOrder(currentOrder);
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const moveItemUp = (itemName) => {
        const currentOrder = [...stageOrder];
        const index = currentOrder.indexOf(itemName);
        if (index > 0) {
            [currentOrder[index], currentOrder[index - 1]] = [currentOrder[index - 1], currentOrder[index]];
            setStageOrder(currentOrder);
        }
    };

    const moveItemDown = (itemName) => {
        const currentOrder = [...stageOrder];
        const index = currentOrder.indexOf(itemName);
        if (index < currentOrder.length - 1) {
            [currentOrder[index], currentOrder[index + 1]] = [currentOrder[index + 1], currentOrder[index]];
            setStageOrder(currentOrder);
        }
    };

    const displayName = (stage) =>
        stageDisplayName(t, stage, stageLabels, i18n.language);

    const orderedStages = getOrderedStages();

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 6 }}>
            <AppBar
                position="sticky"
                elevation={0}
                color={darkMode ? 'default' : 'primary'}
                sx={{
                    borderBottom: 1,
                    borderColor: 'divider',
                    ...(darkMode
                        ? {
                            bgcolor: 'background.paper',
                            color: 'text.primary',
                            backgroundImage: 'none',
                        }
                        : {}),
                }}
            >
                <Toolbar sx={{ gap: 1, flexWrap: 'wrap', py: { xs: 1, sm: 0 } }}>
                    <Tooltip title={t('settings.backToTimer')}>
                        <IconButton
                            color="inherit"
                            edge="start"
                            onClick={() => navigate('/')}
                            aria-label={t('settings.backToTimer')}
                        >
                            <ArrowBackIcon />
                        </IconButton>
                    </Tooltip>
                    <Typography
                        variant="h6"
                        component="h1"
                        color="inherit"
                        sx={{ flexGrow: 1, fontWeight: 500 }}
                    >
                        {t('settings.pageTitle')}
                    </Typography>
                    <Box
                        role="toolbar"
                        aria-label={t('settings.toolbar')}
                        sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}
                    >
                        <LanguageSwitcher variant="mui" size="small" />
                        {user?.role === 'admin' ? (
                            <Button color="inherit" onClick={() => navigate('/admin')}>
                                {t('admin.short')}
                            </Button>
                        ) : null}
                        <Tooltip title={darkMode ? t('timer.darkLight') : t('timer.darkDark')}>
                            <IconButton
                                color="inherit"
                                onClick={toggleDarkMode}
                                aria-label={darkMode ? t('timer.darkLight') : t('timer.darkDark')}
                            >
                                {darkMode ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
                            </IconButton>
                        </Tooltip>
                        <Tooltip title={t('settings.helpTitle')}>
                            <IconButton
                                color="inherit"
                                onClick={() => alert(t('settings.helpAlert'))}
                                aria-label={t('settings.help')}
                            >
                                <HelpOutlinedIcon />
                            </IconButton>
                        </Tooltip>
                        <Button
                            color="inherit"
                            onClick={async () => {
                                await logout();
                                navigate('/login');
                            }}
                        >
                            {t('auth.logout')}
                        </Button>
                    </Box>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ pt: 3 }}>
                {ownerId ? (
                    <Alert severity="warning" sx={{ mb: 2 }}>
                        {t('admin.editingOtherUser')}
                    </Alert>
                ) : null}
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    {t('settings.pageSubtitle')}
                </Typography>

                <Stack spacing={3}>
                    {/* Template Management */}
                    <Card>
                        <CardHeader
                            avatar={<FolderOpenIcon color="primary" />}
                            title={t('settings.templateTitle')}
                            subheader={t('settings.templateDesc')}
                        />
                        <CardContent>
                            <Stack spacing={2.5}>
                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
                                    <FormControl fullWidth size="small">
                                        <InputLabel id="template-select-label">
                                            {t('settings.templateCurrent')}
                                        </InputLabel>
                                        <Select
                                            labelId="template-select-label"
                                            label={t('settings.templateCurrent')}
                                            value={selectedConfigName}
                                            onChange={handleTemplateSelect}
                                        >
                                            {configurationNames.map((name) => (
                                                <MenuItem key={name} value={name}>{name}</MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    <Button
                                        variant="outlined"
                                        color="error"
                                        startIcon={<DeleteOutlinedIcon />}
                                        onClick={deleteTemplate}
                                        disabled={selectedConfigName === DEFAULT_CONFIGURATION_NAME}
                                        title={
                                            selectedConfigName === DEFAULT_CONFIGURATION_NAME
                                                ? t('settings.templateCannotDeleteDefault')
                                                : t('settings.templateDeleteTitle')
                                        }
                                        sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                                    >
                                        {t('settings.templateDelete')}
                                    </Button>
                                </Stack>

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'flex-start' }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label={t('settings.templateNewName')}
                                        value={newTemplateName}
                                        onChange={(e) => setNewTemplateName(e.target.value)}
                                        placeholder={t('settings.templateNamePlaceholder')}
                                        slotProps={{ htmlInput: { maxLength: 60 } }}
                                    />
                                    <Button
                                        variant="contained"
                                        startIcon={<AddIcon />}
                                        onClick={createTemplate}
                                        sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                                    >
                                        {t('settings.templateCreate')}
                                    </Button>
                                </Stack>

                                <Alert severity="info" variant="outlined">
                                    {t('settings.templateHint')}
                                </Alert>
                            </Stack>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader
                            avatar={<LinkOutlinedIcon color="primary" />}
                            title={t('share.title')}
                            subheader={t('share.desc')}
                        />
                        <CardContent>
                            <Stack spacing={2}>
                                <FormControlLabel
                                    control={(
                                        <Switch
                                            checked={shareEnabled}
                                            disabled={shareBusy || !selectedConfigName}
                                            onChange={(e) => handleShareToggle(e.target.checked)}
                                        />
                                    )}
                                    label={shareEnabled ? t('share.enabled') : t('share.disabled')}
                                />
                                {shareEnabled && displayShareUrl ? (
                                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label={t('share.url')}
                                            value={displayShareUrl}
                                            slotProps={{ htmlInput: { readOnly: true } }}
                                        />
                                        <Button
                                            variant="outlined"
                                            startIcon={<ContentCopyIcon />}
                                            onClick={copyShareLink}
                                            sx={{ flexShrink: 0 }}
                                        >
                                            {t('share.copy')}
                                        </Button>
                                        <Button
                                            variant="outlined"
                                            disabled={shareBusy}
                                            onClick={handleShareRotate}
                                            sx={{ flexShrink: 0 }}
                                        >
                                            {t('share.rotate')}
                                        </Button>
                                    </Stack>
                                ) : (
                                    <Alert severity="info" variant="outlined">{t('share.hint')}</Alert>
                                )}
                            </Stack>
                        </CardContent>
                    </Card>

                    {/* Duration Settings */}
                    <Card>
                        <CardHeader
                            avatar={<AccessTimeIcon color="primary" />}
                            title={t('settings.durationTitle')}
                            subheader={t('settings.durationDesc')}
                        />
                        <CardContent>
                            <Grid container spacing={2}>
                                {orderedStages.map((stage) => (
                                    <Grid key={stage} size={{ xs: 12, sm: 6, md: 4 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            type="number"
                                            label={displayName(stage)}
                                            value={debateStages[stage] ?? 0}
                                            onChange={(e) => handleDebateStageChange(stage, parseInt(e.target.value, 10) || 0)}
                                            slotProps={{
                                                htmlInput: { min: 0, max: 3600 },
                                                input: {
                                                    endAdornment: (
                                                        <InputAdornment position="end">
                                                            <Chip
                                                                size="small"
                                                                label={formatStageTime(debateStages[stage] || 0)}
                                                                color="primary"
                                                                variant="outlined"
                                                            />
                                                        </InputAdornment>
                                                    ),
                                                },
                                            }}
                                        />
                                    </Grid>
                                ))}
                            </Grid>
                        </CardContent>
                    </Card>

                    {/* Timer Mode */}
                    <Card>
                        <CardHeader
                            avatar={<TuneIcon color="primary" />}
                            title={t('settings.modeTitle')}
                            subheader={t('settings.modeDesc')}
                        />
                        <CardContent>
                            <Grid container spacing={2}>
                                {orderedStages.map((stage) => (
                                    <Grid key={stage} size={{ xs: 12, sm: 6, md: 4 }}>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <FormControl fullWidth size="small">
                                                <InputLabel id={`mode-${stage}`}>{displayName(stage)}</InputLabel>
                                                <Select
                                                    labelId={`mode-${stage}`}
                                                    label={displayName(stage)}
                                                    value={timerSettings[stage] || 'single'}
                                                    onChange={(e) => handleTimerSettingChange(stage, e.target.value)}
                                                >
                                                    <MenuItem value="single">{t('settings.singleTimer')}</MenuItem>
                                                    <MenuItem value="double">{t('settings.doubleTimer')}</MenuItem>
                                                </Select>
                                            </FormControl>
                                            <Tooltip title={t('settings.deleteItemTitle')}>
                                                <IconButton
                                                    color="error"
                                                    onClick={() => deleteTimerItem(stage)}
                                                    aria-label={t('settings.deleteItemTitle')}
                                                >
                                                    <DeleteOutlinedIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </Grid>
                                ))}
                            </Grid>
                        </CardContent>
                    </Card>

                    {/* Add Stage */}
                    <Card>
                        <CardHeader
                            avatar={<AddIcon color="primary" />}
                            title={t('settings.addTitle')}
                            subheader={t('settings.addDesc')}
                        />
                        <CardContent>
                            <Stack spacing={2.5}>
                                <Grid container spacing={2}>
                                    <Grid size={{ xs: 12, md: 4 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label={t('settings.labelZh')}
                                            value={newItemLabels['zh-Hans']}
                                            onChange={(e) => setNewItemLabels((prev) => ({ ...prev, 'zh-Hans': e.target.value }))}
                                            placeholder={t('settings.placeholderLabelZh')}
                                            slotProps={{ htmlInput: { maxLength: 40 } }}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 4 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label={t('settings.labelEn')}
                                            value={newItemLabels.en}
                                            onChange={(e) => setNewItemLabels((prev) => ({ ...prev, en: e.target.value }))}
                                            placeholder={t('settings.placeholderLabelEn')}
                                            slotProps={{ htmlInput: { maxLength: 40 } }}
                                        />
                                    </Grid>
                                    <Grid size={{ xs: 12, md: 4 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label={t('settings.labelFr')}
                                            value={newItemLabels['fr-CA']}
                                            onChange={(e) => setNewItemLabels((prev) => ({ ...prev, 'fr-CA': e.target.value }))}
                                            placeholder={t('settings.placeholderLabelFr')}
                                            slotProps={{ htmlInput: { maxLength: 40 } }}
                                        />
                                    </Grid>
                                </Grid>

                                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
                                    <TextField
                                        size="small"
                                        type="number"
                                        label={t('settings.durationSeconds')}
                                        value={newItemTime}
                                        onChange={(e) => setNewItemTime(parseInt(e.target.value, 10) || 0)}
                                        slotProps={{ htmlInput: { min: 1, max: 3600 } }}
                                        sx={{ minWidth: 160 }}
                                    />
                                    <FormControl size="small" sx={{ minWidth: 180 }}>
                                        <InputLabel id="new-item-mode-label">{t('settings.timerMode')}</InputLabel>
                                        <Select
                                            labelId="new-item-mode-label"
                                            label={t('settings.timerMode')}
                                            value={newItemMode}
                                            onChange={(e) => setNewItemMode(e.target.value)}
                                        >
                                            <MenuItem value="single">{t('settings.singleTimer')}</MenuItem>
                                            <MenuItem value="double">{t('settings.doubleTimer')}</MenuItem>
                                        </Select>
                                    </FormControl>
                                    <Button
                                        variant="contained"
                                        startIcon={<AddIcon />}
                                        onClick={addTimerItem}
                                    >
                                        {t('settings.addButton')}
                                    </Button>
                                </Stack>
                            </Stack>
                        </CardContent>
                    </Card>

                    {/* Order */}
                    <Card>
                        <CardHeader
                            avatar={<ReorderIcon color="primary" />}
                            title={t('settings.orderTitle')}
                            subheader={t('settings.orderDesc')}
                        />
                        <CardContent sx={{ pt: 0 }}>
                            <List disablePadding>
                                {orderedStages.map((stage, index) => (
                                    <React.Fragment key={stage}>
                                        {index > 0 && <Divider component="li" />}
                                        <ListItem
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, stage)}
                                            onDragOver={(e) => handleDragOver(e, stage)}
                                            onDragLeave={handleDragLeave}
                                            onDrop={(e) => handleDrop(e, stage)}
                                            onDragEnd={handleDragEnd}
                                            sx={{
                                                bgcolor: dragOverItem === stage
                                                    ? 'action.hover'
                                                    : draggedItem === stage
                                                        ? 'action.selected'
                                                        : 'transparent',
                                                borderRadius: 1,
                                                cursor: 'grab',
                                                py: 1.25,
                                            }}
                                            secondaryAction={(
                                                <Stack direction="row" spacing={0.5}>
                                                    <Tooltip title={t('settings.moveUp')}>
                                                        <span>
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => moveItemUp(stage)}
                                                                disabled={index === 0}
                                                                aria-label={t('settings.moveUp')}
                                                            >
                                                                <KeyboardArrowUpIcon />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                    <Tooltip title={t('settings.moveDown')}>
                                                        <span>
                                                            <IconButton
                                                                size="small"
                                                                onClick={() => moveItemDown(stage)}
                                                                disabled={index === orderedStages.length - 1}
                                                                aria-label={t('settings.moveDown')}
                                                            >
                                                                <KeyboardArrowDownIcon />
                                                            </IconButton>
                                                        </span>
                                                    </Tooltip>
                                                </Stack>
                                            )}
                                        >
                                            <ListItemIcon sx={{ minWidth: 36 }}>
                                                <Chip size="small" label={index + 1} color="primary" />
                                            </ListItemIcon>
                                            <ListItemIcon sx={{ minWidth: 36, color: 'text.secondary' }}>
                                                <DragIndicatorIcon fontSize="small" />
                                            </ListItemIcon>
                                            <ListItemText
                                                primary={displayName(stage)}
                                                secondary={`${formatStageTime(debateStages[stage] || 0)} · ${
                                                    timerSettings[stage] === 'double'
                                                        ? t('settings.doubleTimer')
                                                        : t('settings.singleTimer')
                                                }`}
                                            />
                                        </ListItem>
                                    </React.Fragment>
                                ))}
                            </List>
                            <Alert severity="info" variant="outlined" sx={{ mt: 2 }}>
                                {t('settings.orderHint')}
                            </Alert>
                        </CardContent>
                    </Card>

                    {/* Actions */}
                    <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        spacing={2}
                        justifyContent="center"
                        sx={{ pt: 1, pb: 2 }}
                    >
                        <Button
                            variant="outlined"
                            size="large"
                            startIcon={<RestartAltIcon />}
                            onClick={loadLocalSettings}
                        >
                            {t('settings.resetDefault')}
                        </Button>
                        <Button
                            variant="contained"
                            color="success"
                            size="large"
                            startIcon={<SaveIcon />}
                            onClick={saveChanges}
                        >
                            {t('settings.save')}
                        </Button>
                    </Stack>
                </Stack>
            </Container>
        </Box>
    );
};

export default DebateSetting;
