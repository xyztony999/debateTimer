import { describe, it, expect } from 'bun:test';
import { gateExitPath, isGatePath, safeNextPath } from './safeNextPath.js';

describe('safeNextPath（默认 base=/）', () => {
    it('accepts an in-app path with or without a query string', () => {
        expect(safeNextPath('/')).toBe('/');
        expect(safeNextPath('/settings')).toBe('/settings');
        expect(safeNextPath('/settings?ownerId=a&name=b')).toBe('/settings?ownerId=a&name=b');
        expect(safeNextPath('/display/abc#x')).toBe('/display/abc#x');
    });

    it('falls back to the home route for anything that is not an in-app path', () => {
        expect(safeNextPath(null)).toBe('/');
        expect(safeNextPath(undefined)).toBe('/');
        expect(safeNextPath('')).toBe('/');
        expect(safeNextPath('settings')).toBe('/');
        expect(safeNextPath('https://evil.example/')).toBe('/');
        expect(safeNextPath('//evil.example/')).toBe('/');
        // A backslash is normalised to "/" by browsers, which would turn
        // "/\evil.example" into the protocol-relative "//evil.example".
        expect(safeNextPath('/\\evil.example')).toBe('/');
    });
});

describe('safeNextPath under the /app/ deploy base', () => {
    it('removes the base so the Router does not add it twice', () => {
        expect(safeNextPath('/app/settings', '/app/')).toBe('/settings');
        expect(safeNextPath('/app/settings?ownerId=a', '/app/')).toBe('/settings?ownerId=a');
        expect(safeNextPath('/app', '/app/')).toBe('/');
        expect(safeNextPath('/app/', '/app/')).toBe('/');
    });

    it('leaves a bare route path untouched', () => {
        expect(safeNextPath('/settings', '/app/')).toBe('/settings');
        expect(safeNextPath('/', '/app/')).toBe('/');
    });

    it('does not strip a look-alike prefix', () => {
        expect(safeNextPath('/application/settings', '/app/')).toBe('/application/settings');
    });

    it('still rejects protocol-relative URLs when the base is present', () => {
        expect(safeNextPath('//evil.example', '/app/')).toBe('/');
        // Removing the base would leave "//evil.example" behind.
        expect(safeNextPath('/app//evil.example', '/app/')).toBe('/');
        expect(safeNextPath('/app/\\evil.example', '/app/')).toBe('/');
    });
});

describe('gateExitPath', () => {
    it('returns the validated next path', () => {
        expect(gateExitPath('/records', '')).toBe('/records');
        expect(gateExitPath('/app/records', '/app/')).toBe('/records');
        expect(gateExitPath(null)).toBe('/');
    });

    it('sends an account home when next points back at the gate', () => {
        expect(gateExitPath('/gate')).toBe('/');
        expect(gateExitPath('/gate?next=%2Frecords')).toBe('/');
        expect(gateExitPath('/gate#x')).toBe('/');
        expect(gateExitPath('/app/gate', '/app/')).toBe('/');
    });

    it('does not mistake other routes starting with "gate" for the gate page', () => {
        expect(gateExitPath('/gateway')).toBe('/gateway');
        expect(isGatePath('/gateway')).toBe(false);
        expect(isGatePath('/gate?x=1')).toBe(true);
    });
});
