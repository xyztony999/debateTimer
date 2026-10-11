import { useCallback, useEffect, useRef, useState } from 'react';
import ConfigurationService from '../services/ConfigurationService';
import debateStagesData from '../resources/debateTimeSettings.json';
import timerSettingsData from '../resources/debateTimerSettings.json';
import { TimerSetting } from '../schema/TimerSetting';
import {
    DEFAULT_CONFIGURATION_NAME,
    getStoredConfigurationName,
    setStoredConfigurationName,
} from '../config/configConstants';

function formatTimerSettings(timerSettings) {
    const result = {};
    for (const key in timerSettings) {
        result[key] = TimerSetting[timerSettings[key]];
    }
    return result;
}

export const EMPTY_CONFIG = {
    name: null,
    stages: {},
    modes: {},
    stageOrder: [],
    stageLabels: {},
    stageGrace: {},
    stageAutoAdvance: {},
    teamNames: {},
    shareEnabled: false,
    shareToken: null,
};

/**
 * Loads the active debate configuration and keeps it live:
 * controller pages follow the user's configuration list (SSE), display
 * pages follow the shared token's configuration. Pure data — no timer
 * runtime. The timer hook reacts to `config` identity changes.
 */
export default function useDebateConfig(shareToken = null) {
    const [config, setConfig] = useState(EMPTY_CONFIG);
    // 'loading' | 'ok' | 'missing' | 'error' (display mode); 'ok' for controller.
    const [status, setStatus] = useState(shareToken ? 'loading' : 'ok');
    const nameRef = useRef(DEFAULT_CONFIGURATION_NAME);

    const applyLoadedData = useCallback((configName, data, persistName = true) => {
        nameRef.current = configName;
        setConfig({
            name: configName,
            stages: data.debateStages,
            modes: formatTimerSettings(data.timerSettings),
            stageOrder: data.stageOrder || Object.keys(data.debateStages),
            stageLabels: data.stageLabels || {},
            stageGrace: data.stageGrace || {},
            stageAutoAdvance: data.stageAutoAdvance || {},
            teamNames: data.teamNames || {},
            shareEnabled: Boolean(data.shareEnabled),
            shareToken: data.shareToken || null,
        });
        if (persistName) {
            setStoredConfigurationName(configName);
        }
    }, []);

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

        const initializeConfiguration = async () => {
            try {
                if (shareToken) {
                    const result = await ConfigurationService.loadDisplayConfiguration(shareToken);
                    if (!result.success) {
                        setStatus(result.notFound ? 'missing' : 'error');
                        return;
                    }
                    setStatus('ok');
                    applyLoadedData(result.data.name || DEFAULT_CONFIGURATION_NAME, result.data, false);
                    unsubscribe = ConfigurationService.onDisplayChange(shareToken, async () => {
                        const next = await ConfigurationService.loadDisplayConfiguration(shareToken);
                        if (next.success) {
                            setStatus('ok');
                            applyLoadedData(next.data.name || DEFAULT_CONFIGURATION_NAME, next.data, false);
                        } else {
                            setStatus(next.notFound ? 'missing' : 'error');
                        }
                    });
                    return;
                }

                await ConfigurationService.initializeDefaultConfigurations();

                const listResult = await ConfigurationService.getConfigurations();
                const names = listResult.success
                    ? (listResult.data || []).map((item) => item.name)
                    : [DEFAULT_CONFIGURATION_NAME];

                const preferred = getStoredConfigurationName();
                const target = names.includes(preferred) ? preferred : DEFAULT_CONFIGURATION_NAME;
                await loadConfiguration(target);

                unsubscribe = ConfigurationService.onConfigurationsChange(async (list) => {
                    const nextNames = (list || []).map((item) => item.name);
                    const current = nameRef.current;
                    const stillExists = nextNames.includes(current);
                    const nextTarget = stillExists
                        ? current
                        : (nextNames.includes(DEFAULT_CONFIGURATION_NAME)
                            ? DEFAULT_CONFIGURATION_NAME
                            : nextNames[0]);
                    if (!nextTarget) {
                        return;
                    }
                    await loadConfiguration(nextTarget);
                });
            } catch (error) {
                console.error('Error initializing configuration:', error);
                if (shareToken) {
                    setStatus('error');
                    return;
                }
                // Offline fallback: the bundled default rule set.
                applyLoadedData(DEFAULT_CONFIGURATION_NAME, {
                    debateStages: debateStagesData,
                    timerSettings: timerSettingsData,
                }, false);
            }
        };

        initializeConfiguration();

        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
        };
    }, [shareToken, applyLoadedData, loadConfiguration]);

    return { config, status };
}
