import { apiClient, toServiceError } from './apiClient';

const skipRedirect = { skipAuthRedirect: true };

async function unwrap(request, prefix) {
    try {
        const { data, status } = await request;
        if (!data?.success) {
            return {
                success: false,
                message: data?.message || `Request failed (${status})`,
            };
        }
        return data;
    } catch (error) {
        return toServiceError(error, prefix);
    }
}

export const authService = {
    status() {
        return unwrap(apiClient.get('/api/auth/status', skipRedirect), 'Auth status');
    },

    me() {
        return unwrap(apiClient.get('/api/auth/me', skipRedirect), 'Current user');
    },

    login(username, password) {
        return unwrap(
            apiClient.post('/api/auth/login', { username, password }, skipRedirect),
            'Login',
        );
    },

    register(username, password) {
        return unwrap(
            apiClient.post('/api/auth/register', { username, password }, skipRedirect),
            'Register',
        );
    },

    logout() {
        return unwrap(apiClient.post('/api/auth/logout', {}, skipRedirect), 'Logout');
    },
};
