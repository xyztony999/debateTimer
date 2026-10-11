import React, {useState, useEffect, Fragment, useCallback, useRef} from 'react';
import TimerSessionService from './services/TimerSessionService';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import end_sound from './resources/notify.wav';
import r30_sound from './resources/split.wav';
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
import { stageDisplayName } from './utils/stageDisplayName';
import { useColorMode } from './context/ColorModeContext';
import { useAuth } from './context/AuthContext';
import StatusPage from './components/StatusPage';

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
        };
    });

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
            }
        }
    }, [formatTimerSettings, resetTimerRuntime]);

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
        setSelectedStage(snapshot.stageId);
        setTimeLeft(secondsAff);
        setTimeLeftAff(secondsAff);
        setTimeLeftNeg(single ? secondsAff : secondsNeg);
        setRunning(single ? Boolean(snapshot.runningAff) : false);
        setRunningAff(single ? false : Boolean(snapshot.runningAff));
        setRunningNeg(single ? false : Boolean(snapshot.runningNeg));
        setIsTimeUp(single && secondsAff <= 0);
        setIsAffTimeUp(secondsAff <= 0);
        setIsNegTimeUp((single ? secondsAff : secondsNeg) <= 0);
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
        }
    }, [buildSnapshot, t]);

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
        }
    }, []);

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

    const endSoundRef = useRef(null);
    const warn30SoundRef = useRef(null);

    useEffect(() => {
        endSoundRef.current = new Audio(end_sound);
        warn30SoundRef.current = new Audio(r30_sound);
        endSoundRef.current.preload = 'auto';
        warn30SoundRef.current.preload = 'auto';
        // Warm decode so the first play is not delayed by large WAV load.
        endSoundRef.current.load();
        warn30SoundRef.current.load();
    }, []);

    const playSound = useCallback((mode) => {
        const audio = mode === 'end'
            ? endSoundRef.current
            : mode === '30'
                ? warn30SoundRef.current
                : null;
        if (!audio) return;
        try {
            audio.pause();
            audio.currentTime = 0;
            const playPromise = audio.play();
            if (playPromise?.catch) {
                playPromise.catch(() => {});
            }
        } catch {
            // Ignore autoplay / decode errors during local testing.
        }
    }, []);

    useEffect(() => {
        let interval;
        if (!runningAff && !runningNeg && running && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prevTime) => prevTime - 1);
            }, 1000);
        }
        if (running && timeLeft === 30) {
            playSound('30');
        }
        if (running && timeLeft === 0) {
            setRunning(false);
            setIsTimeUp(true);
            playSound('end');
            //alert('时间到！');
        }
        return () => clearInterval(interval);
    }, [running, timeLeft, runningAff, runningNeg, playSound]);

    useEffect(() => {
        let interval;
        if (runningAff && timeLeftAff > 0) {
            interval = setInterval(() => {
                setTimeLeftAff((prevTime) => prevTime - 1);
            }, 1000);
        }
        if (runningAff && timeLeftAff === 30) {
            playSound('30');
        }
        if (runningAff && timeLeftAff === 0) {
            setRunningAff(false);
            setIsAffTimeUp(true);
            playSound('end');
            // Free debate: running out yields the floor to the other side.
            const s = latestRef.current;
            if (s.debateSingleDoubleTimerSettings[s.selectedStage] === TimerSetting.free
                && autoSwitchRef.current && s.timeLeftNeg > 0) {
                setRunningNeg(true);
            }
        }
        return () => clearInterval(interval);
    }, [runningAff, timeLeftAff, playSound]);

    useEffect(() => {
        let interval;
        if (runningNeg && timeLeftNeg > 0) {
            interval = setInterval(() => {
                setTimeLeftNeg((prevTime) => prevTime - 1);
            }, 1000);
        }
        if (runningNeg && timeLeftNeg === 30) {
            playSound('30');
        }
        if (runningNeg && timeLeftNeg === 0) {
            setRunningNeg(false);
            setIsNegTimeUp(true);
            playSound('end');
            // Free debate: running out yields the floor to the other side.
            const s = latestRef.current;
            if (s.debateSingleDoubleTimerSettings[s.selectedStage] === TimerSetting.free
                && autoSwitchRef.current && s.timeLeftAff > 0) {
                setRunningAff(true);
            }
        }
        return () => clearInterval(interval);
    }, [runningNeg, timeLeftNeg, playSound]);

    const clearClockBlink = useCallback(() => {
        ['clock', 'clockAff', 'clockNeg'].forEach((id) => {
            document.getElementById(id)?.classList.remove('time-30s-blinking');
        });
    }, []);

    const applyStage = useCallback((stage) => {
        if (!stage || !debateStages.hasOwnProperty(stage)) {
            return;
        }
        autoSwitchRef.current = false;
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
    }, [debateStages, clearClockBlink]);

    const handleStageSelect = (event) => {
        applyStage(event.target.value);
    };

    const resetSingleTimer = () => {
        setRunning(false);
        setIsTimeUp(false);
        setTimeLeft(debateStages[selectedStage]);
        clearClockBlink();
    };

    const resetAffTimer = () => {
        autoSwitchRef.current = false;
        setRunningAff(false);
        setIsAffTimeUp(false);
        setTimeLeftAff(debateStages[selectedStage]);
        document.getElementById('clockAff')?.classList.remove('time-30s-blinking');
    };

    const resetNegTimer = () => {
        autoSwitchRef.current = false;
        setRunningNeg(false);
        setIsNegTimeUp(false);
        setTimeLeftNeg(debateStages[selectedStage]);
        document.getElementById('clockNeg')?.classList.remove('time-30s-blinking');
    };

    // Free-debate toggles: explicitly starting a side arms the auto switch;
    // explicitly stopping a side hands the floor to the other side.
    const startAff = () => {
        autoSwitchRef.current = true;
        setRunningAff(true);
    };
    const stopAff = () => {
        setRunningAff(false);
        const s = latestRef.current;
        if (s.debateSingleDoubleTimerSettings[s.selectedStage] === TimerSetting.free
            && autoSwitchRef.current && s.timeLeftNeg > 0 && !s.runningNeg) {
            setRunningNeg(true);
        }
    };
    const startNeg = () => {
        autoSwitchRef.current = true;
        setRunningNeg(true);
    };
    const stopNeg = () => {
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
                            ) : null}
                        </div>
                    </div>
                </div>


                {/* Session control bar (controller) / follow banner (display) */}
                {!isDisplay ? (
                    <div className="session-bar" role="toolbar" aria-label={t('timer.session.title')}>
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
                            playSound('30');
                        }}>{t('timer.test30sSound')}</button>
                        <button type="button" onClick={() => {
                            setRunning(false);
                            setTimeLeft(0);
                            setIsTimeUp(true);
                            clearClockBlink();
                            playSound('end');
                        }}>{t('timer.testEndSound')}</button>
                    </div>
                ) : (
                    <div></div>
                )}

                {/* 根据选定的阶段显示不同的计时器和控制按钮 */}
                {isDualMode ? (
                    <div className='debate-timers-container'>
                        <div className={`timer-box${isFreeMode && activeSide === 'aff' ? ' free-active' : ''}`}>
                            <h3>{t('timer.affirmative')}</h3>
                            <h1 className={isAffTimeUp ? 'blinking' : ''} id='clockAff'>{formatTime(timeLeftAff)}</h1>
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
                            <h3>{t('timer.negative')}</h3>
                            <h1 className={isNegTimeUp ? 'blinking' : ''} id='clockNeg'>{formatTime(timeLeftNeg)}</h1>
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
                        <h1 className={isTimeUp ? 'blinking' : 'timer'} id='clock'>{formatTime(timeLeft)}</h1>
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
