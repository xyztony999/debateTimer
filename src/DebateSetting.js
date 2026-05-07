import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import debateStagesData from './resources/debateTimeSettings.json';
import timerSettingsData from './resources/debateTimerSettings.json';
import ConfigurationService from './services/ConfigurationService';
import { DEFAULT_CONFIGURATION_NAME } from './config/configConstants';
import LanguageSwitcher from './components/LanguageSwitcher';
import { stageDisplayName } from './utils/stageDisplayName';

const DebateSetting = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [debateStages, setDebateStages] = useState({});
    const [timerSettings, setTimerSettings] = useState({});
    const [stageOrder, setStageOrder] = useState([]);
    const [newItemName, setNewItemName] = useState('');
    const [newItemTime, setNewItemTime] = useState(60);
    const [newItemMode, setNewItemMode] = useState('single');
    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverItem, setDragOverItem] = useState(null);

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
                const defaultConfig = await ConfigurationService.loadConfiguration(DEFAULT_CONFIGURATION_NAME);
                if (defaultConfig.success) {
                    setDebateStages(defaultConfig.data.debateStages);
                    setTimerSettings(defaultConfig.data.timerSettings);
                    // 加载顺序信息（如果存在）
                    if (defaultConfig.data.stageOrder) {
                        setStageOrder(defaultConfig.data.stageOrder);
                    } else {
                        // 如果没有顺序信息，使用对象键的顺序并保存
                        const order = Object.keys(defaultConfig.data.debateStages);
                        setStageOrder(order);
                    }
                } else {
                    // Fallback to local files
                    setDebateStages(debateStagesData);
                    setTimerSettings(timerSettingsData);
                    // 为本地数据创建默认顺序
                    setStageOrder(Object.keys(debateStagesData));
                }

            } catch (error) {
                console.error('Error initializing settings:', error);
                // Fallback to local files
                setDebateStages(debateStagesData);
                setTimerSettings(timerSettingsData);
                setStageOrder(Object.keys(debateStagesData));
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
                DEFAULT_CONFIGURATION_NAME,
                debateStages,
                timerSettings,
                stageOrder
            );

            if (result.success) {
                alert(t('settings.savedSuccess'));
            } else {
                alert(t('settings.saveFailed', { message: result.message }));
            }
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            alert(t('settings.saveRetry'));
        }
    };


    // 重置为本地默认设置
    function loadLocalSettings() {
        setDebateStages(debateStagesData);
        setTimerSettings(timerSettingsData);
        setStageOrder(Object.keys(debateStagesData));
    }

    // 添加新的计时项目
    const addTimerItem = () => {
        if (!newItemName.trim()) {
            alert(t('settings.enterItemName'));
            return;
        }

        if (debateStages.hasOwnProperty(newItemName)) {
            alert(t('settings.itemExists'));
            return;
        }

        // 添加到两个配置对象中
        setDebateStages(prev => ({ ...prev, [newItemName]: newItemTime }));
        setTimerSettings(prev => ({ ...prev, [newItemName]: newItemMode }));

        // 添加到顺序列表的末尾
        setStageOrder(prev => [...prev, newItemName]);

        // 重置输入框
        setNewItemName('');
        setNewItemTime(60);
        setNewItemMode('single');
    };

    // 删除计时项目
    const deleteTimerItem = (itemName) => {
        if (window.confirm(t('settings.confirmDelete', { name: stageDisplayName(t, itemName) }))) {
            const newDebateStages = { ...debateStages };
            const newTimerSettings = { ...timerSettings };

            delete newDebateStages[itemName];
            delete newTimerSettings[itemName];

            setDebateStages(newDebateStages);
            setTimerSettings(newTimerSettings);

            // 从顺序列表中移除
            setStageOrder(prev => prev.filter(stage => stage !== itemName));
        }
    };

    // 拖拽排序功能
    const handleDragStart = (e, itemName) => {
        setDraggedItem(itemName);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, itemName) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverItem(itemName);
    };

    const handleDragLeave = () => {
        setDragOverItem(null);
    };

    const handleDrop = (e, dropTargetItem) => {
        e.preventDefault();

        if (!draggedItem || draggedItem === dropTargetItem) {
            setDraggedItem(null);
            setDragOverItem(null);
            return;
        }

        const currentOrder = [...stageOrder];
        const draggedIndex = currentOrder.indexOf(draggedItem);
        const targetIndex = currentOrder.indexOf(dropTargetItem);

        // 移除拖拽的项目
        currentOrder.splice(draggedIndex, 1);
        // 插入到目标位置
        currentOrder.splice(targetIndex, 0, draggedItem);

        setStageOrder(currentOrder);
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverItem(null);
    };

    // 移动项目到上一位
    const moveItemUp = (itemName) => {
        const currentOrder = [...stageOrder];
        const index = currentOrder.indexOf(itemName);
        if (index > 0) {
            [currentOrder[index], currentOrder[index - 1]] = [currentOrder[index - 1], currentOrder[index]];
            setStageOrder(currentOrder);
        }
    };

    // 移动项目到下一位
    const moveItemDown = (itemName) => {
        const currentOrder = [...stageOrder];
        const index = currentOrder.indexOf(itemName);
        if (index < currentOrder.length - 1) {
            [currentOrder[index], currentOrder[index + 1]] = [currentOrder[index + 1], currentOrder[index]];
            setStageOrder(currentOrder);
        }
    };

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
                                {t('settings.backToTimer')}
                            </button>
                        </div>
                        <div className="nav-center">
                            <div className="breadcrumb">
                                <span className="breadcrumb-item">🎯 {t('settings.breadcrumbTimer')}</span>
                                <span className="breadcrumb-separator">›</span>
                                <span className="breadcrumb-item current">⚙️ {t('settings.breadcrumbSettings')}</span>
                            </div>
                        </div>
                        <div className="nav-right settings-nav-actions">
                            <div
                                className="nav-actions-group nav-actions-group--settings"
                                role="toolbar"
                                aria-label={t('settings.toolbar')}
                            >
                                <LanguageSwitcher className="lang-switcher--settings" />
                                <button
                                    type="button"
                                    className="nav-help-btn"
                                    onClick={() => alert(t('settings.helpAlert'))}
                                    title={t('settings.helpTitle')}
                                >
                                    ❓ {t('settings.help')}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="header-main">
                        <h1 className="settings-title">⚙️ {t('settings.pageTitle')}</h1>
                        <p className="settings-subtitle">{t('settings.pageSubtitle')}</p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="settings-content">

                {/* Time Settings Card */}
                <div className="settings-card">
                    <div className="card-header">
                        <h2 className="card-title">⏱️ {t('settings.durationTitle')}</h2>
                        <p className="card-description">{t('settings.durationDesc')}</p>
                    </div>
                    <div className="card-content">
                        <div className="settings-grid">
                            {getOrderedStages().map((stage, index) => {
                                const minutes = Math.floor(debateStages[stage] / 60);
                                const seconds = debateStages[stage] % 60;
                                const timeDisplay = `${minutes}:${seconds.toString().padStart(2, '0')}`;

                                return (
                                    <div key={index} className="setting-item">
                                        <label className="setting-label">
                                            {stageDisplayName(t, stage)}
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
                                                placeholder={t('settings.secondsPlaceholder')}
                                            />
                                            <span className="input-suffix">{t('settings.secondsSuffix')}</span>
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
                        <h2 className="card-title">🎛️ {t('settings.modeTitle')}</h2>
                        <p className="card-description">{t('settings.modeDesc')}</p>
                    </div>
                    <div className="card-content">
                        <div className="settings-grid">
                            {getOrderedStages().map((stage, index) => (
                                <div key={index} className="setting-item">
                                    <label className="setting-label">{stageDisplayName(t, stage)}</label>
                                    <div className="input-group">
                                        <select
                                            className="modern-select"
                                            value={timerSettings[stage]}
                                            onChange={(e) => handleTimerSettingChange(stage, e.target.value)}
                                        >
                                            <option value="single">🎯 {t('settings.singleTimer')}</option>
                                            <option value="double">⚖️ {t('settings.doubleTimer')}</option>
                                        </select>
                                        <button
                                            className="btn btn-danger btn-small"
                                            onClick={() => deleteTimerItem(stage)}
                                            title={t('settings.deleteItemTitle')}
                                        >
                                            🗑️
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Add New Timer Item Card */}
                <div className="settings-card">
                    <div className="card-header">
                        <h2 className="card-title">➕ {t('settings.addTitle')}</h2>
                        <p className="card-description">{t('settings.addDesc')}</p>
                    </div>
                    <div className="card-content">
                        <div className="add-item-form">
                            <div className="form-row">
                                <div className="form-field">
                                    <label className="setting-label">{t('settings.itemName')}</label>
                                    <input
                                        type="text"
                                        className="modern-input"
                                        value={newItemName}
                                        onChange={(e) => setNewItemName(e.target.value)}
                                        placeholder={t('settings.placeholderItemName')}
                                        maxLength="20"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="setting-label">{t('settings.durationSeconds')}</label>
                                    <input
                                        type="number"
                                        className="modern-input"
                                        value={newItemTime}
                                        onChange={(e) => setNewItemTime(parseInt(e.target.value) || 0)}
                                        min="1"
                                        max="3600"
                                        placeholder={t('settings.placeholderSeconds')}
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="setting-label">{t('settings.timerMode')}</label>
                                    <select
                                        className="modern-select"
                                        value={newItemMode}
                                        onChange={(e) => setNewItemMode(e.target.value)}
                                    >
                                        <option value="single">🎯 {t('settings.singleTimer')}</option>
                                        <option value="double">⚖️ {t('settings.doubleTimer')}</option>
                                    </select>
                                </div>
                                <div className="form-field">
                                    <button
                                        className="btn btn-primary"
                                        onClick={addTimerItem}
                                    >
                                        ➕ {t('settings.addButton')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Timer Order Management Card */}
                <div className="settings-card">
                    <div className="card-header">
                        <h2 className="card-title">🔀 {t('settings.orderTitle')}</h2>
                        <p className="card-description">{t('settings.orderDesc')}</p>
                    </div>
                    <div className="card-content">
                        <div className="order-list">
                            {getOrderedStages().map((stage, index) => (
                                <div
                                    key={stage}
                                    className={`order-item ${draggedItem === stage ? 'dragging' : ''} ${dragOverItem === stage ? 'drag-over' : ''}`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, stage)}
                                    onDragOver={(e) => handleDragOver(e, stage)}
                                    onDragLeave={handleDragLeave}
                                    onDrop={(e) => handleDrop(e, stage)}
                                    onDragEnd={handleDragEnd}
                                >
                                    <div className="order-number">{index + 1}</div>
                                    <div className="drag-handle">⋮⋮</div>
                                    <div className="stage-name">{stageDisplayName(t, stage)}</div>
                                    <div className="stage-info">
                                        <span className="time-info">
                                            {Math.floor(debateStages[stage] / 60)}:{(debateStages[stage] % 60).toString().padStart(2, '0')}
                                        </span>
                                        <span className="mode-info">
                                            {timerSettings[stage] === 'single' ? '🎯' : '⚖️'}
                                        </span>
                                    </div>
                                    <div className="order-controls">
                                        <button
                                            className="btn btn-small btn-outline"
                                            onClick={() => moveItemUp(stage)}
                                            disabled={index === 0}
                                            title={t('settings.moveUp')}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            className="btn btn-small btn-outline"
                                            onClick={() => moveItemDown(stage)}
                                            disabled={index === getOrderedStages().length - 1}
                                            title={t('settings.moveDown')}
                                        >
                                            ↓
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="order-help">
                            <p>💡 {t('settings.orderHint')}</p>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="settings-actions">
                    <button
                        className="btn btn-outline"
                        onClick={loadLocalSettings}
                    >
                        🔄 {t('settings.resetDefault')}
                    </button>
                    <button
                        className="btn btn-success"
                        onClick={saveChanges}
                    >
                        💾 {t('settings.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DebateSetting;
