import React, {useState, useEffect, Fragment, useCallback, useRef} from 'react';
import TimerSessionService from './services/TimerSessionService';
import MatchLogService from './services/MatchLogService';
import SoundSettingsPanel from './components/SoundSettingsPanel';
import { playAlert, warmupSounds } from './services/soundPrefs';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import debateStagesData from './resources/debateTimeSettings.json';
import timerSettingsData from './resources/debateTimerSettings.json';
import {TimerSetting} from './schema/TimerSetting';
import ConfigurationService from './services/ConfigurationService';
import {
    DEFAULT_CONFIGURATION_NAME,
    getStoredConfigurationName,
    setStoredConfigurationName,
} from './config/configConstants';
import LanguageSwitcher from './components/LanguageSwitcher';
import { InstallButton } from './components/PwaBits';
import { stageDisplayName } from './utils/stageDisplayName';
import { useColorMode } from './context/ColorModeContext';
import { useAuth } from './context/AuthContext';
import StatusPage from './components/StatusPage';

const MODE_STRING = {
    [TimerSetting.single]: 'single',
    [TimerSetting.double]: 'double',
    [TimerSetting.free]: 'free',
};

const DebateTimer = ({ shareToken = null }) => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { darkMode, toggleDarkMode } = useColorMode();
    const { user, logout } = useAuth();
    const isDisplay = Boolean(shareToken);
    const [displayState, setDisplayState] = useState(shareToken ? 'loading' : 'ok');
    const [debateStages, setDebateStages] = useState({});
    const [debateSingleDoubleTimerSettings, setDebateSingleDoubleTimerSettings] = useState({});
    const [stageLabels, setStageLabels] = useState({});    // { [customId]: { 'zh-Hans', 'en', 'fr-CA' } }
    const [stageOrder, setStageOrder] = useState([]);
    const selectedConfigNameRef = useRef(DEFAULT_CONFIGURATION_NAME);
    const [timeLeft, setTimeLeft] = useState(0);
    const [timeLeftAff, setTimeLeftAff] = useState(0);
    const [timeLeftNeg, setTimeLeftNeg] = useState(0);
    const [running, setRunning] = useState(false);
    const [runningAff, setRunningAff] = useState(false);
    const [runningNeg, setRunningNeg] = useState(false);
    const [selectedStage, setSelectedStage] = useState('');
    const [isTimeUp, setIsTimeUp] = useState(false);
    const [isAffTimeUp, setIsAffTimeUp] = useState(false);
    const [isNegTimeUp, setIsNegTimeUp] = useState(false);

    // --- Stage enhancements (bundle A): grace / auto advance / team names ---
    const [graceLeft, setGraceLeft] = useState(null);      // single-mode grace seconds (null = not in grace)
    const [graceLeftAff, setGraceLeftAff] = useState(null);
    const [graceLeftNeg, setGraceLeftNeg] = useState(null);
    const [advanceCountdown, setAdvanceCountdown] = useState(null); // auto-advance seconds left
    const [stageGrace, setStageGrace] = useState({});
    const [stageAutoAdvance, setStageAutoAdvance] = useState({});
    const [teamNames, setTeamNames] = useState({});
    const [soundPanelOpen, setSoundPanelOpen] = useState(false);

    // --- Control session (operator side) / follow mode (display side) ---
    const [shareInfo, setShareInfo] = useState(null);       // { shareEnabled, shareToken } of current config
    const shareInfoRef = useRef(null);
    const [sessionState, setSessionState] = useState('idle'); // idle | starting | active | weak
    const [sessionNotice, setSessionNotice] = useState(null);
    const sessionRef = useRef(null);                        // { shareToken, displayUrl, failures }
    const seqRef = useRef(0);
    const [following, setFollowing] = useState(false);      // display is driven by a live session
    const [displayBanner, setDisplayBanner] = useState(null); // following | weak | ended
    const bannerTimerRef = useRef(null);
    const lastStateAtRef = useRef(0);
    const followingRef = useRef(false);
    const autoSwitchRef = useRef(true);                     // free-debate auto switch armed
    const latestRef = useRef({});

    // --- Match record capture (S-03): buffer of stage actuals, posted once ---
    const matchCaptureRef = useRef(null);
    const matchAutoSavedRef = useRef(false);
    const [captureCount, setCaptureCount] = useState(0);

    // Mirror the latest timer state for event handlers and intervals that
    // must not re-register on every tick. Defined before the effects below so
    // they observe fresh values in the same commit.
    useEffect(() => {
        followingRef.current = following;
        latestRef.current = {
            selectedStage,
            timeLeft,
            timeLeftAff,
            timeLeftNeg,
            running,
            runningAff,
            runningNeg,
            debateSingleDoubleTimerSettings,
            advanceCountdown,
            isTimeUp,
            isAffTimeUp,
            isNegTimeUp,
            graceLeft,
            graceLeftAff,
            graceLeftNeg,
            teamNames,
        };
    });

    // ------------------------------------------------------------------
    // Match record capture (S-03): stage actuals accumulate locally and are
    // POSTed once per save (manual button or session end).
    // ------------------------------------------------------------------
    const computeActuals = useCallback((entry, s) => {
        const single = entry.mode === 'single';
        const usedFor = (remaining, graceLeftValue, locked) => {
            const graceLeftNow = graceLeftValue != null
                ? graceLeftValue
                : (locked ? 0 : entry.graceSeconds);
            return Math.max(0, entry.plannedSeconds - remaining)
                + (entry.graceSeconds - graceLeftNow);
        };
        return {
            actualAffSeconds: single
                ? usedFor(s.timeLeft, s.graceLeft, s.isTimeUp)
                : usedFor(s.timeLeftAff, s.graceLeftAff, s.isAffTimeUp),
            actualNegSeconds: single
                ? 0
                : usedFor(s.timeLeftNeg, s.graceLeftNeg, s.isNegTimeUp),
        };
    }, []);

    const closeCurrentEntry = useCallback((entry, closedAt) => {
        if (!entry || entry.exitedAt != null) {
            return entry;
        }
        return { ...entry, ...computeActuals(entry, latestRef.current), exitedAt: closedAt };
    }, [computeActuals]);

    const beginStageCapture = useCallback((stage, modeValue, plannedSeconds, graceSeconds, label) => {
        const now = Date.now();
        const previous = matchCaptureRef.current;
        const entries = [...(previous?.entries ?? [])];
        if (entries.length > 0) {
            entries[entries.length - 1] = closeCurrentEntry(entries[entries.length - 1], now);
        }
        entries.push({
            stageId: stage,
            label,
            mode: MODE_STRING[modeValue] ?? 'single',
            plannedSeconds,
            graceSeconds,
            actualAffSeconds: 0,
            actualNegSeconds: 0,
            overrunAff: 0,
            overrunNeg: 0,
            enteredAt: now,
            exitedAt: null,
        });
        matchCaptureRef.current = { startedAt: previous?.startedAt ?? now, entries };
        matchAutoSavedRef.current = false;
        setCaptureCount(entries.length);
    }, [closeCurrentEntry]);

    const bumpOverrun = useCallback((side) => {
        const capture = matchCaptureRef.current;
        if (!capture || capture.entries.length === 0) {
            return;
        }
        const entry = capture.entries[capture.entries.length - 1];
        if (entry.stageId !== latestRef.current.selectedStage) {
            return;
        }
        entry[`overrun${side}`] = (entry[`overrun${side}`] || 0) + 1;
    }, []);

    const buildMatchPayload = useCallback(() => {
        const capture = matchCaptureRef.current;
        if (!capture || capture.entries.length === 0) {
            return null;
        }
        const now = Date.now();
        const stages = capture.entries.map((entry) => closeCurrentEntry(entry, now));
        const names = latestRef.current.teamNames || {};
        return {
            configName: selectedConfigNameRef.current,
            ...(names.aff || names.neg ? { teamNames: { ...names } } : {}),
            startedAt: capture.startedAt,
            endedAt: now,
            stages,
        };
    }, [closeCurrentEntry]);

    const saveMatchRecord = useCallback(async (auto = false) => {
        if (auto && matchAutoSavedRef.current) {
            return;
        }
        const payload = buildMatchPayload();
        if (!payload) {
            return;
        }
        const result = await MatchLogService.saveRecord(payload);
        if (result.success) {
            if (auto) {
                matchAutoSavedRef.current = true;
            } else {
                setSessionNotice(t('records.saved'));
            }
        } else if (!auto) {
            setSessionNotice(t('records.saveFailed'));
        }
    }, [buildMatchPayload, t]);

    // 获取按顺序排列的计时器项目
    const getOrderedStages = () => {
        // 如果有自定义顺序，使用自定义顺序
        if (stageOrder.length > 0) {
            const orderedStages = [];
            // 按顺序添加存在的项目
            stageOrder.forEach(stage => {
                if (debateStages.hasOwnProperty(stage)) {
                    orderedStages.push(stage);
                }
            });
            // 添加新增的项目（不在顺序列表中的）
            Object.keys(debateStages).forEach(stage => {
                if (!stageOrder.includes(stage)) {
                    orderedStages.push(stage);
                }
            });
            return orderedStages;
        }
        // 如果没有自定义顺序，直接返回对象的键
        return Object.keys(debateStages);
    };

    useEffect(() => {
        document.body.classList.add('timer-body');
        return () => {
            document.body.classList.remove('timer-body');
        };
    }, []);


    const formatTimerSettings = useCallback((timerSettings) => {
        const result = {};
        for (const key in timerSettings) {
            result[key] = TimerSetting[timerSettings[key]];
        }
        return result;
    }, []);

    const resetTimerRuntime = useCallback(() => {
        setRunning(false);
        setRunningAff(false);
        setRunningNeg(false);
        setIsTimeUp(false);
        setIsAffTimeUp(false);
        setIsNegTimeUp(false);
        setGraceLeft(null);
        setGraceLeftAff(null);
        setGraceLeftNeg(null);
        setAdvanceCountdown(null);
    }, []);

    const applyLoadedData = useCallback((configName, data, persistName = true) => {
        const newDebateStages = data.debateStages;
        const newTimerSettings = formatTimerSettings(data.timerSettings);

        resetTimerRuntime();
        setDebateStages(newDebateStages);
        setDebateSingleDoubleTimerSettings(newTimerSettings);
        setStageLabels(data.stageLabels || {});
        setShareInfo({
            shareEnabled: Boolean(data.shareEnabled),
            shareToken: data.shareToken || null,
        });
        setStageGrace(data.stageGrace || {});
        setStageAutoAdvance(data.stageAutoAdvance || {});
        setTeamNames(data.teamNames || {});
        shareInfoRef.current = {
            shareEnabled: Boolean(data.shareEnabled),
            shareToken: data.shareToken || null,
        };
        selectedConfigNameRef.current = configName;
        if (persistName) {
            setStoredConfigurationName(configName);
        }

        if (data.stageOrder) {
            setStageOrder(data.stageOrder);
            if (data.stageOrder.length > 0) {
                const firstStage = data.stageOrder[0];
                if (newDebateStages[firstStage]) {
                    setSelectedStage(firstStage);
                    setTimeLeft(newDebateStages[firstStage]);
                    setTimeLeftAff(newDebateStages[firstStage]);
                    setTimeLeftNeg(newDebateStages[firstStage]);
                    matchCaptureRef.current = null;
                    beginStageCapture(
                        firstStage,
                        newTimerSettings[firstStage],
                        Number(newDebateStages[firstStage]),
                        Number(data.stageGrace?.[firstStage] ?? 0),
                        stageDisplayName(t, firstStage, data.stageLabels || {}, i18n.language),
                    );
                }
            }
        } else {
            const keys = Object.keys(newDebateStages);
            setStageOrder(keys);
            if (keys.length > 0) {
                setSelectedStage(keys[0]);
                setTimeLeft(newDebateStages[keys[0]]);
                setTimeLeftAff(newDebateStages[keys[0]]);
                setTimeLeftNeg(newDebateStages[keys[0]]);
                matchCaptureRef.current = null;
                beginStageCapture(
                    keys[0],
                    newTimerSettings[keys[0]],
                    Number(newDebateStages[keys[0]]),
                    Number(data.stageGrace?.[keys[0]] ?? 0),
                    stageDisplayName(t, keys[0], data.stageLabels || {}, i18n.language),
                );
            }
        }
    }, [formatTimerSettings, resetTimerRuntime, beginStageCapture, t, i18n]);

    const loadConfiguration = useCallback(async (configName) => {
        try {
            const result = await ConfigurationService.loadConfiguration(configName);
            if (result.success) {
                applyLoadedData(configName, result.data, true);
                return true;
            }
            console.error('Failed to load configuration:', result.message);
            return false;
        } catch (error) {
            console.error('Error loading configuration:', error);
            return false;
        }
    }, [applyLoadedData]);

    // ------------------------------------------------------------------
    // Timer session: snapshot building (controller), snapshot adoption
    // (display), and reporting with a 2s heartbeat.
    // ------------------------------------------------------------------

    const buildSnapshot = useCallback(() => {
        const s = latestRef.current;
        const modeValue = s.debateSingleDoubleTimerSettings[s.selectedStage];
        const stageMode = modeValue === TimerSetting.single
            ? 'single'
            : modeValue === TimerSetting.free ? 'free' : 'double';
        const single = stageMode === 'single';
        const phaseOf = (graceLeftValue, isTimeUpValue) => (
            graceLeftValue != null ? 'grace' : isTimeUpValue ? 'locked' : 'running'
        );
        const phaseAff = single
            ? phaseOf(s.graceLeft, s.isTimeUp)
            : phaseOf(s.graceLeftAff, s.isAffTimeUp);
        const phaseNeg = single
            ? phaseAff
            : phaseOf(s.graceLeftNeg, s.isNegTimeUp);
        const graceAffMs = (single ? s.graceLeft : s.graceLeftAff ?? 0) * 1000 || 0;
        const graceNegMs = (single ? graceAffMs : s.graceLeftNeg ?? 0) * 1000 || 0;
        return {
            seq: (seqRef.current += 1),
            stageId: s.selectedStage,
            stageMode,
            remainingAffMs: (single ? s.timeLeft : s.timeLeftAff) * 1000,
            remainingNegMs: (single ? s.timeLeft : s.timeLeftNeg) * 1000,
            runningAff: single ? s.running : s.runningAff,
            runningNeg: single ? false : s.runningNeg,
            activeSide: stageMode === 'free'
                ? (s.runningAff ? 'aff' : s.runningNeg ? 'neg' : 'none')
                : 'none',
            phaseAff,
            phaseNeg,
            graceAffMs: phaseAff === 'grace' ? graceAffMs : 0,
            graceNegMs: phaseNeg === 'grace' ? graceNegMs : 0,
        };
    }, []);

    const adoptSnapshot = useCallback((snapshot) => {
        if (!snapshot || !snapshot.stageId) {
            return;
        }
        seqRef.current = Math.max(seqRef.current, Number(snapshot.seq) || 0);
        const secondsAff = Math.max(0, Math.floor((snapshot.remainingAffMs || 0) / 1000));
        const secondsNeg = Math.max(0, Math.floor((snapshot.remainingNegMs || 0) / 1000));
        const single = snapshot.stageMode === 'single';
        // Phase fallback for pre-v2 snapshots: derive locked from remaining=0.
        const affPhase = snapshot.phaseAff || (secondsAff <= 0 ? 'locked' : 'running');
        const negPhase = snapshot.phaseNeg || (single ? affPhase : (secondsNeg <= 0 ? 'locked' : 'running'));
        const graceSecAff = Math.max(0, Math.floor((snapshot.graceAffMs || 0) / 1000));
        const graceSecNeg = Math.max(0, Math.floor((snapshot.graceNegMs || 0) / 1000));
        setSelectedStage(snapshot.stageId);
        setTimeLeft(secondsAff);
        setTimeLeftAff(secondsAff);
        setTimeLeftNeg(single ? secondsAff : secondsNeg);
        setRunning(single ? Boolean(snapshot.runningAff) : false);
        setRunningAff(single ? false : Boolean(snapshot.runningAff));
        setRunningNeg(single ? false : Boolean(snapshot.runningNeg));
        setIsTimeUp(single && affPhase === 'locked');
        setIsAffTimeUp(affPhase === 'locked');
        setIsNegTimeUp(negPhase === 'locked');
        setGraceLeft(single && affPhase === 'grace' ? graceSecAff : null);
        setGraceLeftAff(!single && affPhase === 'grace' ? graceSecAff : null);
        setGraceLeftNeg(!single && negPhase === 'grace' ? graceSecNeg : null);
    }, []);

    const reportSnapshot = useCallback(async () => {
        const session = sessionRef.current;
        if (!session) {
            return;
        }
        const result = await TimerSessionService.reportSnapshot(
            selectedConfigNameRef.current,
            buildSnapshot(),
        );
        if (!sessionRef.current) {
            return; // session was stopped while the request was in flight
        }
        if (result.success) {
            session.failures = 0;
            setSessionState('active');
            return;
        }
        session.failures = (session.failures || 0) + 1;
        if (session.failures >= 2) {
            setSessionState('weak');
        }
        if ([400, 403, 404].includes(result.status)) {
            // Session is gone (expired, superseded, or access denied).
            sessionRef.current = null;
            setSessionState('idle');
            setSessionNotice(t('timer.session.ended'));
            saveMatchRecord(true);
        }
    }, [buildSnapshot, t, saveMatchRecord]);

    const handleStartSession = useCallback(async () => {
        if (sessionRef.current || sessionState === 'starting') {
            return;
        }
        if (!user) {
            setSessionNotice(t('timer.session.enableShareFirst'));
            return;
        }
        if (!shareInfo?.shareEnabled) {
            setSessionNotice(t('timer.session.enableShareFirst'));
            return;
        }
        setSessionState('starting');
        const result = await TimerSessionService.startSession(selectedConfigNameRef.current);
        if (!result.success) {
            setSessionState('idle');
            setSessionNotice(result.message);
            return;
        }
        sessionRef.current = {
            shareToken: result.data.shareToken,
            displayUrl: result.data.displayUrl,
            failures: 0,
        };
        seqRef.current = result.data.snapshot?.seq ?? 0;
        setSessionState('active');
        reportSnapshot();
    }, [user, shareInfo, sessionState, reportSnapshot, t]);

    const handleStopSession = useCallback(async () => {
        const wasActive = Boolean(sessionRef.current);
        sessionRef.current = null;
        setSessionState('idle');
        if (wasActive) {
            const result = await TimerSessionService.stopSession(selectedConfigNameRef.current);
            if (!result.success) {
                setSessionNotice(result.message);
            }
            // Auto-save the match record when the session ends (PRD FR-B2).
            saveMatchRecord(true);
        }
    }, [saveMatchRecord]);

    // After a page refresh (or template switch), silently resume a session
    // that is still alive server-side: adopt its snapshot and keep reporting.
    const restoreLiveSession = useCallback(async () => {
        const info = shareInfoRef.current;
        if (!info?.shareEnabled || !info.shareToken || sessionRef.current) {
            return;
        }
        const result = await TimerSessionService.loadDisplayState(info.shareToken);
        if (!result.success || !result.data.active) {
            return;
        }
        adoptSnapshot(result.data.snapshot);
        sessionRef.current = {
            shareToken: info.shareToken,
            displayUrl: `/display/${info.shareToken}`,
            failures: 0,
        };
        setSessionState('active');
    }, [adoptSnapshot]);

    const handleCopyDisplayUrl = useCallback(async () => {        const path = sessionRef.current?.displayUrl
            ?? (shareInfo?.shareToken ? `/display/${shareInfo.shareToken}` : null);
        if (!path) {
            return;
        }
        const url = `${window.location.origin}${path}`;
        try {
            await navigator.clipboard.writeText(url);
            setSessionNotice(t('timer.session.copied'));
        } catch {
            setSessionNotice(url);
        }
    }, [shareInfo, t]);

    // Report on every discrete state transition (start/stop/reset/stage
    // switch); per-second drift is carried by the heartbeat snapshots below.
    useEffect(() => {
        if (isDisplay || !sessionRef.current) {
            return;
        }
        reportSnapshot();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running, runningAff, runningNeg, selectedStage, isTimeUp, isAffTimeUp, isNegTimeUp]);

    // Heartbeat: keeps the session alive server-side and re-syncs times.
    useEffect(() => {
        if (isDisplay || (sessionState !== 'active' && sessionState !== 'weak')) {
            return undefined;
        }
        const id = window.setInterval(() => {
            reportSnapshot();
        }, 2000);
        return () => window.clearInterval(id);
    }, [sessionState, reportSnapshot, isDisplay]);

    // Auto-dismiss the transient snackbar / banner notices.
    useEffect(() => {
        if (!sessionNotice) {
            return undefined;
        }
        const id = window.setTimeout(() => setSessionNotice(null), 4000);
        return () => window.clearTimeout(id);
    }, [sessionNotice]);

    // Weak-signal detection on the display: no snapshot for 5s while following.
    useEffect(() => {
        if (!isDisplay || !following) {
            return undefined;
        }
        lastStateAtRef.current = Date.now();
        const id = window.setInterval(() => {
            if (Date.now() - lastStateAtRef.current > 5000) {
                setDisplayBanner((prev) => (prev === 'following' ? 'weak' : prev));
            }
        }, 1000);
        return () => window.clearInterval(id);
    }, [isDisplay, following]);

    useEffect(() => () => {
        if (bannerTimerRef.current) {
            window.clearTimeout(bannerTimerRef.current);
        }
    }, []);

    useEffect(() => {
        let unsubscribe;
        let stateUnsubscribe;

        const toNames = (list) => (list || []).map((item) => item.name);

        const initializeConfiguration = async () => {
            try {
                if (shareToken) {
                    const result = await ConfigurationService.loadDisplayConfiguration(shareToken);
                    if (!result.success) {
                        setDisplayState(result.notFound ? 'missing' : 'error');
                        return;
                    }
                    setDisplayState('ok');
                    applyLoadedData(result.data.name || DEFAULT_CONFIGURATION_NAME, result.data, false);
                    unsubscribe = ConfigurationService.onDisplayChange(shareToken, async () => {
                        const next = await ConfigurationService.loadDisplayConfiguration(shareToken);
                        if (next.success) {
                            setDisplayState('ok');
                            applyLoadedData(next.data.name || DEFAULT_CONFIGURATION_NAME, next.data, false);
                        } else {
                            setDisplayState(next.notFound ? 'missing' : 'error');
                        }
                    });

                    // Live follow: adopt the running session (if any) and
                    // keep re-adopting controller snapshots.
                    const stateResult = await TimerSessionService.loadDisplayState(shareToken);
                    if (stateResult.success && stateResult.data.active) {
                        lastStateAtRef.current = Date.now();
                        adoptSnapshot(stateResult.data.snapshot);
                        setFollowing(true);
                        setDisplayBanner('following');
                    }
                    stateUnsubscribe = TimerSessionService.onDisplayState(shareToken, {
                        onState: (snapshot) => {
                            lastStateAtRef.current = Date.now();
                            setFollowing(true);
                            setDisplayBanner('following');
                            adoptSnapshot(snapshot);
                        },
                        onSession: (event) => {
                            if (event.type === 'started') {
                                setFollowing(true);
                                setDisplayBanner('following');
                                return;
                            }
                            if (event.type === 'ended' || event.type === 'expired') {
                                setFollowing(false);
                                setRunning(false);
                                setRunningAff(false);
                                setRunningNeg(false);
                                setDisplayBanner('ended');
                                if (bannerTimerRef.current) {
                                    window.clearTimeout(bannerTimerRef.current);
                                }
                                bannerTimerRef.current = window.setTimeout(() => {
                                    setDisplayBanner(null);
                                }, 8000);
                            }
                        },
                        onOpen: async () => {
                            const sync = await TimerSessionService.loadDisplayState(shareToken);
                            if (!sync.success) {
                                return;
                            }
                            if (sync.data.active) {
                                lastStateAtRef.current = Date.now();
                                setFollowing(true);
                                adoptSnapshot(sync.data.snapshot);
                            } else if (followingRef.current) {
                                setFollowing(false);
                                setRunning(false);
                                setRunningAff(false);
                                setRunningNeg(false);
                                setDisplayBanner('ended');
                            }
                        },
                    });
                    return;
                }

                await ConfigurationService.initializeDefaultConfigurations();

                const listResult = await ConfigurationService.getConfigurations();
                const names = listResult.success
                    ? toNames(listResult.data)
                    : [DEFAULT_CONFIGURATION_NAME];

                const preferred = getStoredConfigurationName();
                const target = names.includes(preferred) ? preferred : DEFAULT_CONFIGURATION_NAME;
                await loadConfiguration(target);
                restoreLiveSession();

                unsubscribe = ConfigurationService.onConfigurationsChange(async (list) => {
                    const nextNames = toNames(list);
                    const current = selectedConfigNameRef.current;
                    const stillExists = nextNames.includes(current);
                    const nextTarget = stillExists
                        ? current
                        : (nextNames.includes(DEFAULT_CONFIGURATION_NAME)
                            ? DEFAULT_CONFIGURATION_NAME
                            : nextNames[0]);
                    if (!nextTarget) return;
                    await loadConfiguration(nextTarget);
                    restoreLiveSession();
                });
            } catch (error) {
                console.error('Error initializing configuration:', error);
                if (shareToken) {
                    setDisplayState('error');
                    return;
                }
                setDebateStages(debateStagesData);
                setDebateSingleDoubleTimerSettings(formatTimerSettings(timerSettingsData));
                setStageLabels({});
                selectedConfigNameRef.current = DEFAULT_CONFIGURATION_NAME;
                const localStageKeys = Object.keys(debateStagesData);
                setStageOrder(localStageKeys);
                if (localStageKeys.length > 0) {
                    setSelectedStage(localStageKeys[0]);
                    setTimeLeft(debateStagesData[localStageKeys[0]]);
                    setTimeLeftAff(debateStagesData[localStageKeys[0]]);
                    setTimeLeftNeg(debateStagesData[localStageKeys[0]]);
                }
            }
        };

        initializeConfiguration();

        return () => {
            if (unsubscribe) unsubscribe();
            if (stateUnsubscribe) stateUnsubscribe();
        };
    }, [loadConfiguration, formatTimerSettings, shareToken, applyLoadedData, adoptSnapshot, restoreLiveSession]);

    useEffect(() => {
        warmupSounds();
    }, []);

    const playSound = useCallback((node) => {
        playAlert(node);
    }, []);

    useEffect(() => {
        let interval;
        if (!runningAff && !runningNeg && running && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prevTime) => prevTime - 1);
            }, 1000);
        }
        if (running && timeLeft === 30) {
            playSound('warn30');
        }
        if (running && timeLeft === 0) {
            setRunning(false);
            const grace = Number(stageGrace[selectedStage] ?? 0);
            if (grace > 0) {
                // Time is up: single short bell, then a grace countdown to wrap up.
                setGraceLeft(grace);
                playSound('timeUp');
            } else {
                setIsTimeUp(true);
                playSound('mustStop');
                bumpOverrun('Aff');
            }
        }
        return () => clearInterval(interval);
    }, [running, timeLeft, runningAff, runningNeg, playSound, stageGrace, selectedStage, bumpOverrun]);

    useEffect(() => {
        let interval;
        if (runningAff && timeLeftAff > 0) {
            interval = setInterval(() => {
                setTimeLeftAff((prevTime) => prevTime - 1);
            }, 1000);
        }
        if (runningAff && timeLeftAff === 30) {
            playSound('warn30');
        }
        if (runningAff && timeLeftAff === 0) {
            setRunningAff(false);
            // Free debate: running out yields the floor to the other side.
            const s = latestRef.current;
            if (s.debateSingleDoubleTimerSettings[s.selectedStage] === TimerSetting.free
                && autoSwitchRef.current && s.timeLeftNeg > 0) {
                setRunningNeg(true);
            }
            const grace = Number(stageGrace[selectedStage] ?? 0);
            if (grace > 0) {
                setGraceLeftAff(grace);
                playSound('timeUp');
            } else {
                setIsAffTimeUp(true);
                playSound('mustStop');
                bumpOverrun('Aff');
            }
        }
        return () => clearInterval(interval);
    }, [runningAff, timeLeftAff, playSound, stageGrace, selectedStage, bumpOverrun]);

    useEffect(() => {
        let interval;
        if (runningNeg && timeLeftNeg > 0) {
            interval = setInterval(() => {
                setTimeLeftNeg((prevTime) => prevTime - 1);
            }, 1000);
        }
        if (runningNeg && timeLeftNeg === 30) {
            playSound('warn30');
        }
        if (runningNeg && timeLeftNeg === 0) {
            setRunningNeg(false);
            // Free debate: running out yields the floor to the other side.
            const s = latestRef.current;
            if (s.debateSingleDoubleTimerSettings[s.selectedStage] === TimerSetting.free
                && autoSwitchRef.current && s.timeLeftAff > 0) {
                setRunningAff(true);
            }
            const grace = Number(stageGrace[selectedStage] ?? 0);
            if (grace > 0) {
                setGraceLeftNeg(grace);
                playSound('timeUp');
            } else {
                setIsNegTimeUp(true);
                playSound('mustStop');
                bumpOverrun('Neg');
            }
        }
        return () => clearInterval(interval);
    }, [runningNeg, timeLeftNeg, playSound, stageGrace, selectedStage, bumpOverrun]);

    // Grace countdowns: tick while in grace; at zero, must-stop bell + lock.
    useEffect(() => {
        if (graceLeft == null || graceLeft <= 0) {
            return undefined;
        }
        const id = window.setInterval(() => {
            setGraceLeft((prev) => (prev == null ? null : prev - 1));
        }, 1000);
        return () => window.clearInterval(id);
    }, [graceLeft]);

    useEffect(() => {
        if (graceLeft == null || graceLeft > 0) {
            return;
        }
        setIsTimeUp(true);
        setGraceLeft(null);
        playSound('mustStop');
        bumpOverrun('Aff');
    }, [graceLeft, playSound, bumpOverrun]);

    useEffect(() => {
        if (graceLeftAff == null || graceLeftAff <= 0) {
            return undefined;
        }
        const id = window.setInterval(() => {
            setGraceLeftAff((prev) => (prev == null ? null : prev - 1));
        }, 1000);
        return () => window.clearInterval(id);
    }, [graceLeftAff]);

    useEffect(() => {
        if (graceLeftAff == null || graceLeftAff > 0) {
            return;
        }
        setIsAffTimeUp(true);
        setGraceLeftAff(null);
        playSound('mustStop');
        bumpOverrun('Aff');
    }, [graceLeftAff, playSound, bumpOverrun]);

    useEffect(() => {
        if (graceLeftNeg == null || graceLeftNeg <= 0) {
            return undefined;
        }
        const id = window.setInterval(() => {
            setGraceLeftNeg((prev) => (prev == null ? null : prev - 1));
        }, 1000);
        return () => window.clearInterval(id);
    }, [graceLeftNeg]);

    useEffect(() => {
        if (graceLeftNeg == null || graceLeftNeg > 0) {
            return;
        }
        setIsNegTimeUp(true);
        setGraceLeftNeg(null);
        playSound('mustStop');
        bumpOverrun('Neg');
    }, [graceLeftNeg, playSound, bumpOverrun]);

    const clearClockBlink = useCallback(() => {
        ['clock', 'clockAff', 'clockNeg'].forEach((id) => {
            document.getElementById(id)?.classList.remove('time-30s-blinking');
        });
    }, []);

    const cancelAdvance = useCallback(() => {
        setAdvanceCountdown(null);
    }, []);

    const applyStage = useCallback((stage) => {
        if (!stage || !debateStages.hasOwnProperty(stage)) {
            return;
        }
        autoSwitchRef.current = false;
        setAdvanceCountdown(null);
        setGraceLeft(null);
        setGraceLeftAff(null);
        setGraceLeftNeg(null);
        beginStageCapture(
            stage,
            debateSingleDoubleTimerSettings[stage],
            Number(debateStages[stage] ?? 0),
            Number(stageGrace[stage] ?? 0),
            stageDisplayName(t, stage, stageLabels, i18n.language),
        );
        setSelectedStage(stage);
        const time = debateStages[stage];
        setTimeLeft(time);
        setTimeLeftAff(time);
        setTimeLeftNeg(time);
        setIsTimeUp(false);
        setIsAffTimeUp(false);
        setIsNegTimeUp(false);
        setRunning(false);
        setRunningAff(false);
        setRunningNeg(false);
        clearClockBlink();
    }, [debateStages, clearClockBlink, beginStageCapture, debateSingleDoubleTimerSettings, stageGrace, stageLabels, t, i18n]);

    const handleStageSelect = (event) => {
        applyStage(event.target.value);
    };

    const resetSingleTimer = () => {
        cancelAdvance();
        setRunning(false);
        setIsTimeUp(false);
        setGraceLeft(null);
        setTimeLeft(debateStages[selectedStage]);
        clearClockBlink();
    };

    const resetAffTimer = () => {
        autoSwitchRef.current = false;
        cancelAdvance();
        setRunningAff(false);
        setIsAffTimeUp(false);
        setGraceLeftAff(null);
        setTimeLeftAff(debateStages[selectedStage]);
        document.getElementById('clockAff')?.classList.remove('time-30s-blinking');
    };

    const resetNegTimer = () => {
        autoSwitchRef.current = false;
        cancelAdvance();
        setRunningNeg(false);
        setIsNegTimeUp(false);
        setGraceLeftNeg(null);
        setTimeLeftNeg(debateStages[selectedStage]);
        document.getElementById('clockNeg')?.classList.remove('time-30s-blinking');
    };

    // Free-debate toggles: explicitly starting a side arms the auto switch;
    // explicitly stopping a side hands the floor to the other side.
    const startAff = () => {
        cancelAdvance();
        autoSwitchRef.current = true;
        setRunningAff(true);
    };
    const stopAff = () => {
        cancelAdvance();
        setRunningAff(false);
        const s = latestRef.current;
        if (s.debateSingleDoubleTimerSettings[s.selectedStage] === TimerSetting.free
            && autoSwitchRef.current && s.timeLeftNeg > 0 && !s.runningNeg) {
            setRunningNeg(true);
        }
    };
    const startNeg = () => {
        cancelAdvance();
        autoSwitchRef.current = true;
        setRunningNeg(true);
    };
    const stopNeg = () => {
        cancelAdvance();
        setRunningNeg(false);
        const s = latestRef.current;
        if (s.debateSingleDoubleTimerSettings[s.selectedStage] === TimerSetting.free
            && autoSwitchRef.current && s.timeLeftAff > 0 && !s.runningAff) {
            setRunningAff(true);
        }
    };

    const goToAdjacentStage = useCallback((direction) => {
        const stages = getOrderedStages();
        if (stages.length === 0) {
            return;
        }
        const currentIndex = stages.indexOf(selectedStage);
        if (currentIndex === -1) {
            return;
        }
        const nextIndex = currentIndex + direction;
        if (nextIndex < 0 || nextIndex >= stages.length) {
            return;
        }
        applyStage(stages[nextIndex]);
    }, [selectedStage, applyStage, stageOrder, debateStages]);

    // Auto advance (C-01-07): when the stage is fully over (including grace)
    // and the flag is on, count down 3s then move to the next stage. Any manual
    // input cancels (see keyboard handler / cancelAdvance); last stage never advances.
    useEffect(() => {
        const stages = getOrderedStages();
        const isLast = stages.indexOf(selectedStage) === stages.length - 1;
        const modeValue = debateSingleDoubleTimerSettings[selectedStage];
        const dual = modeValue === TimerSetting.double || modeValue === TimerSetting.free;
        const inGrace = dual
            ? (graceLeftAff != null || graceLeftNeg != null)
            : graceLeft != null;
        const fullyEnded = dual ? (isAffTimeUp && isNegTimeUp) : isTimeUp;
        if (following || isLast || inGrace || !fullyEnded || !stageAutoAdvance[selectedStage]) {
            if (advanceCountdown != null) {
                setAdvanceCountdown(null);
            }
            return;
        }
        setAdvanceCountdown(3);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [following, selectedStage, isTimeUp, isAffTimeUp, isNegTimeUp,
        graceLeft, graceLeftAff, graceLeftNeg, stageAutoAdvance,
        debateSingleDoubleTimerSettings, stageOrder, debateStages]);

    useEffect(() => {
        if (advanceCountdown == null) {
            return undefined;
        }
        if (advanceCountdown === 0) {
            goToAdjacentStage(1);
            return undefined;
        }
        const id = window.setTimeout(() => {
            setAdvanceCountdown((prev) => (prev == null ? null : prev - 1));
        }, 1000);
        return () => window.clearTimeout(id);
    }, [advanceCountdown, goToAdjacentStage]);

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainderSeconds = seconds % 60;
        return `${minutes < 10 ? '0' : ''}${minutes}:${remainderSeconds < 10 ? '0' : ''}${remainderSeconds}`;
    };

    useEffect(() => {
        let interval;
        if (debateSingleDoubleTimerSettings[selectedStage]===TimerSetting.single) {
            if (running && timeLeft > 30) {
                document.getElementById('clock').classList.remove('time-30s-blinking');
            }
            if (running && timeLeft <= 30) {
                interval = setInterval(() => {
                    if (timeLeft === 30) {
                        document.getElementById('clock').classList.add('time-30s-blinking');
                    }
                    if (timeLeft < 27) {
                        document.getElementById('clock').classList.remove('time-30s-blinking');
                    }
                }, 100);
            }
        }
        return () => clearInterval(interval);
    }, [running, timeLeft, selectedStage, debateSingleDoubleTimerSettings]);

    useEffect(() => {
        let interval;
        if (runningAff && timeLeftAff > 30) {
            document.getElementById('clockAff').classList.remove('time-30s-blinking');
        }
        if (runningAff && timeLeftAff <= 30) {
            interval = setInterval(() => {
                if (timeLeftAff === 30) {
                    document.getElementById('clockAff').classList.add('time-30s-blinking');
                }
                if (timeLeftAff < 27) {
                    document.getElementById('clockAff').classList.remove('time-30s-blinking');
                }
            }, 100);
        }
        return () => clearInterval(interval);
    }, [runningAff, timeLeftAff]);

    useEffect(() => {
        let interval;
        if (runningNeg && timeLeftNeg > 30) {
            document.getElementById('clockNeg').classList.remove('time-30s-blinking');
        }
        if (runningNeg && timeLeftNeg <= 30) {
            interval = setInterval(() => {
                if (timeLeftNeg === 30) {
                    document.getElementById('clockNeg').classList.add('time-30s-blinking');
                }
                if (timeLeftNeg < 27) {
                    document.getElementById('clockNeg').classList.remove('time-30s-blinking');
                }
            }, 100);
        }
        return () => clearInterval(interval);
    }, [runningNeg, timeLeftNeg]);

    useEffect(() => {
        const isTypingTarget = (target) => {
            if (!target || !(target instanceof Element)) {
                return false;
            }
            const tag = target.tagName;
            return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
        };

        const modeValue = debateSingleDoubleTimerSettings[selectedStage];
        const isDouble = modeValue === TimerSetting.double || modeValue === TimerSetting.free;

        const handleKeyPress = (event) => {
            if (followingRef.current) {
                return; // read-only while a control session drives this screen
            }
            if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) {
                return;
            }

            // Any manual input cancels a pending auto advance.
            if (latestRef.current.advanceCountdown != null) {
                setAdvanceCountdown(null);
            }

            const key = event.key;
            const withShift = event.shiftKey;

            if (!withShift && key === 'ArrowLeft') {
                event.preventDefault();
                goToAdjacentStage(-1);
                return;
            }
            if (!withShift && key === 'ArrowRight') {
                event.preventDefault();
                goToAdjacentStage(1);
                return;
            }

            if (isDouble) {
                if (!withShift && (key === 'a' || key === 'A')) {
                    event.preventDefault();
                    if (runningAff) {
                        stopAff();
                    } else {
                        startAff();
                    }
                } else if (withShift && (key === 'q' || key === 'Q')) {
                    event.preventDefault();
                    if (!runningAff) {
                        resetAffTimer();
                    }
                } else if (!withShift && (key === 'l' || key === 'L')) {
                    event.preventDefault();
                    if (runningNeg) {
                        stopNeg();
                    } else {
                        startNeg();
                    }
                } else if (withShift && (key === 'o' || key === 'O')) {
                    event.preventDefault();
                    if (!runningNeg) {
                        resetNegTimer();
                    }
                }
                return;
            }

            if (!withShift && (key === ' ' || key === 'Spacebar')) {
                event.preventDefault();
                setRunning((prev) => !prev);
            } else if (withShift && (key === 'r' || key === 'R')) {
                event.preventDefault();
                if (running) {
                    return;
                }
                if (selectedStage === 'sound_check') {
                    setTimeLeft(0);
                    setIsTimeUp(false);
                    clearClockBlink();
                } else {
                    resetSingleTimer();
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    }, [
        selectedStage,
        running,
        runningAff,
        runningNeg,
        debateSingleDoubleTimerSettings,
        debateStages,
        goToAdjacentStage,
        clearClockBlink,
    ]);

    if (isDisplay && displayState === 'loading') {
        return null;
    }

    if (isDisplay && (displayState === 'missing' || displayState === 'error')) {
        return <StatusPage variant="display" />;
    }

    const currentMode = debateSingleDoubleTimerSettings[selectedStage];
    const isFreeMode = currentMode === TimerSetting.free;
    const isDualMode = currentMode === TimerSetting.double || isFreeMode;
    const isFreeLocked = isFreeMode && isAffTimeUp && isNegTimeUp;
    const activeSide = runningAff ? 'aff' : runningNeg ? 'neg' : 'none';
    const affTeamLabel = teamNames.aff || t('timer.affirmative');
    const negTeamLabel = teamNames.neg || t('timer.negative');
    const singleInGrace = graceLeft != null;

    return (
        <Fragment>
            <div id="timer" className={darkMode ? 'dark-mode' : 'light-mode'}>
                {/* Navigation Bar */}
                <div className="timer-nav">
                    <div className="nav-left">
                        <h2 className="app-title">🎯 {t('timer.title')}</h2>
                    </div>
                    <div className="nav-right">
                        <div
                            className="nav-actions-group nav-actions-group--timer"
                            role="toolbar"
                            aria-label={t('timer.toolbar')}
                        >
                            <LanguageSwitcher className="lang-switcher--timer" />
                            <InstallButton />
                            {!isDisplay ? (
                                <button
                                    type="button"
                                    className="nav-btn"
                                    onClick={() => navigate('/settings')}
                                    title={t('timer.settingsAria')}
                                >
                                    ⚙️ {t('timer.settings')}
                                </button>
                            ) : null}
                            {!isDisplay ? (
                                <button
                                    type="button"
                                    className="nav-btn"
                                    onClick={() => navigate('/records')}
                                    title={t('records.title')}
                                >
                                    📊 {t('records.short')}
                                </button>
                            ) : null}
                            {!isDisplay && user?.role === 'admin' ? (
                                <button
                                    type="button"
                                    className="nav-btn"
                                    onClick={() => navigate('/admin')}
                                    title={t('admin.title')}
                                >
                                    {t('admin.short')}
                                </button>
                            ) : null}
                            <button
                                type="button"
                                className="nav-btn dark-mode-btn"
                                onClick={toggleDarkMode}
                                title={darkMode ? t('timer.darkLight') : t('timer.darkDark')}
                            >
                                {darkMode ? '☀️' : '🌙'}
                            </button>
                            {!isDisplay ? (
                                <button
                                    type="button"
                                    className="nav-btn"
                                    onClick={async () => {
                                        await logout();
                                        navigate('/login');
                                    }}
                                    title={t('auth.logout')}
                                >
                                    {t('auth.logout')}
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="nav-btn"
                                    onClick={() => setSoundPanelOpen((open) => !open)}
                                    title={t('settings.soundTitle')}
                                >
                                    🔊
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {isDisplay && soundPanelOpen ? (
                    <div className="display-sound-panel">
                        <SoundSettingsPanel />
                    </div>
                ) : null}


                {/* Session control bar (controller) / follow banner (display) */}
                {!isDisplay ? (
                    <div className="session-bar" role="toolbar" aria-label={t('timer.session.title')}>
                        <button
                            type="button"
                            className="session-btn"
                            disabled={captureCount === 0}
                            onClick={() => saveMatchRecord(false)}
                            title={t('records.saveHint')}
                        >
                            💾 {t('records.save')}
                        </button>
                        <span className={`session-chip session-chip--${sessionState}`}>
                            {sessionState === 'active' ? t('timer.session.active')
                                : sessionState === 'weak' ? t('timer.session.weak')
                                    : sessionState === 'starting' ? '…' : ''}
                        </span>
                        {(sessionState === 'active' || sessionState === 'weak') ? (
                            <Fragment>
                                <button type="button" className="session-btn" onClick={handleCopyDisplayUrl}>
                                    🔗 {t('timer.session.copyUrl')}
                                </button>
                                <button type="button" className="session-btn" onClick={handleStopSession}>
                                    ⏹ {t('timer.session.stop')}
                                </button>
                            </Fragment>
                        ) : (
                            <button
                                type="button"
                                className="session-btn"
                                disabled={sessionState === 'starting'}
                                onClick={handleStartSession}
                            >
                                📡 {t('timer.session.start')}
                            </button>
                        )}
                    </div>
                ) : null}
                {isDisplay && displayBanner ? (
                    <div className={`display-banner display-banner--${displayBanner}`} role="status">
                        {displayBanner === 'following' ? t('timer.display.following')
                            : displayBanner === 'weak' ? t('timer.display.weakSignal')
                                : t('timer.display.sessionEnded')}
                    </div>
                ) : null}
                {sessionNotice ? (
                    <div className="session-notice" role="status">{sessionNotice}</div>
                ) : null}


                <select
                    className="timer-stage-select"
                    value={selectedStage}
                    onChange={handleStageSelect}
                    disabled={following}
                    aria-label={t('timer.stage')}
                >
                    {getOrderedStages().map((stage) => (
                        <option
                            key={stage}
                            value={stage}
                            title={stageDisplayName(t, stage, stageLabels, i18n.language)}
                        >
                            {stageDisplayName(t, stage, stageLabels, i18n.language)}
                        </option>
                    ))}
                </select>
                <h2>{stageDisplayName(t, selectedStage, stageLabels, i18n.language)}</h2>
                {(!following && selectedStage === 'sound_check') ? (
                    <div>
                        <button type="button" onClick={() => {
                            setRunning(false);
                            setIsTimeUp(false);
                            setTimeLeft(30);
                            clearClockBlink();
                            document.getElementById('clock')?.classList.add('time-30s-blinking');
                            playSound('warn30');
                        }}>{t('timer.test30sSound')}</button>
                        <button type="button" onClick={() => {
                            setRunning(false);
                            setTimeLeft(0);
                            setIsTimeUp(true);
                            setGraceLeft(null);
                            clearClockBlink();
                            playSound('mustStop');
                        }}>{t('timer.testEndSound')}</button>
                    </div>
                ) : (
                    <div></div>
                )}

                {/* 自动推进倒计时横幅 */}
                {!following && advanceCountdown != null ? (
                    <div className="advance-banner" role="status">
                        {t('timer.advanceCountdown', { n: advanceCountdown })}
                    </div>
                ) : null}

                {/* 根据选定的阶段显示不同的计时器和控制按钮 */}
                {isDualMode ? (
                    <div className='debate-timers-container'>
                        <div className={`timer-box${isFreeMode && activeSide === 'aff' ? ' free-active' : ''}`}>
                            <h3><span className="side-badge">{t('timer.affBadge')}</span>{affTeamLabel}</h3>
                            <h1
                                className={[
                                    isAffTimeUp ? 'blinking' : '',
                                    graceLeftAff != null ? 'grace-blinking' : '',
                                ].filter(Boolean).join(' ')}
                                id='clockAff'
                            >
                                {formatTime(graceLeftAff != null ? graceLeftAff : timeLeftAff)}
                            </h1>
                            {graceLeftAff != null ? (
                                <p className="grace-hint">{t('timer.graceHint')}</p>
                            ) : null}
                            {following ? (
                                <p className="shortcut-hint">{t('timer.display.following')}</p>
                            ) : (
                                <Fragment>
                                    <div className='controls'>
                                        <button
                                            className={!runningAff ? 'active' : ''}
                                            onClick={startAff}
                                            disabled={runningAff}
                                            title={t('timer.shortcutAffToggle')}
                                        >
                                            ▶️
                                        </button>
                                        <button
                                            className={runningAff ? 'active' : ''}
                                            onClick={stopAff}
                                            disabled={!runningAff}
                                            title={t('timer.shortcutAffToggle')}
                                        >
                                            ⏸️
                                        </button>
                                        <button
                                            className={!runningAff ? 'active' : ''}
                                            onClick={resetAffTimer}
                                            disabled={runningAff}
                                            title={t('timer.shortcutAffReset')}
                                        >
                                            🔃
                                        </button>
                                    </div>
                                    <p className="shortcut-hint">{t('timer.hintAff')}</p>
                                </Fragment>
                            )}
                        </div>
                        <div className={`timer-box${isFreeMode && activeSide === 'neg' ? ' free-active' : ''}`}>
                            <h3><span className="side-badge">{t('timer.negBadge')}</span>{negTeamLabel}</h3>
                            <h1
                                className={[
                                    isNegTimeUp ? 'blinking' : '',
                                    graceLeftNeg != null ? 'grace-blinking' : '',
                                ].filter(Boolean).join(' ')}
                                id='clockNeg'
                            >
                                {formatTime(graceLeftNeg != null ? graceLeftNeg : timeLeftNeg)}
                            </h1>
                            {graceLeftNeg != null ? (
                                <p className="grace-hint">{t('timer.graceHint')}</p>
                            ) : null}
                            {following ? (
                                <p className="shortcut-hint">{t('timer.display.following')}</p>
                            ) : (
                                <Fragment>
                                    <div className='controls'>
                                        <button
                                            className={!runningNeg ? 'active' : ''}
                                            onClick={startNeg}
                                            disabled={runningNeg}
                                            title={t('timer.shortcutNegToggle')}
                                        >
                                            ▶️
                                        </button>
                                        <button
                                            className={runningNeg ? 'active' : ''}
                                            onClick={stopNeg}
                                            disabled={!runningNeg}
                                            title={t('timer.shortcutNegToggle')}
                                        >
                                            ⏸️
                                        </button>
                                        <button
                                            className={!runningNeg ? 'active' : ''}
                                            onClick={resetNegTimer}
                                            disabled={runningNeg}
                                            title={t('timer.shortcutNegReset')}
                                        >
                                            🔃
                                        </button>
                                    </div>
                                    <p className="shortcut-hint">{t('timer.hintNeg')}</p>
                                </Fragment>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className='timer-box'>
                        <h1
                            className={[
                                isTimeUp ? 'blinking' : 'timer',
                                singleInGrace ? 'grace-blinking' : '',
                            ].filter(Boolean).join(' ')}
                            id='clock'
                        >
                            {formatTime(singleInGrace ? graceLeft : timeLeft)}
                        </h1>
                        {singleInGrace ? (
                            <p className="grace-hint">{t('timer.graceHint')}</p>
                        ) : null}
                        {following ? (
                            <p className="shortcut-hint">{t('timer.display.following')}</p>
                        ) : (
                            <Fragment>
                                <div className='controls'>
                                    <button
                                        className={!running ? 'active' : ''}
                                        onClick={() => setRunning(true)}
                                        disabled={running}
                                        title={t('timer.shortcutSingleToggle')}
                                    >
                                        ▶️
                                    </button>
                                    <button
                                        className={running ? 'active' : ''}
                                        onClick={() => setRunning(false)}
                                        disabled={!running}
                                        title={t('timer.shortcutSingleToggle')}
                                    >
                                        ⏸️
                                    </button>
                                    <button
                                        className={!running ? 'active' : ''}
                                        onClick={resetSingleTimer}
                                        disabled={running}
                                        title={t('timer.shortcutSingleReset')}
                                    >
                                        🔃
                                    </button>
                                </div>
                                <p className="shortcut-hint">{t('timer.hintSingle')}</p>
                            </Fragment>
                        )}
                    </div>
                )}

                {isFreeLocked ? (
                    <p className="free-locked">{t('timer.free.locked')}</p>
                ) : null}
                {isFreeMode && !following ? (
                    <p className="shortcut-hint shortcut-hint--free">{t('timer.hintFree')}</p>
                ) : null}

                <p className="shortcut-hint shortcut-hint--stage">{t('timer.hintStage')}</p>

            </div>
        </Fragment>
    );
};

export default DebateTimer;
