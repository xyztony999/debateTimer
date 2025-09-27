import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import debateStagesData from './resources/debateTimeSettings.json';
import timerSettingsData from './resources/debateTimerSettings.json';
import ConfigurationService from './services/ConfigurationService';

const DebateSetting = () => {
    const navigate = useNavigate();
    const [debateStages, setDebateStages] = useState({});
    const [timerSettings, setTimerSettings] = useState({});

    useEffect(() => {
        // 为设置页面添加body类名，确保正确的滚动行为
        document.body.className = 'settings-body';

        // 清理函数，当组件卸载时移除类名
        return () => {
            document.body.className = '';
        };
    }, []);

    useEffect(() => {
        const initializeSettings = async () => {
            try {
                // Initialize default configurations
                await ConfigurationService.initializeDefaultConfigurations();

                // Load default configuration
                const defaultConfig = await ConfigurationService.loadConfiguration('默认配置');
                if (defaultConfig.success) {
                    setDebateStages(defaultConfig.data.debateStages);
                    setTimerSettings(defaultConfig.data.timerSettings);
                } else {
                    // Fallback to local files
                    setDebateStages(debateStagesData);
                    setTimerSettings(timerSettingsData);
                }

            } catch (error) {
                console.error('Error initializing settings:', error);
                // Fallback to local files
                setDebateStages(debateStagesData);
                setTimerSettings(timerSettingsData);
            }
        };

        initializeSettings();
    }, []);

    // 更新辩论阶段
    const handleDebateStageChange = (key, value) => {
        setDebateStages({ ...debateStages, [key]: value });
    };

    // 更新计时器设置
    const handleTimerSettingChange = (key, value) => {
        setTimerSettings({ ...timerSettings, [key]: value });
    };

    // 保存更改到 Firestore
    const saveChanges = async () => {
        try {
            const result = await ConfigurationService.saveConfiguration(
                '默认配置',
                debateStages,
                timerSettings
            );

            if (result.success) {
                alert('设置已保存到 Firestore!');
            } else {
                alert(`保存失败: ${result.message}`);
            }
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            alert('保存设置失败，请重试。');
        }
    };


    // 重置为本地默认设置
    function loadLocalSettings() {
        setDebateStages(debateStagesData);
        setTimerSettings(timerSettingsData);
    }

    return (
        <div className="modern-settings-container">
            {/* Header */}
            <div className="settings-header">
                <div className="header-content">
                    {/* Navigation Bar */}
                    <div className="settings-nav">
                        <div className="nav-left">
                            <button
                                className="nav-back-btn"
                                onClick={() => navigate('/')}
                            >
                                ← 返回计时器
                            </button>
                        </div>
                        <div className="nav-center">
                            <div className="breadcrumb">
                                <span className="breadcrumb-item">🎯 计时器</span>
                                <span className="breadcrumb-separator">›</span>
                                <span className="breadcrumb-item current">⚙️ 设置</span>
                            </div>
                        </div>
                        <div className="nav-right">
                            <button
                                className="nav-help-btn"
                                onClick={() => alert('提示：修改设置后点击"保存到 Firestore"按钮保存配置。计时器页面会自动更新。')}
                                title="查看帮助"
                            >
                                ❓ 帮助
                            </button>
                        </div>
                    </div>

                    <div className="header-main">
                        <h1 className="settings-title">⚙️ 辩论计时器设置</h1>
                        <p className="settings-subtitle">自定义您的辩论比赛时间和计时器配置</p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="settings-content">

                {/* Time Settings Card */}
                <div className="settings-card">
                    <div className="card-header">
                        <h2 className="card-title">⏱️ 时长设置</h2>
                        <p className="card-description">设置每个辩论阶段的时间长度（单位：秒）</p>
                    </div>
                    <div className="card-content">
                        <div className="settings-grid">
                            {Object.keys(debateStages).map((stage, index) => {
                                const minutes = Math.floor(debateStages[stage] / 60);
                                const seconds = debateStages[stage] % 60;
                                const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                                return (
                                    <div key={index} className="setting-item">
                                        <label className="setting-label">
                                            {stage}
                                            <span className="time-preview">{timeDisplay}</span>
                                        </label>
                                        <div className="input-group">
                                            <input
                                                type="number"
                                                className="modern-input"
                                                value={debateStages[stage]}
                                                onChange={(e) => handleDebateStageChange(stage, parseInt(e.target.value) || 0)}
                                                min="0"
                                                max="3600"
                                                placeholder="秒数"
                                            />
                                            <span className="input-suffix">秒</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Timer Mode Settings Card */}
                <div className="settings-card">
                    <div className="card-header">
                        <h2 className="card-title">🎛️ 计时模式</h2>
                        <p className="card-description">设置每个阶段使用单计时器还是双计时器</p>
                    </div>
                    <div className="card-content">
                        <div className="settings-grid">
                            {Object.keys(timerSettings).map((stage, index) => (
                                <div key={index} className="setting-item">
                                    <label className="setting-label">{stage}</label>
                                    <select
                                        className="modern-select"
                                        value={timerSettings[stage]}
                                        onChange={(e) => handleTimerSettingChange(stage, e.target.value)}
                                    >
                                        <option value="single">🎯 单计时器</option>
                                        <option value="double">⚖️ 双计时器</option>
                                    </select>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="settings-actions">
                    <button
                        className="btn btn-outline"
                        onClick={loadLocalSettings}
                    >
                        🔄 重置为默认
                    </button>
                    <button
                        className="btn btn-success"
                        onClick={saveChanges}
                    >
                        💾 保存到 Firestore
                    </button>
                </div>

                {/* Scroll indicator for long content */}
                <div className="scroll-indicator">
                    <p>页面内容较长，可以向下滚动查看更多设置选项</p>
                </div>
            </div>
        </div>
    );
};

export default DebateSetting;
