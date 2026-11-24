import { describe, it, expect } from 'bun:test';
import {
    GATE_REQUIRED_CODE,
    isPublicRoute,
    redirectFor,
    routePathOf,
} from './authRedirect.js';

const here = { routePath: '/settings', pathname: '/settings', search: '?ownerId=a' };

describe('routePathOf', () => {
    it('is a no-op for the default base', () => {
        expect(routePathOf('/settings', '/')).toBe('/settings');
        expect(routePathOf('/settings', '')).toBe('/settings');
        expect(routePathOf('/')).toBe('/');
    });

    it('strips the /app base of the Pages build', () => {
        expect(routePathOf('/app/settings', '/app/')).toBe('/settings');
        expect(routePathOf('/app/gate', '/app/')).toBe('/gate');
        expect(routePathOf('/app', '/app/')).toBe('/');
    });
});

describe('isPublicRoute', () => {
    it('treats sign-in, gate, display and gallery as places an anonymous visitor may be', () => {
        expect(isPublicRoute('/login')).toBe(true);
        expect(isPublicRoute('/gate')).toBe(true);
        expect(isPublicRoute('/display/abc')).toBe(true);
        expect(isPublicRoute('/gallery')).toBe(true);
        expect(isPublicRoute('/gallery/abc')).toBe(true);
    });

    it('treats every business route as protected', () => {
        expect(isPublicRoute('/')).toBe(false);
        expect(isPublicRoute('/settings')).toBe(false);
        expect(isPublicRoute('/admin')).toBe(false);
        expect(isPublicRoute('/records/abc')).toBe(false);
        expect(isPublicRoute('/gateway')).toBe(false);
    });
});

describe('redirectFor: 403 GATE_REQUIRED', () => {
    const gated = { status: 403, data: { success: false, code: GATE_REQUIRED_CODE, gates: ['privacy_consent'] } };

    it('sends a gated account to the gate page with the current route as next', () => {
        expect(redirectFor(gated, here)).toEqual({ to: 'gate', next: '/settings?ownerId=a' });
        expect(redirectFor(gated, { routePath: '/', pathname: '/app/', search: '' }))
            .toEqual({ to: 'gate', next: '/' });
    });

    it('does not redirect when already on the gate page', () => {
        expect(redirectFor(gated, { routePath: '/gate', pathname: '/app/gate', search: '?next=%2F' })).toBeNull();
    });

    it('ignores other 403s such as "admin access required"', () => {
        expect(redirectFor({ status: 403, data: { success: false, message: 'Admin access required' } }, here)).toBeNull();
        expect(redirectFor({ status: 403, data: null }, here)).toBeNull();
    });

    it('is skipped for requests marked skipAuthRedirect', () => {
        expect(redirectFor(gated, { ...here, skipAuthRedirect: true })).toBeNull();
    });
});

describe('redirectFor: 401', () => {
    const signedOut = { status: 401, data: { success: false, message: 'Authentication required' } };

    it('sends an expired session from a business route to the login page', () => {
        expect(redirectFor(signedOut, { routePath: '/settings', pathname: '/app/settings', search: '?x=1' }))
            .toEqual({ to: 'login', next: '/app/settings?x=1' });
    });

    it('never redirects on public routes, including the gate page', () => {
        for (const routePath of ['/login', '/gate', '/display/abc', '/gallery']) {
            expect(redirectFor(signedOut, { routePath, pathname: routePath, search: '' })).toBeNull();
        }
    });

    it('ignores successes and other failures', () => {
        expect(redirectFor({ status: 200, data: { success: true } }, here)).toBeNull();
        expect(redirectFor({ status: 500, data: { success: false } }, here)).toBeNull();
        expect(redirectFor(null, here)).toBeNull();
    });
});
