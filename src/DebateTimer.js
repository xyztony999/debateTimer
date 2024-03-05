import React, {useState, useEffect, Fragment} from 'react';
import end_sound from './notify.wav';
import r30_sound from './split.wav';

const DebateTimer = () => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [timeLeftAff, setTimeLeftAff] = useState(0);
    const [timeLeftNeg, setTimeLeftNeg] = useState(0);
    const [running, setRunning] = useState(false);
    const [runningAff, setRunningAff] = useState(false);
    const [runningNeg, setRunningNeg] = useState(false);
    const [selectedStage, setSelectedStage] = useState('');
    const [timerTitle, setTimerTitle] = useState('测试声音');
    const [isTimeUp, setIsTimeUp] = useState(false);
    const [isAffTimeUp, setIsAffTimeUp] = useState(false);
    const [isNegTimeUp, setIsNegTimeUp] = useState(false);
    const [darkMode, setDarkMode] = useState(false);

    const toggleDarkMode = () => {
        setDarkMode(!darkMode);
    };

    useEffect(() => {
        const matchDarkMode = window.matchMedia('(prefers-color-scheme: dark)');
        setDarkMode(matchDarkMode.matches);

        const handleChange = (e) => {
            setDarkMode(e.matches);
        };

        // 监听系统深色模式的变化
        matchDarkMode.addEventListener('change', handleChange);

        // 组件卸载时移除监听器
        return () => {
            matchDarkMode.removeEventListener('change', handleChange);
        };
    }, []);


    useEffect(() => {
        if (darkMode) {
            document.body.classList.add('dark-mode');
        } else {
            document.body.classList.remove('dark-mode');
        }
    }, [darkMode]);



    const debateStages = {
        '测试声音': 31,
        '正方一辩发言': 210,
        '反方四辩盘问正方一辩': 90,
        '反方一辩发言': 210,
        '正方四辩盘问反方一辩': 90,
        '正方二辩作驳论': 120,
        '反方二辩作驳论': 120,
        '正方二辩对辩反方二辩': 90,
        '正方三辩盘问': 120,
        '反方三辩盘问': 120,
        '正方三辩质询小结': 90,
        '反方三辩质询小结': 90,
        '战术暂停': 180,
        '自由辩论': 240,
        '反方四辩总结陈词': 210,
        '正方四辩总结陈词': 210
    };
    useEffect(() => {
        const keys = Object.keys(debateStages);
        setSelectedStage(keys[0]);
        setTimerTitle(keys[0]);
        setTimeLeft(debateStages[keys[0]]);
        setTimeLeftAff(debateStages[keys[0]]);
        setTimeLeftNeg(debateStages[keys[0]]);
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
        setTimerTitle(stage);
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
        if (selectedStage !== '自由辩论' && selectedStage !== '正方二辩对辩反方二辩') {
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
    }, [running, timeLeft]);

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

//    useEffect(() => {
//        let interval;
//        if (selectedStage !== '自由辩论' && selectedStage !== '正方二辩对辩反方二辩') {
//            if (running && timeLeft > 30) {
//                document.getElementById('clock').classList.remove('time-30s-blinking');
//            }
//            if (running && timeLeft <= 30) {
//                interval = setInterval(() => {
//                    if (timeLeft === 30) {
//                        document.getElementById('clock').classList.add('time-30s-blinking');
//                    }
//                    if (timeLeft < 27) {
//                        document.getElementById('clock').classList.remove('time-30s-blinking');
//                    }
//                }, 100);
//            }
//        }
//        else {
//            if (runningAff && timeLeftAff > 30) {
//                document.getElementById('clockAff').classList.remove('time-30s-blinking');
//            }
//            if (runningAff && timeLeftAff <= 30) {
//                interval = setInterval(() => {
//                    if (timeLeftAff === 30) {
//                        document.getElementById('clockAff').classList.add('time-30s-blinking');
//                    }
//                    if (timeLeftAff < 27) {
//                        document.getElementById('clockAff').classList.remove('time-30s-blinking');
//                    }
//                }, 100);
//            }
//            if (runningNeg && timeLeftNeg > 30) {
//                document.getElementById('clockNeg').classList.remove('time-30s-blinking');
//            }
//            if (runningNeg && timeLeftNeg <= 30) {
//                interval = setInterval(() => {
//                    if (timeLeftNeg === 30) {
//                        document.getElementById('clockNeg').classList.add('time-30s-blinking');
//                    }
//                    if (timeLeftNeg < 27) {
//                        document.getElementById('clockNeg').classList.remove('time-30s-blinking');
//                    }
//                }, 100);
//            }
//        }
//        return () => clearInterval(interval);
//    }, [running, runningAff, runningNeg, timeLeft, timeLeftAff, timeLeftNeg]);

    const playSound = (mode) => {
        if(mode === 'end') {
            const audio = new Audio(end_sound);
            audio.play().then(r => console.log(r)).catch(e => console.log(e));
        }
        if(mode === '30') {
            const audio = new Audio(r30_sound);
            audio.play().then(r => console.log(r)).catch(e => console.log(e));
        }
    };

    useEffect(() => {
        const handleKeyPress = (event) => {
            if (event.key === 's' || event.key === 'S') {
                if (selectedStage === '正方二辩对辩反方二辩' || selectedStage === '自由辩论') {
                    !runningAff && setRunningAff(true);
                } else {
                    !running && setRunning(true);
                }
            } else if (event.key === 'p' || event.key === 'P') {
                if (selectedStage === '正方二辩对辩反方二辩' || selectedStage === '自由辩论') {
                    runningAff && setRunningAff(false);
                } else {
                    running && setRunning(false);
                }
            } else if (event.key === 'r' || event.key === 'R') {
                if (selectedStage === '正方二辩对辩反方二辩' || selectedStage === '自由辩论') {
                    !runningAff && setTimeLeftAff(debateStages[selectedStage]);
                    setIsAffTimeUp(false);
                }
                else if (selectedStage === '请选择辩论环节') {
                    !running && setTimeLeft(0);
                    setIsTimeUp(false);
                }
                else {
                    !running && setTimeLeft(debateStages[selectedStage]);
                    setIsTimeUp(false);
                }
            } else if (event.key === 'd' || event.key === 'D') {
                if (selectedStage === '正方二辩对辩反方二辩' || selectedStage === '自由辩论') {
                    !runningNeg && setRunningNeg(true);
                }
            } else if (event.key === '[' || event.key === '{') {
                if (selectedStage === '正方二辩对辩反方二辩' || selectedStage === '自由辩论') {
                    runningNeg && setRunningNeg(false);
                }
            } else if (event.key ==='t' || event.key === 'T') {
                if (selectedStage === '正方二辩对辩反方二辩' || selectedStage === '自由辩论') {
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
    }, [selectedStage, running, runningAff, runningNeg]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === '1') {
                setSelectedStage('正方一辩发言');
                setTimerTitle('正方一辩发言');
                const time = debateStages['正方一辩发言'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === '2') {
                setSelectedStage('反方四辩盘问正方一辩');
                setTimerTitle('反方四辩盘问正方一辩');
                const time = debateStages['反方四辩盘问正方一辩'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === '3') {
                setSelectedStage('反方一辩发言');
                setTimerTitle('反方一辩发言');
                const time = debateStages['反方一辩发言'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === '4') {
                setSelectedStage('正方四辩盘问反方一辩');
                setTimerTitle('正方四辩盘问反方一辩');
                const time = debateStages['正方四辩盘问反方一辩'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === '5') {
                setSelectedStage('正方二辩作驳论');
                setTimerTitle('正方二辩作驳论');
                const time = debateStages['正方二辩作驳论'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === '6') {
                setSelectedStage('反方二辩作驳论');
                setTimerTitle('反方二辩作驳论');
                const time = debateStages['反方二辩作驳论'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === '7') {
                setSelectedStage('正方二辩对辩反方二辩');
                setTimerTitle('正方二辩对辩反方二辩');
                const time = debateStages['正方二辩对辩反方二辩'];
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === '8') {
                setSelectedStage('正方三辩盘问');
                setTimerTitle('正方三辩盘问');
                const time = debateStages['正方三辩盘问'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === '9') {
                setSelectedStage('反方三辩盘问');
                setTimerTitle('反方三辩盘问');
                const time = debateStages['反方三辩盘问'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === '0') {
                setSelectedStage('正方三辩质询小结');
                setTimerTitle('正方三辩质询小结');
                const time = debateStages['正方三辩质询小结'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === 'z' || event.key === 'Z') {
                setSelectedStage('战术暂停');
                setTimerTitle('战术暂停');
                const time = debateStages['战术暂停'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === 'x' || event.key === 'X') {
                setSelectedStage('自由辩论');
                setTimerTitle('自由辩论');
                const time = debateStages['自由辩论'];
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === 'c' || event.key === 'C') {
                setSelectedStage('反方四辩总结陈词');
                setTimerTitle('反方四辩总结陈词');
                const time = debateStages['反方四辩总结陈词'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
            if (event.key === 'v' || event.key === 'V') {
                setSelectedStage('正方四辩总结陈词');
                setTimerTitle('正方四辩总结陈词');
                const time = debateStages['正方四辩总结陈词'];
                setTimeLeft(time);
                setTimeLeftAff(time);
                setTimeLeftNeg(time);
                setIsTimeUp(false);
                setIsAffTimeUp(false);
                setIsNegTimeUp(false);
                setRunning(false);
                setRunningAff(false);
                setRunningNeg(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedStage, running, runningAff, runningNeg]);


    return (
        <Fragment>
            <div id="timer" className={darkMode ? 'dark-mode' : 'light-mode'}>
                <button type='button' onClick={toggleDarkMode}>
                    {darkMode ? '☀' : '🌙'}
                </button>
                <select value={selectedStage} onChange={handleStageSelect}>
                    {Object.keys(debateStages).map((stage) => (
                        <option key={stage} value={stage} title={stage}>
                            {stage}
                        </option>
                    ))}
                </select>
                <h2>{timerTitle}</h2>
                {/*测试声音*/}
                {(selectedStage === '测试声音') ? (
                    <div>
                        <button onClick={() => {
                            setIsTimeUp(false)
                            setRunning(true)
                            //playSound('30')
                            setTimeLeft(30)
                        }}>测试30秒声音</button>
                        <button onClick={() => {
                            setRunning(true)
                            setTimeLeft(0)
                            setIsTimeUp(true)
                            //playSound('end')

                        }}>测试结束声音</button>
                    </div>
                ) : (
                    <div></div>
                )}

                {/* 根据选定的阶段显示不同的计时器和控制按钮 */}
                {(selectedStage === '正方二辩对辩反方二辩' || selectedStage === '自由辩论') ? (
                    <div className='debate-timers-container'>
                        <div className='timer-box'>
                            <h3>正方</h3>
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
                            <h3>反方</h3>
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
