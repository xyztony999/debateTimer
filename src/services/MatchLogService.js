import { apiClient, getApiBaseUrl, toServiceError } from './apiClient';

function matchLogsPath(id = '') {
    return id ? `/api/match-logs/${encodeURIComponent(id)}` : '/api/match-logs';
}

/**
 * Match record client (S-03): capture buffers are POSTed once per save by the
 * timer page; /records pages consume the read/export/delete endpoints.
 */
class MatchLogService {
    async saveRecord(record) {
        try {
            const { data, status } = await apiClient.post(matchLogsPath(), record);
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            console.error('Error saving match record:', error);
            return toServiceError(error, 'Error saving match record');
        }
    }

    async listRecords({ limit = 20, before } = {}, ownerId) {
        try {
            const params = {
                ...(ownerId ? { ownerId } : {}),
                limit,
                ...(before ? { before } : {}),
            };
            const { data, status } = await apiClient.get(matchLogsPath(), { params });
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true, data: data.data };
        } catch (error) {
            console.error('Error listing match records:', error);
            return toServiceError(error, 'Error listing match records');
        }
    }

    async loadRecord(id, ownerId) {
        try {
            const { data, status } = await apiClient.get(
                matchLogsPath(id),
                ownerId ? { params: { ownerId } } : {},
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
            console.error('Error loading match record:', error);
            return toServiceError(error, 'Error loading match record');
        }
    }

    async deleteRecord(id) {
        try {
            const { data, status } = await apiClient.delete(matchLogsPath(id));
            if (!data.success) {
                return {
                    success: false,
                    status,
                    message: data.message || `Request failed (${status})`,
                };
            }
            return { success: true };
        } catch (error) {
            console.error('Error deleting match record:', error);
            return toServiceError(error, 'Error deleting match record');
        }
    }

    // JSON export is a server attachment; trigger a browser download.
    downloadJsonExport(id) {
        const url = `${getApiBaseUrl()}${matchLogsPath(id)}/export?format=json`;
        window.open(url, '_blank', 'noopener');
    }
}

export default new MatchLogService();
