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

function ownerParams(ownerId) {
    return ownerId ? { params: { ownerId } } : {};
}

function attachShareMeta(parsed, raw) {
    return {
        ...parsed,
        shareEnabled: Boolean(raw?.shareEnabled),
        shareToken: raw?.shareToken || null,
        ownerId: raw?.ownerId || null,
    };
}

class ConfigurationService {
    async saveConfiguration(name, debateStages, timerSettings, stageOrder = null, stageLabels = {}, ownerId) {
        try {
            const { data, status } = await apiClient.put(
                configurationsPath(name),
                buildConfigurationPayload(name, debateStages, timerSettings, stageOrder, stageLabels),
                ownerParams(ownerId),
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

    async loadConfiguration(name, ownerId) {
        try {
            const { data, status } = await apiClient.get(
                configurationsPath(name),
                ownerParams(ownerId),
            );
            if (!data.success) {
                return {
                    success: false,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return {
                success: true,
                data: attachShareMeta(parseLoadedConfiguration(data.data), data.data),
            };
        } catch (error) {
            console.error('Error loading configuration:', error);
            return toServiceError(error, 'Error loading configuration');
        }
    }

    async getConfigurations(ownerId) {
        try {
            const { data, status } = await apiClient.get(
                configurationsPath(),
                ownerParams(ownerId),
            );
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

    async deleteConfiguration(name, ownerId) {
        try {
            const { data, status } = await apiClient.delete(
                configurationsPath(name),
                ownerParams(ownerId),
            );
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

    async updateShare(name, body, ownerId) {
        try {
            const { data, status } = await apiClient.post(
                `${configurationsPath(name)}/share`,
                body,
                ownerParams(ownerId),
            );
            if (!data.success) {
                return {
                    success: false,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return data;
        } catch (error) {
            console.error('Error updating share link:', error);
            return toServiceError(error, 'Error updating share link');
        }
    }

    async loadDisplayConfiguration(token) {
        try {
            const { data, status } = await apiClient.get(
                `/api/display/${encodeURIComponent(token)}`,
                { skipAuthRedirect: true },
            );
            if (!data.success) {
                return {
                    success: false,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return {
                success: true,
                data: {
                    ...parseLoadedConfiguration(data.data),
                    name: data.data?.name,
                },
            };
        } catch (error) {
            console.error('Error loading display configuration:', error);
            return toServiceError(error, 'Error loading display configuration');
        }
    }

    onConfigurationsChange(callback, ownerId) {
        const query = ownerId ? `?ownerId=${encodeURIComponent(ownerId)}` : '';
        const streamUrl = `${getApiBaseUrl()}${configurationsPath()}/stream${query}`;
        return this.#listen(streamUrl, true, async () => {
            const result = await this.getConfigurations(ownerId);
            if (result.success) {
                callback(result.data);
            }
        });
    }

    onDisplayChange(token, callback) {
        const streamUrl = `${getApiBaseUrl()}/api/display/${encodeURIComponent(token)}/stream`;
        return this.#listen(streamUrl, false, callback);
    }

    #listen(streamUrl, withCredentials, notify) {
        let eventSource;
        let pollTimer;
        let stopped = false;

        const startPolling = () => {
            pollTimer = window.setInterval(notify, 5000);
            notify();
        };

        if (typeof EventSource !== 'undefined') {
            eventSource = new EventSource(streamUrl, { withCredentials });
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

    async initializeDefaultConfigurations(ownerId) {
        try {
            const defaultConfig = await this.loadConfiguration(DEFAULT_CONFIGURATION_NAME, ownerId);
            if (!defaultConfig.success) {
                const seed = getDefaultSeedPayload();
                await this.saveConfiguration(
                    seed.name,
                    seed.debateStages,
                    seed.timerSettings,
                    seed.stageOrder,
                    seed.stageLabels,
                    ownerId,
                );
                console.log('Default configuration initialized (v2)');
            }
        } catch (error) {
            console.error('Error initializing default configurations:', error);
        }
    }
}

export default new ConfigurationService();
