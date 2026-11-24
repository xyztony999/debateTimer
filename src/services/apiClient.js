import axios from 'axios';
import { appPath } from '../utils/baseUrl';
import { GATE_SYNC_PARAM, redirectFor, routePathOf } from '../utils/authRedirect';

export function getApiBaseUrl() {
    const base = import.meta.env.VITE_API_BASE_URL || '';
    return base.replace(/\/$/, '');
}

export const apiClient = axios.create({
    baseURL: getApiBaseUrl(),
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
    // Every status resolves: services branch on the envelope instead of
    // catching, and the interceptor below sees the 401/403 responses too.
    validateStatus: () => true,
});

apiClient.interceptors.response.use((response) => {
    if (typeof window === 'undefined') {
        return response;
    }
    const pathname = window.location.pathname;
    // routePath is relative to the Router basename, so the decision is the
    // same whether the app is served at '/' or under '/app/'.
    const target = redirectFor(response, {
        routePath: routePathOf(pathname, import.meta.env.BASE_URL || '/'),
        pathname,
        search: window.location.search,
        skipAuthRedirect: response.config?.skipAuthRedirect,
    });
    if (target?.to === 'gate') {
        // Signed in, but the account still owes a step. `next` is the bare
        // route (the gate page hands it back to the Router); the sync flag
        // makes that page re-read the account first, because the step list it
        // holds was collected before this 403 and may not contain the step.
        const query = new URLSearchParams({ next: target.next, [GATE_SYNC_PARAM]: '1' });
        window.location.assign(`${appPath('/gate')}?${query.toString()}`);
    } else if (target?.to === 'login') {
        window.location.assign(`/login?next=${encodeURIComponent(target.next)}`);
    }
    return response;
});

export function toServiceError(error, prefix) {
    const message = error.response?.data?.message || error.message || 'Request failed';
    return {
        success: false,
        status: error.response?.status,
        code: error.response?.data?.code ?? null,
        message: `${prefix}: ${message}`,
    };
}

/** Seconds from a `Retry-After` header, or null when there is none. */
export function readRetryAfter(headers) {
    const raw = headers?.['retry-after'] ?? headers?.['Retry-After'];
    const seconds = typeof raw === 'string' ? Number(raw.trim()) : raw;
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/**
 * Turns a request into the one result shape the account, privacy and audit
 * services return:
 *   success → { success: true, data, status }
 *   failure → { success: false, status, code, message, data, retryAfterSec }
 * Callers branch on `code` and `status`, never on the English message, which
 * is only shown when there is no translation for the failure.
 */
export async function unwrap(request, prefix) {
    try {
        const { data, status, headers } = await request;
        if (!data?.success) {
            return {
                success: false,
                status,
                message: data?.message || `Request failed (${status})`,
                code: data?.code ?? null,
                data: data?.data ?? null,
                retryAfterSec: readRetryAfter(headers),
            };
        }
        return { ...data, status };
    } catch (error) {
        return toServiceError(error, prefix);
    }
}
