import axios from 'axios';

export function getApiBaseUrl() {
    const base = import.meta.env.VITE_API_BASE_URL || '';
    return base.replace(/\/$/, '');
}

export const apiClient = axios.create({
    baseURL: getApiBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
    validateStatus: () => true,
});

apiClient.interceptors.request.use((config) => {
    const apiKey = import.meta.env.VITE_API_KEY;
    if (apiKey && config.method !== 'get') {
        config.headers['X-API-Key'] = apiKey;
    }
    return config;
});

export function toServiceError(error, prefix) {
    const message = error.response?.data?.message || error.message || 'Request failed';
    return { success: false, message: `${prefix}: ${message}` };
}
