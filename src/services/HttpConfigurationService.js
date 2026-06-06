import { apiClient, getApiBaseUrl, toServiceError } from './apiClient';
import {
    buildConfigurationPayload,
    parseLoadedConfiguration,
    getDefaultSeedPayload,
} from './configurationShared';
import { DEFAULT_CONFIGURATION_NAME } from '../config/configConstants';

function configurationsPath(name = '') {
    return name
        ? `/api/configurations/${encodeURIComponent(name)}`
        : '/api/configurations';
}

class HttpConfigurationService {
    async saveConfiguration(name, debateStages, timerSettings, stageOrder = null, stageLabels = {}) {
        try {
            const { data, status } = await apiClient.put(
                configurationsPath(name),
                buildConfigurationPayload(name, debateStages, timerSettings, stageOrder, stageLabels),
            );
            if (!data.success) {
                return {
                    success: false,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return data;
        } catch (error) {
            console.error('Error saving configuration:', error);
            return toServiceError(error, 'Error saving configuration');
        }
    }

    async loadConfiguration(name) {
        try {
            const { data, status } = await apiClient.get(configurationsPath(name));
            if (!data.success) {
                return {
                    success: false,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return {
                success: true,
                data: parseLoadedConfiguration(data.data),
            };
        } catch (error) {
            console.error('Error loading configuration:', error);
            return toServiceError(error, 'Error loading configuration');
        }
    }

    async getConfigurations() {
        try {
            const { data, status } = await apiClient.get(configurationsPath());
            if (!data.success) {
                return {
                    success: false,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data || [] };
        } catch (error) {
            console.error('Error getting configurations:', error);
            return toServiceError(error, 'Error getting configurations');
        }
    }

    async deleteConfiguration(name) {
        try {
            const { data, status } = await apiClient.delete(configurationsPath(name));
            if (!data.success) {
                return {
                    success: false,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return data;
        } catch (error) {
            console.error('Error deleting configuration:', error);
            return toServiceError(error, 'Error deleting configuration');
        }
    }

    onConfigurationsChange(callback) {
        const streamUrl = `${getApiBaseUrl()}${configurationsPath()}/stream`;
        let eventSource;
        let pollTimer;
        let stopped = false;

        const notify = async () => {
            const result = await this.getConfigurations();
            if (result.success) {
                callback(result.data);
            }
        };

        const startPolling = () => {
            pollTimer = window.setInterval(notify, 5000);
            notify();
        };

        if (typeof EventSource !== 'undefined') {
            eventSource = new EventSource(streamUrl);
            eventSource.addEventListener('change', notify);
            eventSource.onerror = () => {
                eventSource?.close();
                eventSource = null;
                if (!stopped && !pollTimer) {
                    startPolling();
                }
            };
            notify();
        } else {
            startPolling();
        }

        return () => {
            stopped = true;
            eventSource?.close();
            if (pollTimer) {
                window.clearInterval(pollTimer);
            }
        };
    }

    async initializeDefaultConfigurations() {
        try {
            const defaultConfig = await this.loadConfiguration(DEFAULT_CONFIGURATION_NAME);
            if (!defaultConfig.success) {
                const seed = getDefaultSeedPayload();
                await this.saveConfiguration(
                    seed.name,
                    seed.debateStages,
                    seed.timerSettings,
                    seed.stageOrder,
                    seed.stageLabels,
                );
                console.log('Default configuration initialized (v2)');
            }
        } catch (error) {
            console.error('Error initializing default configurations:', error);
        }
    }
}

export default new HttpConfigurationService();
