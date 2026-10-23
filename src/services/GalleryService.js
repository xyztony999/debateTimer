import { apiClient, toServiceError } from './apiClient';
import ConfigurationService from './ConfigurationService';

/**
 * Public template gallery (S-04): anonymous browsing + owner publish switch.
 * Copying = read the gallery detail, then save it under the current user via
 * the existing configuration save endpoint (no server-side copy endpoint).
 */
class GalleryService {
    async listTemplates({ limit = 20, before, q, sort } = {}) {
        try {
            const { data, status } = await apiClient.get('/api/gallery', {
                params: {
                    limit,
                    ...(before ? { before } : {}),
                    ...(q ? { q } : {}),
                    ...(sort && sort !== 'updated' ? { sort } : {}),
                },
                skipAuthRedirect: true,
            });
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            console.error('Error listing gallery templates:', error);
            return toServiceError(error, 'Error listing gallery templates');
        }
    }

    async loadTemplate(id) {
        try {
            const { data, status } = await apiClient.get(
                `/api/gallery/${encodeURIComponent(id)}`,
                { skipAuthRedirect: true },
            );
            if (!data.success) {
                return {
                    success: false,
                    status,
                    notFound: status === 404,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            console.error('Error loading gallery template:', error);
            return toServiceError(error, 'Error loading gallery template');
        }
    }

    async updateVisibility(name, isPublic, creditName) {
        try {
            const { data, status } = await apiClient.post(
                `/api/configurations/${encodeURIComponent(name)}/visibility`,
                { public: isPublic, ...(creditName !== undefined ? { creditName } : {}) },
            );
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            console.error('Error updating gallery visibility:', error);
            return toServiceError(error, 'Error updating gallery visibility');
        }
    }

    async unpublish(id) {
        try {
            const { data, status } = await apiClient.post(
                `/api/gallery/${encodeURIComponent(id)}/unpublish`,
            );
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            console.error('Error unpublishing template:', error);
            return toServiceError(error, 'Error unpublishing template');
        }
    }

    // Popularity signal: fire-and-forget after a successful copy.
    async markCopied(id) {
        try {
            await apiClient.post(`/api/gallery/${encodeURIComponent(id)}/copy`);
        } catch (error) {
            console.warn('Copy count not recorded:', error.message);
        }
    }

    // Read → save under the current user's namespace as an independent copy.
    async copyTemplate(id, targetName) {
        const detail = await this.loadTemplate(id);
        if (!detail.success) {
            return detail;
        }
        const src = detail.data;
        const result = await ConfigurationService.saveConfiguration(
            targetName,
            src.debateStages,
            src.timerSettings,
            src.stageOrder,
            src.stageLabels || {},
            undefined,
            {
                stageGrace: src.stageGrace || {},
                stageAutoAdvance: src.stageAutoAdvance || {},
                teamNames: src.teamNames || {},
            },
        );
        if (result.success) {
            this.markCopied(id);
        }
        return result;
    }
}

export default new GalleryService();
