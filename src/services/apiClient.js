import axios from 'axios';

export function getApiBaseUrl() {
    const base = import.meta.env.VITE_API_BASE_URL || '';
    return base.replace(/\/$/, '');
}

function isPublicPath(pathname) {
    return pathname.startsWith('/login') || pathname.startsWith('/display');
}

export const apiClient = axios.create({
    baseURL: getApiBaseUrl(),
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
    validateStatus: () => true,
});

apiClient.interceptors.response.use((response) => {
    if (response.status === 401 && !response.config?.skipAuthRedirect && typeof window !== 'undefined') {
        const path = window.location.pathname;
        if (!isPublicPath(path)) {
            const next = `${path}${window.location.search}`;
            window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        }
    }
    return response;
});

export function toServiceError(error, prefix) {
    const message = error.response?.data?.message || error.message || 'Request failed';
    return { success: false, message: `${prefix}: ${message}` };
}
