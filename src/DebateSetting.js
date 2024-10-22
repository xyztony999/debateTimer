import React, { useState, useEffect } from 'react';
import debateStagesData from './resources/debateTimeSettings.json';
import timerSettingsData from './resources/debateTimerSettings.json';
import { db } from './services/FireBaseConfig';
import { doc, setDoc, getDoc } from 'firebase/firestore';

const DebateSetting = () => {
    const [debateStages, setDebateStages] = useState({});
    const [timerSettings, setTimerSettings] = useState({});

    useEffect(() => {
        setDebateStages(debateStagesData);
        setTimerSettings(timerSettingsData);
    }, []);

    useEffect(() => {
        const fetchSettings = async () => {
            try {
                // 获取 debateStages
                const debateStagesDoc = await getDoc(doc(db, 'debateSettings', 'debateStages'));
                if (debateStagesDoc.exists()) {
                    setDebateStages(debateStagesDoc.data());
                }
                else {
                    setDebateStages(debateStagesData);
                }

                // 获取 timerSettings
                const timerSettingsDoc = await getDoc(doc(db, 'debateSettings', 'timerSettings'));
                if (timerSettingsDoc.exists()) {
                    setTimerSettings(timerSettingsDoc.data());
                }
                else {
                    setTimerSettings(timerSettingsData);
                }
            } catch (error) {
                console.error('Error fetching from Firebase:', error);
            }
        };

        fetchSettings().then(r => console.log('Settings fetched from Firebase!'));
    }, []);

    // 更新辩论阶段
    const handleDebateStageChange = (key, value) => {
        setDebateStages({ ...debateStages, [key]: value });
    };

    // 更新计时器设置
    const handleTimerSettingChange = (key, value) => {
        setTimerSettings({ ...timerSettings, [key]: value });
    };

    // 保存更改到 JSON 文件
    const saveChanges = async () => {
        try {
            // 保存 debateStages 到 Firestore
            await setDoc(doc(db, 'debateSettings', 'debateStages'), debateStages);

            // 保存 timerSettings 到 Firestore
            await setDoc(doc(db, 'debateSettings', 'timerSettings'), timerSettings);

            alert('Settings saved to Firebase!');
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            alert('Failed to save settings. Please try again.');
        }
    };


    function loadLocalSettings() {
        setDebateStages(debateStagesData);
        setTimerSettings(timerSettingsData);
    }

    return (
        <div className="settings-container">
            <h1>Customize Debate Settings</h1>

            <div>
                <h2>Debate Stages</h2>
                {Object.keys(debateStages).map((stage, index) => (
                    <div key={index}>
                        <label>{stage}:</label>
                        <input
                            type="number"
                            value={debateStages[stage]}
                            onChange={(e) => handleDebateStageChange(stage, e.target.value)}
                        />
                    </div>
                ))}
            </div>

            <div className="settings-section">
                <h2>Timer Settings</h2>
                {Object.keys(timerSettings).map((stage, index) => (
                    <div key={index}>
                        <label>{stage}:</label>
                        <select
                            value={timerSettings[stage]}
                            onChange={(e) => handleTimerSettingChange(stage, e.target.value)}
                        >
                            <option value="single">Single</option>
                            <option value="double">Double</option>
                        </select>
                    </div>
                ))}
            </div>
            <button className={"save-button"} onClick={loadLocalSettings}>Load local settings </button>
            <button className="save-button" onClick={saveChanges}>Save Changes</button>
        </div>
    );
};

export default DebateSetting;
