import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import debateStagesData from './resources/debateTimeSettings.json';
import timerSettingsData from './resources/debateTimerSettings.json';
import ConfigurationService from './services/ConfigurationService';

const DebateSetting = () => {
    const navigate = useNavigate();
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
                const defaultConfig = await ConfigurationService.loadConfiguration('默认配置');
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
                '默认配置',
                debateStages,
                timerSettings,
                stageOrder
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
        setStageOrder(Object.keys(debateStagesData));
    }

    // 添加新的计时项目
    const addTimerItem = () => {
        if (!newItemName.trim()) {
            alert('请输入计时项目名称');
            return;
        }

        if (debateStages.hasOwnProperty(newItemName)) {
            alert('该计时项目已存在');
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
        if (window.confirm(`确定要删除计时项目"${itemName}"吗？`)) {
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
                            {getOrderedStages().map((stage, index) => {
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
                            {getOrderedStages().map((stage, index) => (
                                <div key={index} className="setting-item">
                                    <label className="setting-label">{stage}</label>
                                    <div className="input-group">
                                        <select
                                            className="modern-select"
                                            value={timerSettings[stage]}
                                            onChange={(e) => handleTimerSettingChange(stage, e.target.value)}
                                        >
                                            <option value="single">🎯 单计时器</option>
                                            <option value="double">⚖️ 双计时器</option>
                                        </select>
                                        <button
                                            className="btn btn-danger btn-small"
                                            onClick={() => deleteTimerItem(stage)}
                                            title="删除此项目"
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
                        <h2 className="card-title">➕ 添加计时项目</h2>
                        <p className="card-description">添加新的辩论阶段计时项目</p>
                    </div>
                    <div className="card-content">
                        <div className="add-item-form">
                            <div className="form-row">
                                <div className="form-field">
                                    <label className="setting-label">项目名称</label>
                                    <input
                                        type="text"
                                        className="modern-input"
                                        value={newItemName}
                                        onChange={(e) => setNewItemName(e.target.value)}
                                        placeholder="例如：自由辩论准备"
                                        maxLength="20"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="setting-label">时间长度（秒）</label>
                                    <input
                                        type="number"
                                        className="modern-input"
                                        value={newItemTime}
                                        onChange={(e) => setNewItemTime(parseInt(e.target.value) || 0)}
                                        min="1"
                                        max="3600"
                                        placeholder="60"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="setting-label">计时模式</label>
                                    <select
                                        className="modern-select"
                                        value={newItemMode}
                                        onChange={(e) => setNewItemMode(e.target.value)}
                                    >
                                        <option value="single">🎯 单计时器</option>
                                        <option value="double">⚖️ 双计时器</option>
                                    </select>
                                </div>
                                <div className="form-field">
                                    <button
                                        className="btn btn-primary"
                                        onClick={addTimerItem}
                                    >
                                        ➕ 添加项目
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Timer Order Management Card */}
                <div className="settings-card">
                    <div className="card-header">
                        <h2 className="card-title">🔀 调整顺序</h2>
                        <p className="card-description">拖拽项目或使用箭头按钮调整计时器的执行顺序</p>
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
                                    <div className="stage-name">{stage}</div>
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
                                            title="上移"
                                        >
                                            ↑
                                        </button>
                                        <button
                                            className="btn btn-small btn-outline"
                                            onClick={() => moveItemDown(stage)}
                                            disabled={index === getOrderedStages().length - 1}
                                            title="下移"
                                        >
                                            ↓
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="order-help">
                            <p>💡 提示：拖拽项目可以快速调整顺序，或使用箭头按钮精确移动</p>
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
                        💾 保存
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DebateSetting;
