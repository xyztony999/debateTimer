import { createSseHub } from './sseHub.js';
import { hashSessionToken } from './session.js';
import {
    canAccessConfig,
    isRegistrationOpen,
    parseAllowRegistration,
    publicUser,
    resolveOwnerId,
} from './authPolicy.js';
import { isShareVisible, toDisplayResponse } from './configDocs.js';
import { toOwnedConfiguration } from './migrateConfigurations.js';
import {
    hashPassword,
    normalizeUsername,
    validatePassword,
    validateUsername,
    verifyPassword,
} from './password.js';

test('normalizes and validates usernames', () => {
    expect(normalizeUsername('  Alice_1 ')).toBe('alice_1');
    expect(validateUsername('ab')).toBeTruthy();
    expect(validateUsername('alice_1')).toBeNull();
    expect(validateUsername('Alice')).toBeTruthy();
});

test('validates password length', () => {
    expect(validatePassword('short')).toBeTruthy();
    expect(validatePassword('longenough')).toBeNull();
});

test('registration is open until the first user exists', () => {
    expect(isRegistrationOpen(0, false)).toBe(true);
    expect(isRegistrationOpen(1, false)).toBe(false);
    expect(isRegistrationOpen(1, true)).toBe(true);
    expect(parseAllowRegistration('true')).toBe(true);
    expect(parseAllowRegistration('0')).toBe(false);
});

test('owner isolation: users only access their own configs', () => {
    const alice = { id: 'a1', role: 'user' };
    const bob = { id: 'b2', role: 'user' };
    const admin = { id: 'z9', role: 'admin' };
    const doc = { ownerId: 'a1', name: '默认配置' };

    expect(canAccessConfig(alice, doc)).toBe(true);
    expect(canAccessConfig(bob, doc)).toBe(false);
    expect(canAccessConfig(admin, doc)).toBe(true);
    expect(resolveOwnerId(alice, 'b2')).toBe('a1');
    expect(resolveOwnerId(admin, 'b2')).toBe('b2');
});

test('disabled share tokens are not publicly visible', () => {
    const hidden = { shareEnabled: false, shareToken: 'abc', name: 'secret', debateStages: {} };
    const visible = { shareEnabled: true, shareToken: 'abc', name: 'public', debateStages: { a: 1 } };

    expect(isShareVisible(hidden)).toBe(false);
    expect(isShareVisible(visible)).toBe(true);

    const payload = toDisplayResponse(visible);
    expect(payload).not.toHaveProperty('ownerId');
    expect(payload).not.toHaveProperty('shareToken');
    expect(payload.name).toBe('public');
});

test('session tokens are hashed so a db leak is not enough', () => {
    const token = 'plain-session-token';
    const hashed = hashSessionToken(token);
    expect(hashed).not.toBe(token);
    expect(hashed).toHaveLength(64);
    expect(hashSessionToken(token)).toBe(hashed);
});

test('legacy configs keep their name when attached to an owner', () => {
    const owned = toOwnedConfiguration({ _id: '默认配置', debateStages: { a: 1 } }, 'owner1', 1);
    expect(owned.name).toBe('默认配置');
    expect(owned.ownerId).toBe('owner1');
    expect(owned._legacyStringId).toBe(true);
    expect(owned.shareEnabled).toBe(false);
});

test('publicUser never includes the password hash', () => {
    const user = publicUser({
        _id: '507f1f77bcf86cd799439011',
        username: 'alice',
        role: 'admin',
        passwordHash: 'secret',
    });
    expect(user).toEqual({
        id: '507f1f77bcf86cd799439011',
        username: 'alice',
        role: 'admin',
    });
    expect(user).not.toHaveProperty('passwordHash');
});

test('passwords are hashed and verified', async () => {
    const hash = await hashPassword('correct-horse');
    expect(hash).not.toBe('correct-horse');
    expect(await verifyPassword('correct-horse', hash)).toBe(true);
    expect(await verifyPassword('wrong', hash)).toBe(false);
});

test('SSE only notifies the matching owner or share token', () => {
    const writes = { alice: [], bob: [], display: [], admin: [] };
    const mockRes = (key) => ({
        write: (chunk) => writes[key].push(chunk),
        on: () => {},
    });
    const hub = createSseHub();
    hub.add({ res: mockRes('alice'), userId: 'a1' });
    hub.add({ res: mockRes('bob'), userId: 'b2' });
    hub.add({ res: mockRes('display'), shareToken: 'tok' });
    hub.add({ res: mockRes('admin'), userId: 'z9', isAdmin: true });

    hub.broadcast({ ownerId: 'a1', shareToken: 'tok' });
    expect(writes.alice.some((line) => line.includes('event: change'))).toBe(true);
    expect(writes.bob.some((line) => line.includes('event: change'))).toBe(false);
    expect(writes.display.some((line) => line.includes('event: change'))).toBe(true);
    expect(writes.admin.some((line) => line.includes('event: change'))).toBe(true);
});
