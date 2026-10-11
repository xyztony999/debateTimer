import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import SettingsIcon from '@mui/icons-material/Settings';
import BarChartIcon from '@mui/icons-material/BarChart';
import PublicIcon from '@mui/icons-material/Public';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import LogoutIcon from '@mui/icons-material/Logout';
import KeyboardIcon from '@mui/icons-material/Keyboard';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SaveIcon from '@mui/icons-material/Save';
import LanguageSwitcher from './components/LanguageSwitcher';
import { InstallButton } from './components/PwaBits';
import TimerBox from './components/TimerBox';
import useDebateTimer from './timer/useDebateTimer';
import useTimerKeyboardShortcuts from './timer/useTimerKeyboardShortcuts';
import { stageDisplayName } from './utils/stageDisplayName';
import { useColorMode } from './context/ColorModeContext';
import { useAuth } from './context/AuthContext';
import './timer/timer-control.css';

/**
 * Operator console (控制端): AppBar with session controls, a clickable
 * stage timeline, the shared clock faces, and a bottom action bar with
 * large touch-friendly buttons. Runs the same useDebateTimer runtime as
 * the display page.
 */
export default function TimerControlPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { darkMode, toggleDarkMode } = useColorMode();
    const { user, logout } = useAuth();
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [helpAnchor, setHelpAnchor] = useState(null);

    const {
        config,
        state,
        derived,
        orderedStages,
        sessionState,
        sessionNotice,
        captureCount,
        actions,
        handleStartSession,
        handleStopSession,
        handleCopyDisplayUrl,
        saveMatchRecord,
    } = useDebateTimer();

    useTimerKeyboardShortcuts({
        enabled: true,
        isDual: derived.isDual,
        handlers: {
            onAnyInput: actions.cancelAdvance,
            onPrevStage: () => actions.goToAdjacentStage(-1),
            onNextStage: () => actions.goToAdjacentStage(1),
            toggleAff: actions.toggleAff,
            resetAff: () => {
                if (!state.sides.aff.running) {
                    actions.resetAff();
                }
            },
            toggleNeg: actions.toggleNeg,
            resetNeg: () => {
                if (!state.sides.neg.running) {
                    actions.resetNeg();
                }
            },
            toggleSingle: actions.toggleSingle,
            resetSingle: () => {
                if (state.sides.single.running) {
                    return;
                }
                if (state.stageId === 'sound_check') {
                    actions.prepZeroSingle();
                } else {
                    actions.resetSingle();
                }
            },
        },
    });

    useEffect(() => {
        document.body.classList.add('control-body');
        return () => {
            document.body.classList.remove('control-body');
        };
    }, []);

    const sessionActive = sessionState === 'active' || sessionState === 'weak';
    const affLabel = config.teamNames.aff || t('timer.affirmative');
    const negLabel = config.teamNames.neg || t('timer.negative');
    const stageName = (stage) => stageDisplayName(t, stage, config.stageLabels, i18n.language);

    return (
        <Box
            sx={{
                minHeight: '100dvh',
                pt: 'env(safe-area-inset-top)',
                pb: 'calc(96px + env(safe-area-inset-bottom))',
            }}
        >
            <AppBar position="sticky" elevation={2}>
                <Toolbar sx={{ gap: 1 }}>
                    <Typography variant="h6" component="h1" sx={{ fontWeight: 700, mr: 'auto' }}>
                        🎯 <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('timer.title')}</Box>
                    </Typography>

                    <Button
                        color="inherit"
                        size="small"
                        startIcon={<SaveIcon />}
                        disabled={captureCount === 0}
                        onClick={() => saveMatchRecord(false)}
                        title={t('records.saveHint')}
                    >
                        <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>{t('records.save')}</Box>
                    </Button>

                    {sessionActive ? (
                        <React.Fragment>
                            <Chip
                                size="small"
                                color={sessionState === 'active' ? 'success' : 'warning'}
                                label={sessionState === 'active'
                                    ? t('timer.session.active')
                                    : t('timer.session.weak')}
                            />
                            <IconButton color="inherit" onClick={handleCopyDisplayUrl} title={t('timer.session.copyUrl')}>
                                🔗
                            </IconButton>
                            <IconButton color="inherit" onClick={handleStopSession} title={t('timer.session.stop')}>
                                ⏹
                            </IconButton>
                        </React.Fragment>
                    ) : (
                        <Button
                            color="inherit"
                            size="small"
                            disabled={sessionState === 'starting'}
                            onClick={handleStartSession}
                        >
                            📡 {t('timer.session.start')}
                        </Button>
                    )}

                    <InstallButton className="ctl-install" />

                    <IconButton
                        className="ctl-help-btn"
                        color="inherit"
                        onClick={(event) => setHelpAnchor(event.currentTarget)}
                        title={t('timer.shortcutsTitle')}
                    >
                        <KeyboardIcon />
                    </IconButton>
                    <IconButton color="inherit" onClick={(event) => setMenuAnchor(event.currentTarget)}>
                        <MoreVertIcon />
                    </IconButton>
                </Toolbar>
            </AppBar>

            <Popover
                open={Boolean(helpAnchor)}
                anchorEl={helpAnchor}
                onClose={() => setHelpAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <Stack sx={{ p: 2, minWidth: 260 }} spacing={0.75}>
                    <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                        {t('timer.shortcutsTitle')}
                    </Typography>
                    {[t('timer.hintSingle'), t('timer.hintAff'), t('timer.hintNeg'),
                        t('timer.hintFree'), t('timer.hintStage')].map((line) => (
                        <Typography key={line} variant="body2" color="text.secondary">
                            {line}
                        </Typography>
                    ))}
                </Stack>
            </Popover>

            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={() => setMenuAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            >
                <MenuItem onClick={() => { setMenuAnchor(null); navigate('/settings'); }}>
                    <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon>
                    {t('timer.settings')}
                </MenuItem>
                <MenuItem onClick={() => { setMenuAnchor(null); navigate('/records'); }}>
                    <ListItemIcon><BarChartIcon fontSize="small" /></ListItemIcon>
                    {t('records.title')}
                </MenuItem>
                <MenuItem onClick={() => { setMenuAnchor(null); navigate('/gallery'); }}>
                    <ListItemIcon><PublicIcon fontSize="small" /></ListItemIcon>
                    {t('gallery.title')}
                </MenuItem>
                {user?.role === 'admin' ? (
                    <MenuItem onClick={() => { setMenuAnchor(null); navigate('/admin'); }}>
                        <ListItemIcon><AdminPanelSettingsIcon fontSize="small" /></ListItemIcon>
                        {t('admin.title')}
                    </MenuItem>
                ) : null}
                <Divider />
                <MenuItem disableRipple sx={{ display: 'block', pt: 1 }}>
                    <Typography variant="caption" color="text.secondary">{t('timer.language')}</Typography>
                    <LanguageSwitcher variant="mui" />
                </MenuItem>
                <MenuItem onClick={toggleDarkMode}>
                    <ListItemIcon>
                        {darkMode ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
                    </ListItemIcon>
                    {darkMode ? t('timer.darkLight') : t('timer.darkDark')}
                </MenuItem>
                <MenuItem disableRipple>
                    <InstallButton variant="text" />
                </MenuItem>
                <Divider />
                <MenuItem onClick={async () => { await logout(); navigate('/login'); }}>
                    <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                    {t('auth.logout')}
                </MenuItem>
            </Menu>

            <Container maxWidth="lg" sx={{ pt: 2 }}>
                {/* 阶段时间线：点击切换，当前高亮 */}
                <Box
                    className="stage-timeline"
                    role="tablist"
                    aria-label={t('timer.timeline')}
                >
                    {orderedStages.map((stage, index) => (
                        <button
                            key={stage}
                            type="button"
                            role="tab"
                            aria-selected={stage === state.stageId}
                            className={[
                                'st-step',
                                stage === state.stageId ? 'st-step--current' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => actions.applyStage(stage)}
                            title={stageName(stage)}
                        >
                            <span className="st-idx">{index + 1}</span>
                            <span className="st-name">{stageName(stage)}</span>
                        </button>
                    ))}
                </Box>

                {/* 阶段语境区：试铃 / 自动推进倒计时 */}
                <Stack spacing={1.5} alignItems="center" sx={{ mt: 1.5, mb: 0.5 }}>
                    <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
                        {stageName(state.stageId)}
                    </Typography>
                    {state.stageId === 'sound_check' ? (
                        <Stack direction="row" spacing={1}>
                            <Button variant="outlined" onClick={actions.soundCheck30}>
                                {t('timer.test30sSound')}
                            </Button>
                            <Button variant="outlined" onClick={actions.soundCheckEnd}>
                                {t('timer.testEndSound')}
                            </Button>
                        </Stack>
                    ) : null}
                    {state.advance != null ? (
                        <Alert severity="info" role="status">
                            {t('timer.advanceCountdown', { n: state.advance })}
                        </Alert>
                    ) : null}
                </Stack>

                {/* 时钟区 */}
                <Box className="clock-area">
                    {derived.isDual ? (
                        <React.Fragment>
                            <TimerBox
                                sideState={state.sides.aff}
                                blinking={derived.blinking.aff}
                                active={derived.isFree && derived.activeSide === 'aff'}
                                title={affLabel}
                                badge={t('timer.affBadge')}
                                graceText={t('timer.graceHint')}
                                hint={t('timer.hintAff')}
                                startTitle={t('timer.shortcutAffToggle')}
                                stopTitle={t('timer.shortcutAffToggle')}
                                resetTitle={t('timer.shortcutAffReset')}
                                onStart={actions.startAff}
                                onStop={actions.stopAff}
                                onReset={actions.resetAff}
                            />
                            <TimerBox
                                sideState={state.sides.neg}
                                blinking={derived.blinking.neg}
                                active={derived.isFree && derived.activeSide === 'neg'}
                                title={negLabel}
                                badge={t('timer.negBadge')}
                                graceText={t('timer.graceHint')}
                                hint={t('timer.hintNeg')}
                                startTitle={t('timer.shortcutNegToggle')}
                                stopTitle={t('timer.shortcutNegToggle')}
                                resetTitle={t('timer.shortcutNegReset')}
                                onStart={actions.startNeg}
                                onStop={actions.stopNeg}
                                onReset={actions.resetNeg}
                            />
                        </React.Fragment>
                    ) : (
                        <TimerBox
                            sideState={state.sides.single}
                            blinking={derived.blinking.single}
                            graceText={t('timer.graceHint')}
                            hint={t('timer.hintSingle')}
                            startTitle={t('timer.shortcutSingleToggle')}
                            stopTitle={t('timer.shortcutSingleToggle')}
                            resetTitle={t('timer.shortcutSingleReset')}
                            onStart={actions.toggleSingle}
                            onStop={actions.toggleSingle}
                            onReset={actions.resetSingle}
                        />
                    )}
                </Box>

                {derived.freeLocked ? (
                    <Typography
                        color="error"
                        sx={{ textAlign: 'center', mt: 2, fontWeight: 600 }}
                        role="status"
                    >
                        {t('timer.free.locked')}
                    </Typography>
                ) : null}
            </Container>

            {/* 底部主操作栏：大按钮，触屏/快捷键双入口 */}
            <AppBar
                className="ctl-action-bar"
                position="fixed"
                color="default"
                elevation={4}
                sx={{ top: 'auto', bottom: 0, py: 1.25, px: 2 }}
            >
                <Toolbar disableGutters sx={{ justifyContent: 'center', gap: 2 }}>
                    {derived.isDual ? (
                        <React.Fragment>
                            <Button
                                variant={state.sides.aff.running ? 'outlined' : 'contained'}
                                size="large"
                                onClick={actions.toggleAff}
                                sx={{ minWidth: 170 }}
                            >
                                {state.sides.aff.running
                                    ? `⏸ ${t('timer.op.pause')} · ${t('timer.affBadge')}`
                                    : `▶ ${t('timer.op.start')} · ${t('timer.affBadge')}`}
                            </Button>
                            <Button
                                variant={state.sides.neg.running ? 'outlined' : 'contained'}
                                size="large"
                                onClick={actions.toggleNeg}
                                sx={{ minWidth: 170 }}
                            >
                                {state.sides.neg.running
                                    ? `⏸ ${t('timer.op.pause')} · ${t('timer.negBadge')}`
                                    : `▶ ${t('timer.op.start')} · ${t('timer.negBadge')}`}
                            </Button>
                        </React.Fragment>
                    ) : (
                        <React.Fragment>
                            <Button
                                variant={state.sides.single.running ? 'outlined' : 'contained'}
                                size="large"
                                onClick={actions.toggleSingle}
                                sx={{ minWidth: 170 }}
                            >
                                {state.sides.single.running
                                    ? `⏸ ${t('timer.op.pause')}`
                                    : `▶ ${t('timer.op.start')}`}
                            </Button>
                            <Button
                                variant="outlined"
                                size="large"
                                onClick={actions.resetSingle}
                                disabled={state.sides.single.running}
                            >
                                ↺ {t('timer.op.reset')}
                            </Button>
                        </React.Fragment>
                    )}
                </Toolbar>
            </AppBar>

            {sessionNotice ? (
                <Box
                    role="status"
                    sx={{
                        position: 'fixed',
                        bottom: 96,
                        left: '50%',
                        transform: 'translateX(-50%)',
                        zIndex: (theme) => theme.zIndex.snackbar - 1,
                    }}
                >
                    <Alert severity="info">{sessionNotice}</Alert>
                </Box>
            ) : null}
        </Box>
    );
}
