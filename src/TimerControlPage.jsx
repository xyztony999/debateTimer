import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
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
import { formatTime } from './timer/engine';
import { stageDisplayName } from './utils/stageDisplayName';
import { useColorMode } from './context/ColorModeContext';
import { useAuth } from './context/AuthContext';
import './timer/timer-control.css';

/** Compact clock chip for the remote layout's dual-clock strip. */
function RemoteClock({ teamLabel, badge, sideState, blinking, live }) {
    const inGrace = sideState.phase === 'grace';
    const timeClass = [
        'rm-clock-time',
        sideState.phase === 'locked' ? 'rm-clock-time--locked' : '',
        inGrace ? 'rm-clock-time--grace' : '',
        blinking ? 'rm-clock-time--warn' : '',
    ].filter(Boolean).join(' ');
    return (
        <div className={`rm-clock${live ? ' rm-clock--live' : ''}`}>
            <div className="rm-clock-name">
                <div className="rm-clock-team">
                    <span className="rm-badge">{badge}</span>
                    {teamLabel}
                </div>
            </div>
            <div className={timeClass}>
                {formatTime(inGrace ? sideState.graceLeft : sideState.remaining)}
            </div>
        </div>
    );
}

/**
 * Operator console (控制端): AppBar with session controls, a clickable
 * stage timeline, the shared clock faces, and a bottom action bar with
 * large touch-friendly buttons. Runs the same useDebateTimer runtime as
 * the display page. Phones in portrait (≤600px) get the C-01-08 remote
 * layout instead — same runtime, thumb-first presentation.
 */
export default function TimerControlPage() {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { darkMode, toggleDarkMode } = useColorMode();
    const { user, logout } = useAuth();
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [helpAnchor, setHelpAnchor] = useState(null);
    // C-01-08 remote layout: portrait phones switch presentation automatically.
    const isRemote = useMediaQuery('(max-width:600px) and (orientation: portrait)');

    const {
        config,
        state,
        derived,
        orderedStages,
        following,
        sessionState,
        sessionNotice,
        captureCount,
        pendingSession,
        startFollowing,
        takeoverSession,
        dismissPendingSession,
        actions,
        handleStartSession,
        handleStopSession,
        handleCopyDisplayUrl,
        saveMatchRecord,
    } = useDebateTimer();

    useTimerKeyboardShortcuts({
        enabled: !following,
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

    // 融合式导航（PageSpec v1.2 D3）：切换阶段后把选中胶囊滚到时间线中央
    useEffect(() => {
        document.querySelector('.st-step--current')
            ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }, [state.stageId]);

    const sessionActive = sessionState === 'active' || sessionState === 'weak';
    const affLabel = config.teamNames.aff || t('timer.affirmative');
    const negLabel = config.teamNames.neg || t('timer.negative');
    const stageName = (stage) => stageDisplayName(t, stage, config.stageLabels, i18n.language);

    // Shared between both layout branches.
    const stageTimeline = (
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
                    disabled={following}
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
    );

    const contextRow = (state.stageId === 'sound_check' || state.advance != null) ? (
        <Stack spacing={1.5} sx={{ alignItems: 'center', mt: 1.5 }}>
            {state.stageId === 'sound_check' ? (
                <Stack direction="row" spacing={1}>
                    <Button variant="outlined" disabled={following} onClick={actions.soundCheck30}>
                        {t('timer.test30sSound')}
                    </Button>
                    <Button variant="outlined" disabled={following} onClick={actions.soundCheckEnd}>
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
    ) : null;

    // Remote layout: mirror the single clock onto both chips (single stages).
    const remoteAff = derived.isDual ? state.sides.aff : state.sides.single;
    const remoteNeg = derived.isDual ? state.sides.neg : state.sides.single;
    const remoteAffBlink = derived.isDual ? derived.blinking.aff : derived.blinking.single;
    const remoteAffLive = derived.isDual && derived.activeSide === 'aff';

    return (
        <Box
            sx={{
                minHeight: '100dvh',
                pt: 'env(safe-area-inset-top)',
                pb: isRemote
                    ? 'env(safe-area-inset-bottom)'
                    : 'calc(96px + env(safe-area-inset-bottom))',
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

                    {following ? (
                        <React.Fragment>
                            <Chip size="small" color="info" label={t('timer.session.following')} />
                            <Button color="inherit" size="small" onClick={takeoverSession}>
                                ⇄ {t('timer.session.takeover')}
                            </Button>
                        </React.Fragment>
                    ) : sessionActive ? (
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

            {/* C-02-06 会话发现：跟随 / 接管 / 稍后 */}
            <Dialog
                open={pendingSession}
                onClose={dismissPendingSession}
                maxWidth="xs"
                fullWidth
            >
                <DialogTitle>{t('timer.session.foundTitle')}</DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        {t('timer.session.foundBody', { name: config.name })}
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={dismissPendingSession}>{t('common.cancel')}</Button>
                    <Button color="secondary" onClick={takeoverSession}>
                        {t('timer.session.takeover')}
                    </Button>
                    <Button variant="contained" autoFocus onClick={startFollowing}>
                        {t('timer.session.follow')}
                    </Button>
                </DialogActions>
            </Dialog>

            {isRemote ? (
                /* ===== C-01-08 遥控器布局（竖屏自动）：钟条 → 语境 → 主操作 → 阶段横滑 ===== */
                <Container
                    maxWidth="sm"
                    sx={{
                        pt: 1,
                        pb: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        minHeight: 'calc(100dvh - 64px)',
                    }}
                >
                    <div className="rm-clocks">
                        <RemoteClock
                            teamLabel={affLabel}
                            badge={t('timer.affBadge')}
                            sideState={remoteAff}
                            blinking={remoteAffBlink}
                            live={remoteAffLive}
                        />
                        <RemoteClock
                            teamLabel={negLabel}
                            badge={t('timer.negBadge')}
                            sideState={remoteNeg}
                            blinking={derived.isDual ? derived.blinking.neg : derived.blinking.single}
                            live={derived.isDual && derived.activeSide === 'neg'}
                        />
                    </div>

                    <Typography
                        variant="subtitle1"
                        component="h2"
                        sx={{ textAlign: 'center', fontWeight: 600, mt: 1.25 }}
                    >
                        {stageName(state.stageId)}
                    </Typography>
                    {contextRow}

                    <div className="rm-main">
                        {following ? (
                            <Typography color="info.main" sx={{ textAlign: 'center', fontWeight: 600 }} role="status">
                                {t('timer.session.following')}
                            </Typography>
                        ) : null}
                        {derived.isFree ? (
                            <React.Fragment>
                                <div className="rm-side-row">
                                    <button
                                        type="button"
                                        className={`rm-big-btn${state.sides.aff.running ? ' rm-big-btn--live' : ''}`}
                                        disabled={following || state.sides.aff.phase === 'locked'}
                                        onClick={actions.toggleAff}
                                    >
                                        <span className="rm-big-icon">{state.sides.aff.running ? '⏸' : '▶'}</span>
                                        {state.sides.aff.running
                                            ? t('timer.remote.affSpeaking')
                                            : t('timer.remote.pressToStart')}
                                    </button>
                                    <button
                                        type="button"
                                        className={`rm-big-btn${state.sides.neg.running ? ' rm-big-btn--live' : ''}`}
                                        disabled={following || state.sides.neg.phase === 'locked'}
                                        onClick={actions.toggleNeg}
                                    >
                                        <span className="rm-big-icon">{state.sides.neg.running ? '⏸' : '▶'}</span>
                                        {state.sides.neg.running
                                            ? t('timer.remote.negSpeaking')
                                            : t('timer.remote.pressToStart')}
                                    </button>
                                </div>
                                {derived.freeLocked ? (
                                    <p className="rm-locked-note" role="status">{t('timer.free.locked')}</p>
                                ) : null}
                                <div className="rm-reset-row">
                                    <button
                                        type="button"
                                        className="rm-reset-btn"
                                        disabled={following || state.sides.aff.running}
                                        onClick={actions.resetAff}
                                    >
                                        ↺ {t('timer.affBadge')}
                                    </button>
                                    <button
                                        type="button"
                                        className="rm-reset-btn"
                                        disabled={following || state.sides.neg.running}
                                        onClick={actions.resetNeg}
                                    >
                                        ↺ {t('timer.negBadge')}
                                    </button>
                                </div>
                            </React.Fragment>
                        ) : derived.isDual ? (
                            <React.Fragment>
                                <div className="rm-side-row">
                                    <button
                                        type="button"
                                        className={`rm-big-btn${state.sides.aff.running ? ' rm-big-btn--live' : ''}`}
                                        disabled={following || state.sides.aff.phase === 'locked'}
                                        onClick={actions.toggleAff}
                                    >
                                        <span className="rm-big-icon">{state.sides.aff.running ? '⏸' : '▶'}</span>
                                        {state.sides.aff.running
                                            ? `${t('timer.op.pause')} · ${t('timer.affBadge')}`
                                            : `${t('timer.op.start')} · ${t('timer.affBadge')}`}
                                    </button>
                                    <button
                                        type="button"
                                        className={`rm-big-btn${state.sides.neg.running ? ' rm-big-btn--live' : ''}`}
                                        disabled={following || state.sides.neg.phase === 'locked'}
                                        onClick={actions.toggleNeg}
                                    >
                                        <span className="rm-big-icon">{state.sides.neg.running ? '⏸' : '▶'}</span>
                                        {state.sides.neg.running
                                            ? `${t('timer.op.pause')} · ${t('timer.negBadge')}`
                                            : `${t('timer.op.start')} · ${t('timer.negBadge')}`}
                                    </button>
                                </div>
                                <div className="rm-reset-row">
                                    <button
                                        type="button"
                                        className="rm-reset-btn"
                                        disabled={following || state.sides.aff.running}
                                        onClick={actions.resetAff}
                                    >
                                        ↺ {t('timer.affBadge')}
                                    </button>
                                    <button
                                        type="button"
                                        className="rm-reset-btn"
                                        disabled={following || state.sides.neg.running}
                                        onClick={actions.resetNeg}
                                    >
                                        ↺ {t('timer.negBadge')}
                                    </button>
                                </div>
                            </React.Fragment>
                        ) : (
                            <React.Fragment>
                                <button
                                    type="button"
                                    className={`rm-big-btn rm-master-btn${state.sides.single.running ? ' rm-big-btn--live' : ''}`}
                                    disabled={following || state.sides.single.phase === 'locked'}
                                    onClick={actions.toggleSingle}
                                >
                                    <span className="rm-big-icon">{state.sides.single.running ? '⏸' : '▶'}</span>
                                    {state.sides.single.running ? t('timer.op.pause') : t('timer.op.start')}
                                </button>
                                <div className="rm-reset-row">
                                    <button
                                        type="button"
                                        className="rm-reset-btn"
                                        disabled={following || state.sides.single.running}
                                        onClick={actions.resetSingle}
                                    >
                                        ↺ {t('timer.op.reset')}
                                    </button>
                                </div>
                            </React.Fragment>
                        )}
                    </div>

                    {stageTimeline}
                </Container>
            ) : (
                <Container maxWidth="lg" sx={{ pt: 2 }}>
                    {stageTimeline}
                    {contextRow}

                    {/* 时钟区 */}
                    <Box className="clock-area">
                        {derived.isDual ? (
                            <React.Fragment>
                                <TimerBox
                                    sideState={state.sides.aff}
                                    blinking={derived.blinking.aff}
                                    active={derived.isFree && derived.activeSide === 'aff'}
                                    readonly={following}
                                    readonlyText={t('timer.session.following')}
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
                                    readonly={following}
                                    readonlyText={t('timer.session.following')}
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
                                readonly={following}
                                readonlyText={t('timer.session.following')}
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
            )}

            {/* 底部主操作栏：大按钮，触屏/快捷键双入口（遥控器布局自带主操作区，不渲染） */}
            {!isRemote ? (
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
                                    disabled={following}
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
                                    disabled={following}
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
                                    disabled={following}
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
                                    disabled={following || state.sides.single.running}
                                >
                                    ↺ {t('timer.op.reset')}
                                </Button>
                            </React.Fragment>
                        )}
                    </Toolbar>
                </AppBar>
            ) : null}

            {sessionNotice ? (
                <Box
                    role="status"
                    sx={{
                        position: 'fixed',
                        bottom: isRemote ? 24 : 96,
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
