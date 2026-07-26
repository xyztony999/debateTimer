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

const DebateTimer = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
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
    const [darkMode, setDarkMode] = useState(false);

    const toggleDarkMode = () => {
        setDarkMode(prev => {
            const next = !prev;
            localStorage.setItem('darkMode', String(next));
            return next;
        });
    };

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
        // 为计时器页面添加body类名
        document.body.className = 'timer-body';

        // 清理函数，当组件卸载时移除类名
        return () => {
            document.body.className = '';
        };
    }, []);

    useEffect(() => {
        const stored = localStorage.getItem('darkMode');
        const matchDarkMode = window.matchMedia('(prefers-color-scheme: dark)');

        if (stored !== null) {
            setDarkMode(stored === 'true');
        } else {
            setDarkMode(matchDarkMode.matches);
        }

        if (stored === null) {
            const handleChange = (e) => {
                setDarkMode(e.matches);
            };

            matchDarkMode.addEventListener('change', handleChange);

            return () => {
                matchDarkMode.removeEventListener('change', handleChange);
            };
        }
    }, []);


    useEffect(() => {
        if (darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }, [darkMode]);


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

    // Load configuration from API
    const loadConfiguration = useCallback(async (configName) => {
        try {
            const result = await ConfigurationService.loadConfiguration(configName);
            if (result.success) {
                const newDebateStages = result.data.debateStages;
                const newTimerSettings = formatTimerSettings(result.data.timerSettings);

                resetTimerRuntime();
                setDebateStages(newDebateStages);
                setDebateSingleDoubleTimerSettings(newTimerSettings);
                setStageLabels(result.data.stageLabels || {});
                selectedConfigNameRef.current = configName;
                setStoredConfigurationName(configName);

                // 加载顺序信息（如果存在）
                if (result.data.stageOrder) {
                    setStageOrder(result.data.stageOrder);
                    // 使用有序的第一个项目作为默认选择
                    if (result.data.stageOrder.length > 0) {
                        const firstStage = result.data.stageOrder[0];
                        if (newDebateStages[firstStage]) {
                            setSelectedStage(firstStage);
                            setTimeLeft(newDebateStages[firstStage]);
                            setTimeLeftAff(newDebateStages[firstStage]);
                            setTimeLeftNeg(newDebateStages[firstStage]);
                        }
                    }
                } else {
                    // 如果没有顺序信息，使用对象键的顺序并设置默认项目
                    const keys = Object.keys(newDebateStages);
                    setStageOrder(keys);
                    if (keys.length > 0) {
                        setSelectedStage(keys[0]);
                        setTimeLeft(newDebateStages[keys[0]]);
                        setTimeLeftAff(newDebateStages[keys[0]]);
                        setTimeLeftNeg(newDebateStages[keys[0]]);
                    }
                }

                return true;
            } else {
                console.error('Failed to load configuration:', result.message);
                return false;
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            return false;
        }
    }, [formatTimerSettings, resetTimerRuntime]);

    useEffect(() => {
        let unsubscribe;

        const toNames = (list) => (list || []).map((item) => item.name);

        const initializeConfiguration = async () => {
            try {
                // Initialize default configurations on the API
                await ConfigurationService.initializeDefaultConfigurations();

                const listResult = await ConfigurationService.getConfigurations();
                const names = listResult.success
                    ? toNames(listResult.data)
                    : [DEFAULT_CONFIGURATION_NAME];

                const preferred = getStoredConfigurationName();
                const target = names.includes(preferred) ? preferred : DEFAULT_CONFIGURATION_NAME;
                await loadConfiguration(target);

                // Set up real-time listener for configuration changes
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
                // Fallback to local JSON files
                setDebateStages(debateStagesData);
                setDebateSingleDoubleTimerSettings(formatTimerSettings(timerSettingsData));
                setStageLabels({});
                selectedConfigNameRef.current = DEFAULT_CONFIGURATION_NAME;
                // 为本地数据创建默认顺序
                const localStageKeys = Object.keys(debateStagesData);
                setStageOrder(localStageKeys);
                // 设置默认选择
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
    }, [loadConfiguration, formatTimerSettings]);

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
    }, [running, timeLeft, runningAff, runningNeg]);

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
    }, [runningAff, timeLeftAff]);

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
    }, [runningNeg, timeLeftNeg]);

    const handleStageSelect = (event) => {
        const stage = event.target.value;
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
    };

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


    const playSound = (mode) => {
        if(mode === 'end') {
            const audio = new Audio(end_sound);
            audio.play().catch(() => {});
        }
        if(mode === '30') {
            const audio = new Audio(r30_sound);
            audio.play().catch(() => {});
        }
    };

    useEffect(() => {
        const handleKeyPress = (event) => {
            if (event.key === 's' || event.key === 'S') {
                if (debateSingleDoubleTimerSettings[selectedStage]===TimerSetting.double) {
                    !runningAff && setRunningAff(true);
                } else {
                    !running && setRunning(true);
                }
            } else if (event.key === 'p' || event.key === 'P') {
                if (debateSingleDoubleTimerSettings[selectedStage]===TimerSetting.double) {
                    runningAff && setRunningAff(false);
                } else {
                    running && setRunning(false);
                }
            } else if (event.key === 'r' || event.key === 'R') {
                if (debateSingleDoubleTimerSettings[selectedStage]===TimerSetting.double) {
                    !runningAff && setTimeLeftAff(debateStages[selectedStage]);
                    setIsAffTimeUp(false);
                }
                else if (selectedStage === 'sound_check') {
                    !running && setTimeLeft(0);
                    setIsTimeUp(false);
                }
                else {
                    !running && setTimeLeft(debateStages[selectedStage]);
                    setIsTimeUp(false);
                }
            } else if (event.key === 'd' || event.key === 'D') {
                if (debateSingleDoubleTimerSettings[selectedStage]===TimerSetting.double) {
                    !runningNeg && setRunningNeg(true);
                }
            } else if (event.key === '[' || event.key === '{') {
                if (debateSingleDoubleTimerSettings[selectedStage]===TimerSetting.double) {
                    runningNeg && setRunningNeg(false);
                }
            } else if (event.key ==='t' || event.key === 'T') {
                if (debateSingleDoubleTimerSettings[selectedStage]===TimerSetting.double) {
                    !runningNeg && setTimeLeftNeg(debateStages[selectedStage]);
                    setIsNegTimeUp(false);
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);

        // 移除事件监听器
        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    }, [selectedStage, running, runningAff, runningNeg, debateSingleDoubleTimerSettings, debateStages]);

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
                            <button
                                type="button"
                                className="nav-btn"
                                onClick={() => navigate('/settings')}
                                title={t('timer.settingsAria')}
                            >
                                ⚙️ {t('timer.settings')}
                            </button>
                            <button
                                type="button"
                                className="nav-btn dark-mode-btn"
                                onClick={toggleDarkMode}
                                title={darkMode ? t('timer.darkLight') : t('timer.darkDark')}
                            >
                                {darkMode ? '☀️' : '🌙'}
                            </button>
                        </div>
                    </div>
                </div>


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
                        <button onClick={() => {
                            setIsTimeUp(false)
                            setRunning(true)
                            //playSound('30')
                            setTimeLeft(30)
                        }}>{t('timer.test30sSound')}</button>
                        <button onClick={() => {
                            setRunning(true)
                            setTimeLeft(0)
                            setIsTimeUp(true)
                            //playSound('end')

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
                                <button className={!runningAff ? 'active' : ''} onClick={() => setRunningAff(true)} disabled={runningAff}>
                                    ▶️
                                </button>
                                <button className={runningAff ? 'active' : ''} onClick={() => setRunningAff(false)} disabled={!runningAff}>
                                    ⏸️
                                </button>
                                <button className={!runningAff ? 'active' : ''} onClick={() => {
                                    setIsAffTimeUp(false);
                                    setTimeLeftAff(debateStages[selectedStage])
                                }} disabled={runningAff}>
                                    🔃
                                </button>
                            </div>
                        </div>
                        <div className='timer-box'>
                            <h3>{t('timer.negative')}</h3>
                            <h1 className={isNegTimeUp ? 'blinking' : ''} id='clockNeg'>{formatTime(timeLeftNeg)}</h1>
                            <div className='controls'>
                                <button className={!runningNeg ? 'active' : ''} onClick={() => setRunningNeg(true)} disabled={runningNeg}>
                                    ▶️
                                </button>
                                <button className={runningNeg ? 'active' : ''} onClick={() => setRunningNeg(false)} disabled={!runningNeg}>
                                    ⏸️
                                </button>
                                <button className={!runningNeg ? 'active' : ''} onClick={() => {
                                    setIsNegTimeUp(false);
                                    setTimeLeftNeg(debateStages[selectedStage]);
                                }} disabled={runningNeg}>
                                    🔃
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className='timer-box'>
                        <h1 className={isTimeUp ? 'blinking' : 'timer'} id='clock'>{formatTime(timeLeft)}</h1>
                        <div className='controls'>
                            <button className={!running ? 'active' : ''} onClick={() => setRunning(true)} disabled={running}>
                                ▶️
                            </button>
                            <button className={running ? 'active' : ''} onClick={() => setRunning(false)} disabled={!running}>
                                ⏸️
                            </button>
                            <button className={!running ? 'active' : ''} onClick={() => {
                                setIsTimeUp(false);
                                setTimeLeft(debateStages[selectedStage])
                            }} disabled={running}>
                                🔃
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </Fragment>
    );
};

export default DebateTimer;
