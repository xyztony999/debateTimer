import React, {useState, useEffect, Fragment, useCallback, useRef} from 'react';
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

const DebateTimer = ({ shareToken = null }) => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { darkMode, toggleDarkMode } = useColorMode();
    const { user, logout } = useAuth();
    const isDisplay = Boolean(shareToken);
    const [displayError, setDisplayError] = useState('');
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

    useEffect(() => {
        let unsubscribe;

        const toNames = (list) => (list || []).map((item) => item.name);

        const initializeConfiguration = async () => {
            try {
                if (shareToken) {
                    const result = await ConfigurationService.loadDisplayConfiguration(shareToken);
                    if (!result.success) {
                        setDisplayError(result.message || t('share.notFound'));
                        return;
                    }
                    setDisplayError('');
                    applyLoadedData(result.data.name || DEFAULT_CONFIGURATION_NAME, result.data, false);
                    unsubscribe = ConfigurationService.onDisplayChange(shareToken, async () => {
                        const next = await ConfigurationService.loadDisplayConfiguration(shareToken);
                        if (next.success) {
                            setDisplayError('');
                            applyLoadedData(next.data.name || DEFAULT_CONFIGURATION_NAME, next.data, false);
                        } else {
                            setDisplayError(next.message || t('share.notFound'));
                        }
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
                });
            } catch (error) {
                console.error('Error initializing configuration:', error);
                if (shareToken) {
                    setDisplayError(t('share.notFound'));
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
        };
    }, [loadConfiguration, formatTimerSettings, shareToken, applyLoadedData, t]);

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
        setRunningAff(false);
        setIsAffTimeUp(false);
        setTimeLeftAff(debateStages[selectedStage]);
        document.getElementById('clockAff')?.classList.remove('time-30s-blinking');
    };

    const resetNegTimer = () => {
        setRunningNeg(false);
        setIsNegTimeUp(false);
        setTimeLeftNeg(debateStages[selectedStage]);
        document.getElementById('clockNeg')?.classList.remove('time-30s-blinking');
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

        const isDouble = debateSingleDoubleTimerSettings[selectedStage] === TimerSetting.double;

        const handleKeyPress = (event) => {
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
                    setRunningAff((prev) => !prev);
                } else if (withShift && (key === 'q' || key === 'Q')) {
                    event.preventDefault();
                    if (!runningAff) {
                        resetAffTimer();
                    }
                } else if (!withShift && (key === 'l' || key === 'L')) {
                    event.preventDefault();
                    setRunningNeg((prev) => !prev);
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


                {displayError ? (
                    <p className="shortcut-hint">{displayError}</p>
                ) : null}

                <select
                    className="timer-stage-select"
                    value={selectedStage}
                    onChange={handleStageSelect}
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
                {(selectedStage === 'sound_check') ? (
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
                {(debateSingleDoubleTimerSettings[selectedStage]===TimerSetting.double) ? (
                    <div className='debate-timers-container'>
                        <div className='timer-box'>
                            <h3>{t('timer.affirmative')}</h3>
                            <h1 className={isAffTimeUp ? 'blinking' : ''} id='clockAff'>{formatTime(timeLeftAff)}</h1>
                            <div className='controls'>
                                <button
                                    className={!runningAff ? 'active' : ''}
                                    onClick={() => setRunningAff(true)}
                                    disabled={runningAff}
                                    title={t('timer.shortcutAffToggle')}
                                >
                                    ▶️
                                </button>
                                <button
                                    className={runningAff ? 'active' : ''}
                                    onClick={() => setRunningAff(false)}
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
                        </div>
                        <div className='timer-box'>
                            <h3>{t('timer.negative')}</h3>
                            <h1 className={isNegTimeUp ? 'blinking' : ''} id='clockNeg'>{formatTime(timeLeftNeg)}</h1>
                            <div className='controls'>
                                <button
                                    className={!runningNeg ? 'active' : ''}
                                    onClick={() => setRunningNeg(true)}
                                    disabled={runningNeg}
                                    title={t('timer.shortcutNegToggle')}
                                >
                                    ▶️
                                </button>
                                <button
                                    className={runningNeg ? 'active' : ''}
                                    onClick={() => setRunningNeg(false)}
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
                        </div>
                    </div>
                ) : (
                    <div className='timer-box'>
                        <h1 className={isTimeUp ? 'blinking' : 'timer'} id='clock'>{formatTime(timeLeft)}</h1>
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
                    </div>
                )}

                <p className="shortcut-hint shortcut-hint--stage">{t('timer.hintStage')}</p>

            </div>
        </Fragment>
    );
};

export default DebateTimer;
