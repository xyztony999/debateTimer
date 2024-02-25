import React, { useState, useEffect } from 'react';
import sound from './notify.wav';

const DebateTimer = () => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [timeLeftAff, setTimeLeftAff] = useState(0);
    const [timeLeftNeg, setTimeLeftNeg] = useState(0);
    const [running, setRunning] = useState(false);
    const [runningAff, setRunningAff] = useState(false);
    const [runningNeg, setRunningNeg] = useState(false);
    const [selectedStage, setSelectedStage] = useState('');
    const [timerTitle, setTimerTitle] = useState('请选择辩论环节');
    const [isTimeUp, setIsTimeUp] = useState(false);
    const [isAffTimeUp, setIsAffTimeUp] = useState(false);
    const [isNegTimeUp, setIsNegTimeUp] = useState(false);

    const debateStages = {
        '请选择辩论环节': 0,
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
        let interval;
        if (!runningAff && !runningNeg && running && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prevTime) => prevTime - 1);
            }, 1000);
        } else if (running && timeLeft === 0) {
            setRunning(false);
            setIsTimeUp(true);
            playSound();
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
        } else if (runningAff && timeLeftAff === 0) {
            setRunningAff(false);
            setIsAffTimeUp(true);
            playSound();
            //alert('正方时间到！');
        }
        return () => clearInterval(interval);
    }, [runningAff, timeLeftAff]);

    useEffect(() => {
        let interval;
        if (runningNeg && timeLeftNeg > 0) {
            interval = setInterval(() => {
                setTimeLeftNeg((prevTime) => prevTime - 1);
            }, 1000);
        } else if (runningNeg && timeLeftNeg === 0) {
            setRunningNeg(false);
            setIsNegTimeUp(true);
            playSound();
            //alert('反方时间到！');
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

    const playSound = () => {
        const audio = new Audio(sound);
        audio.play();
    };

    return (
        <div id="timer">
            <select value={selectedStage} onChange={handleStageSelect}>
                {Object.keys(debateStages).map((stage) => (
                    <option key={stage} value={stage}>
                        {stage}
                    </option>
                ))}
            </select>
            <h2>{timerTitle}</h2>

            {/* 根据选定的阶段显示不同的计时器和控制按钮 */}
            {(selectedStage === '正方二辩对辩反方二辩' || selectedStage === '自由辩论') ? (
                <>
                    <div className='timer-box'>
                        <h3>正方</h3>
                        <h1 className={isAffTimeUp ? 'blinking' : ''}>{formatTime(timeLeftAff)}</h1>
                        <div className='controls'>
                            <button onClick={() => setRunningAff(true)} disabled={runningAff}>
                                ▶️
                            </button>
                            <button onClick={() => setRunningAff(false)} disabled={!runningAff}>
                                ⏸️
                            </button>
                            <button onClick={() => {setIsAffTimeUp(false); setTimeLeftAff(debateStages[selectedStage])}} disabled={runningAff}>
                                🔃
                            </button>
                        </div>
                    </div>
                    <div className='timer-box'>
                        <h3>反方</h3>
                        <h1 className={isNegTimeUp ? 'blinking' : ''}>{formatTime(timeLeftNeg)}</h1>
                        <div className='controls'>
                            <button onClick={() => setRunningNeg(true)} disabled={runningNeg}>
                                ▶️
                            </button>
                            <button onClick={() => setRunningNeg(false)} disabled={!runningNeg}>
                                ⏸️
                            </button>
                            <button onClick={() => {setIsNegTimeUp(false); setTimeLeftNeg(debateStages[selectedStage])}} disabled={runningNeg}>
                                🔃
                            </button>
                        </div>
                    </div>
                </>
            ) : (
                <div className='timer-box'>
                    <h1 className={isTimeUp ? 'blinking' : ''}>{formatTime(timeLeft)}</h1>
                    <div className='controls'>
                        <button onClick={() => setRunning(true)} disabled={running}>
                            ▶️
                        </button>
                        <button onClick={() => setRunning(false)} disabled={!running}>
                            ⏸️
                        </button>
                        <button onClick={() => {setIsTimeUp(false); setTimeLeft(debateStages[selectedStage])}} disabled={running}>
                            🔃
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DebateTimer;
