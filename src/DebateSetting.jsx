import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import debateStagesData from './resources/debateTimeSettings.json';
import timerSettingsData from './resources/debateTimerSettings.json';
import ConfigurationService from './services/ConfigurationService';
import {
    DEFAULT_CONFIGURATION_NAME,
    getStoredConfigurationName,
    setStoredConfigurationName,
} from './config/configConstants';
import LanguageSwitcher from './components/LanguageSwitcher';
import { stageDisplayName } from './utils/stageDisplayName';

/** Generate a short unique ID for custom stages. */
function generateCustomId() {
    return `custom_${Date.now().toString(36)}`;
}

const EMPTY_LABELS = { 'zh-Hans': '', 'en': '', 'fr-CA': '' };

function buildConfigSnapshot(debateStages, timerSettings, stageLabels, stageOrder) {
    return JSON.stringify({ debateStages, timerSettings, stageLabels, stageOrder });
}

const DebateSetting = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const [debateStages, setDebateStages] = useState({});
    const [timerSettings, setTimerSettings] = useState({});
    const [stageLabels, setStageLabels] = useState({});     // { [customId]: { 'zh-Hans', 'en', 'fr-CA' } }
    const [stageOrder, setStageOrder] = useState([]);

    const [configurationNames, setConfigurationNames] = useState([]);
    const [selectedConfigName, setSelectedConfigName] = useState(DEFAULT_CONFIGURATION_NAME);
    const [newTemplateName, setNewTemplateName] = useState('');
    const savedSnapshotRef = useRef('');

    // Add-stage form state
    const [newItemLabels, setNewItemLabels] = useState({ ...EMPTY_LABELS });
    const [newItemTime, setNewItemTime] = useState(60);
    const [newItemMode, setNewItemMode] = useState('single');

    const [draggedItem, setDraggedItem] = useState(null);
    const [dragOverItem, setDragOverItem] = useState(null);

    const markClean = useCallback((stages, settings, labels, order) => {
        savedSnapshotRef.current = buildConfigSnapshot(stages, settings, labels, order);
    }, []);

    const isDirty = useCallback(() => (
        savedSnapshotRef.current !== buildConfigSnapshot(
            debateStages,
            timerSettings,
            stageLabels,
            stageOrder,
        )
    ), [debateStages, timerSettings, stageLabels, stageOrder]);

    const getOrderedStages = () => {
        if (stageOrder.length > 0) {
            const orderedStages = [];
            stageOrder.forEach(stage => {
                if (debateStages.hasOwnProperty(stage)) orderedStages.push(stage);
            });
            Object.keys(debateStages).forEach(stage => {
                if (!stageOrder.includes(stage)) orderedStages.push(stage);
            });
            return orderedStages;
        }
        return Object.keys(debateStages);
    };

    const applyConfigData = useCallback((data) => {
        const labels = data.stageLabels || {};
        const order = data.stageOrder || Object.keys(data.debateStages);
        setDebateStages(data.debateStages);
        setTimerSettings(data.timerSettings);
        setStageLabels(labels);
        setStageOrder(order);
        markClean(data.debateStages, data.timerSettings, labels, order);
    }, [markClean]);

    const applyLocalFallback = useCallback(() => {
        const order = Object.keys(debateStagesData);
        setDebateStages(debateStagesData);
        setTimerSettings(timerSettingsData);
        setStageLabels({});
        setStageOrder(order);
        markClean(debateStagesData, timerSettingsData, {}, order);
    }, [markClean]);

    const refreshConfigurationList = useCallback(async () => {
        const listResult = await ConfigurationService.getConfigurations();
        if (listResult.success) {
            const names = (listResult.data || []).map((item) => item.name);
            setConfigurationNames(names);
            return names;
        }
        return null;
    }, []);

    const loadConfigByName = useCallback(async (name) => {
        const result = await ConfigurationService.loadConfiguration(name);
        if (result.success) {
            applyConfigData(result.data);
            setSelectedConfigName(name);
            setStoredConfigurationName(name);
            return true;
        }
        return false;
    }, [applyConfigData]);

    useEffect(() => {
        document.body.className = 'settings-body';
        return () => { document.body.className = ''; };
    }, []);

    useEffect(() => {
        const initializeSettings = async () => {
            try {
                await ConfigurationService.initializeDefaultConfigurations();
                const names = await refreshConfigurationList() || [DEFAULT_CONFIGURATION_NAME];
                const preferred = getStoredConfigurationName();
                const target = names.includes(preferred) ? preferred : DEFAULT_CONFIGURATION_NAME;
                const loaded = await loadConfigByName(target);
                if (!loaded) {
                    applyLocalFallback();
                    setSelectedConfigName(DEFAULT_CONFIGURATION_NAME);
                }
            } catch (error) {
                console.error('Error initializing settings:', error);
                applyLocalFallback();
                setSelectedConfigName(DEFAULT_CONFIGURATION_NAME);
            }
        };
        initializeSettings();
    }, [refreshConfigurationList, loadConfigByName, applyLocalFallback]);

    const handleTemplateSelect = async (event) => {
        const name = event.target.value;
        if (name === selectedConfigName) return;
        if (isDirty() && !window.confirm(t('settings.confirmSwitchTemplate'))) {
            return;
        }
        const loaded = await loadConfigByName(name);
        if (!loaded) {
            alert(t('settings.templateLoadFailed', { name }));
        }
    };

    const createTemplate = async () => {
        const name = newTemplateName.trim();
        if (!name) {
            alert(t('settings.templateNameRequired'));
            return;
        }
        if (configurationNames.includes(name)) {
            alert(t('settings.templateExists'));
            return;
        }

        try {
            const result = await ConfigurationService.saveConfiguration(
                name,
                debateStages,
                timerSettings,
                stageOrder,
                stageLabels,
            );
            if (!result.success) {
                alert(t('settings.templateCreateFailed', { message: result.message }));
                return;
            }
            setNewTemplateName('');
            await refreshConfigurationList();
            setSelectedConfigName(name);
            setStoredConfigurationName(name);
            markClean(debateStages, timerSettings, stageLabels, stageOrder);
            alert(t('settings.templateCreated', { name }));
        } catch (error) {
            console.error('Error creating template:', error);
            alert(t('settings.templateCreateRetry'));
        }
    };

    const deleteTemplate = async () => {
        if (selectedConfigName === DEFAULT_CONFIGURATION_NAME) {
            alert(t('settings.templateCannotDeleteDefault'));
            return;
        }
        if (!window.confirm(t('settings.confirmDeleteTemplate', { name: selectedConfigName }))) {
            return;
        }

        const deletedName = selectedConfigName;
        try {
            const result = await ConfigurationService.deleteConfiguration(selectedConfigName);
            if (!result.success) {
                alert(t('settings.templateDeleteFailed', { message: result.message }));
                return;
            }
            const names = await refreshConfigurationList() || [DEFAULT_CONFIGURATION_NAME];
            const next = names.includes(DEFAULT_CONFIGURATION_NAME)
                ? DEFAULT_CONFIGURATION_NAME
                : (names[0] || DEFAULT_CONFIGURATION_NAME);
            const loaded = await loadConfigByName(next);
            if (!loaded) {
                applyLocalFallback();
                setSelectedConfigName(next);
                setStoredConfigurationName(next);
            }
            alert(t('settings.templateDeleted', { name: deletedName, next }));
        } catch (error) {
            console.error('Error deleting template:', error);
            alert(t('settings.templateDeleteRetry'));
        }
    };

    const handleDebateStageChange = (key, value) => {
        setDebateStages({ ...debateStages, [key]: value });
    };

    const handleTimerSettingChange = (key, value) => {
        setTimerSettings({ ...timerSettings, [key]: value });
    };

    const saveChanges = async () => {
        try {
            const result = await ConfigurationService.saveConfiguration(
                selectedConfigName,
                debateStages,
                timerSettings,
                stageOrder,
                stageLabels,
            );
            if (result.success) {
                markClean(debateStages, timerSettings, stageLabels, stageOrder);
                alert(t('settings.savedSuccess', { name: selectedConfigName }));
            } else {
                alert(t('settings.saveFailed', { message: result.message }));
            }
        } catch (error) {
            console.error('Error saving configuration:', error);
            alert(t('settings.saveRetry'));
        }
    };

    const loadLocalSettings = () => {
        if (!window.confirm(t('settings.confirmReset'))) {
            return;
        }
        setDebateStages(debateStagesData);
        setTimerSettings(timerSettingsData);
        setStageLabels({});
        setStageOrder(Object.keys(debateStagesData));
    };

    const addTimerItem = () => {
        const hasAnyLabel = Object.values(newItemLabels).some(v => v.trim());
        if (!hasAnyLabel) {
            alert(t('settings.labelRequired'));
            return;
        }

        const id = generateCustomId();

        // Trim labels and drop empty values
        const trimmedLabels = {};
        Object.entries(newItemLabels).forEach(([lang, val]) => {
            if (val.trim()) trimmedLabels[lang] = val.trim();
        });

        setDebateStages(prev => ({ ...prev, [id]: newItemTime }));
        setTimerSettings(prev => ({ ...prev, [id]: newItemMode }));
        setStageLabels(prev => ({ ...prev, [id]: trimmedLabels }));
        setStageOrder(prev => [...prev, id]);

        setNewItemLabels({ ...EMPTY_LABELS });
        setNewItemTime(60);
        setNewItemMode('single');
    };

    const deleteTimerItem = (itemName) => {
        if (window.confirm(t('settings.confirmDelete', {
            name: stageDisplayName(t, itemName, stageLabels, i18n.language),
        }))) {
            const newDebateStages = { ...debateStages };
            const newTimerSettings = { ...timerSettings };
            const newStageLabels = { ...stageLabels };

            delete newDebateStages[itemName];
            delete newTimerSettings[itemName];
            delete newStageLabels[itemName];

            setDebateStages(newDebateStages);
            setTimerSettings(newTimerSettings);
            setStageLabels(newStageLabels);
            setStageOrder(prev => prev.filter(stage => stage !== itemName));
        }
    };

    const handleDragStart = (e, itemName) => {
        setDraggedItem(itemName);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e, itemName) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOverItem(itemName);
    };

    const handleDragLeave = () => { setDragOverItem(null); };

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
        currentOrder.splice(draggedIndex, 1);
        currentOrder.splice(targetIndex, 0, draggedItem);
        setStageOrder(currentOrder);
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const handleDragEnd = () => {
        setDraggedItem(null);
        setDragOverItem(null);
    };

    const moveItemUp = (itemName) => {
        const currentOrder = [...stageOrder];
        const index = currentOrder.indexOf(itemName);
        if (index > 0) {
            [currentOrder[index], currentOrder[index - 1]] = [currentOrder[index - 1], currentOrder[index]];
            setStageOrder(currentOrder);
        }
    };

    const moveItemDown = (itemName) => {
        const currentOrder = [...stageOrder];
        const index = currentOrder.indexOf(itemName);
        if (index < currentOrder.length - 1) {
            [currentOrder[index], currentOrder[index + 1]] = [currentOrder[index + 1], currentOrder[index]];
            setStageOrder(currentOrder);
        }
    };

    const displayName = (stage) =>
        stageDisplayName(t, stage, stageLabels, i18n.language);

    return (
        <div className="modern-settings-container">
            {/* Header */}
            <div className="settings-header">
                <div className="header-content">
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

                {/* Template Management Card */}
                <div className="settings-card">
                    <div className="card-header">
                        <h2 className="card-title">📋 {t('settings.templateTitle')}</h2>
                        <p className="card-description">{t('settings.templateDesc')}</p>
                    </div>
                    <div className="card-content">
                        <div className="template-manager">
                            <div className="form-row">
                                <div className="form-field form-field--grow">
                                    <label className="setting-label" htmlFor="template-select">
                                        {t('settings.templateCurrent')}
                                    </label>
                                    <select
                                        id="template-select"
                                        className="modern-select"
                                        value={selectedConfigName}
                                        onChange={handleTemplateSelect}
                                    >
                                        {configurationNames.map((name) => (
                                            <option key={name} value={name}>{name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-field">
                                    <label className="setting-label">&nbsp;</label>
                                    <button
                                        type="button"
                                        className="btn btn-danger"
                                        onClick={deleteTemplate}
                                        disabled={selectedConfigName === DEFAULT_CONFIGURATION_NAME}
                                        title={
                                            selectedConfigName === DEFAULT_CONFIGURATION_NAME
                                                ? t('settings.templateCannotDeleteDefault')
                                                : t('settings.templateDeleteTitle')
                                        }
                                    >
                                        🗑️ {t('settings.templateDelete')}
                                    </button>
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-field form-field--grow">
                                    <label className="setting-label" htmlFor="new-template-name">
                                        {t('settings.templateNewName')}
                                    </label>
                                    <input
                                        id="new-template-name"
                                        type="text"
                                        className="modern-input"
                                        value={newTemplateName}
                                        onChange={(e) => setNewTemplateName(e.target.value)}
                                        placeholder={t('settings.templateNamePlaceholder')}
                                        maxLength={60}
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="setting-label">&nbsp;</label>
                                    <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={createTemplate}
                                    >
                                        ➕ {t('settings.templateCreate')}
                                    </button>
                                </div>
                            </div>
                            <p className="template-hint">💡 {t('settings.templateHint')}</p>
                        </div>
                    </div>
                </div>

                {/* Duration Settings Card */}
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
                                            {displayName(stage)}
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
                                    <label className="setting-label">{displayName(stage)}</label>
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
                            {/* Language name inputs */}
                            <div className="form-row form-row--labels">
                                <div className="form-field">
                                    <label className="setting-label">🇨🇳 {t('settings.labelZh')}</label>
                                    <input
                                        type="text"
                                        className="modern-input"
                                        value={newItemLabels['zh-Hans']}
                                        onChange={(e) => setNewItemLabels(prev => ({ ...prev, 'zh-Hans': e.target.value }))}
                                        placeholder={t('settings.placeholderLabelZh')}
                                        maxLength="40"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="setting-label">🇨🇦 {t('settings.labelEn')}</label>
                                    <input
                                        type="text"
                                        className="modern-input"
                                        value={newItemLabels['en']}
                                        onChange={(e) => setNewItemLabels(prev => ({ ...prev, 'en': e.target.value }))}
                                        placeholder={t('settings.placeholderLabelEn')}
                                        maxLength="40"
                                    />
                                </div>
                                <div className="form-field">
                                    <label className="setting-label">🇫🇷 {t('settings.labelFr')}</label>
                                    <input
                                        type="text"
                                        className="modern-input"
                                        value={newItemLabels['fr-CA']}
                                        onChange={(e) => setNewItemLabels(prev => ({ ...prev, 'fr-CA': e.target.value }))}
                                        placeholder={t('settings.placeholderLabelFr')}
                                        maxLength="40"
                                    />
                                </div>
                            </div>

                            {/* Duration / mode / submit */}
                            <div className="form-row">
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
                                    <div className="stage-name">{displayName(stage)}</div>
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
                    <button className="btn btn-outline" onClick={loadLocalSettings}>
                        🔄 {t('settings.resetDefault')}
                    </button>
                    <button className="btn btn-success" onClick={saveChanges}>
                        💾 {t('settings.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DebateSetting;
