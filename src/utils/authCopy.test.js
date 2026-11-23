import { test, expect } from 'bun:test';
import { registerCopyKeys } from './authCopy.js';

test('registerCopyKeys: public registration never points at the first-admin wording', () => {
    expect(registerCopyKeys(true)).toEqual({
        titleKey: 'auth.registerTitle',
        subtitleKey: 'auth.registerSubtitle',
    });
});

test('registerCopyKeys: a deployment with no users gets the first-admin setup wording', () => {
    expect(registerCopyKeys(false)).toEqual({
        titleKey: 'auth.firstUserTitle',
        subtitleKey: 'auth.firstUserSubtitle',
    });
});
