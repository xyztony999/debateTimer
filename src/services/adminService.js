import { apiClient, toServiceError } from './apiClient';

export async function listUsers() {
    try {
        const { data, status } = await apiClient.get('/api/admin/users');
        if (!data.success) {
            return { success: false, message: data.message || `Request failed (${status})` };
        }
        return { success: true, data: data.data || [] };
    } catch (error) {
        return toServiceError(error, 'List users');
    }
}

export async function createUser(payload) {
    try {
        const { data, status } = await apiClient.post('/api/admin/users', payload);
        if (!data.success) {
            return { success: false, message: data.message || `Request failed (${status})` };
        }
        return data;
    } catch (error) {
        return toServiceError(error, 'Create user');
    }
}

export async function updateUser(id, payload) {
    try {
        const { data, status } = await apiClient.patch(`/api/admin/users/${encodeURIComponent(id)}`, payload);
        if (!data.success) {
            return { success: false, message: data.message || `Request failed (${status})` };
        }
        return data;
    } catch (error) {
        return toServiceError(error, 'Update user');
    }
}

export async function deleteUser(id) {
    try {
        const { data, status } = await apiClient.delete(`/api/admin/users/${encodeURIComponent(id)}`);
        if (!data.success) {
            return { success: false, message: data.message || `Request failed (${status})` };
        }
        return data;
    } catch (error) {
        return toServiceError(error, 'Delete user');
    }
}

export async function listAllConfigurations() {
    try {
        const { data, status } = await apiClient.get('/api/admin/configurations');
        if (!data.success) {
            return { success: false, message: data.message || `Request failed (${status})` };
        }
        return { success: true, data: data.data || [] };
    } catch (error) {
        return toServiceError(error, 'List configurations');
    }
}

export async function deleteConfigurationById(id) {
    try {
        const { data, status } = await apiClient.delete(
            `/api/admin/configurations/${encodeURIComponent(id)}`,
        );
        if (!data.success) {
            return { success: false, message: data.message || `Request failed (${status})` };
        }
        return data;
    } catch (error) {
        return toServiceError(error, 'Delete configuration');
    }
}
