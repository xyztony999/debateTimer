/**
 * Shared /api mocks for the frontend-only E2E suite. Specs intercept network
 * via page.route and serve these — shapes mirror the real API contracts.
 */
export const AUTH_ME = {
    success: true,
    data: { id: 'e2euser', username: 'e2e', role: 'user' },
};
export const AUTH_STATUS = { success: true, data: { hasUsers: true, registrationOpen: false } };

export const CONFIG_DOC = {
    name: 'E2E 赛制',
    schemaVersion: 2,
    debateStages: { sound_check: 30, aff_c1: 120, crossfire_2v2: 90, free_debate: 60 },
    timerSettings: { sound_check: 'single', aff_c1: 'single', crossfire_2v2: 'double', free_debate: 'free' },
    stageOrder: ['sound_check', 'aff_c1', 'crossfire_2v2', 'free_debate'],
    stageLabels: {},
    stageGrace: { aff_c1: 15 },
    stageAutoAdvance: {},
    teamNames: { aff: '红队', neg: '蓝队' },
    stagePid: {},
    pidOptions: { marker: 'mic', lineColor: '#2e7d32' },
};

export const CONFIG_RESPONSE = {
    success: true,
    data: {
        ...CONFIG_DOC,
        shareEnabled: true,
        shareToken: 'e2etoken',
        ownerId: 'e2euser',
        createdAt: Date.now(),
        updatedAt: Date.now(),
    },
};

export const CONFIG_LIST = {
    success: true,
    data: [{ name: CONFIG_DOC.name, createdAt: Date.now(), updatedAt: Date.now(), shareEnabled: true }],
};

export function galleryList(names) {
    return {
        success: true,
        data: {
            items: names.map((name, i) => ({
                id: `g${i}`,
                name,
                stageCount: 9,
                totalSeconds: 1500,
                modeSummary: 'single×8 · free×1',
                updatedAt: Date.now() - i * 1000,
                copies: names.length - i,
            })),
            nextBefore: null,
        },
    };
}

export function snapshotBody(overrides = {}) {
    return {
        seq: 5,
        stageId: 'free_debate',
        stageMode: 'free',
        remainingAffMs: 30_000,
        remainingNegMs: 15_000,
        runningAff: false,
        runningNeg: true,
        activeSide: 'neg',
        phaseAff: 'running',
        phaseNeg: 'running',
        graceAffMs: 0,
        graceNegMs: 0,
        serverTime: Date.now(),
        sessionId: 'e2esession',
        ...overrides,
    };
}

/** Installs the standard anonymous/auth API surface used by app bootstrap. */
export async function mockBaseApi(page) {
    await page.route('**/api/auth/status', (route) => route.fulfill({ json: AUTH_STATUS }));
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: AUTH_ME }));
    await page.route('**/api/auth/logout', (route) => route.fulfill({ json: { success: true } }));
    await page.route('**/api/configurations/stream**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': connected\n\n' }));
    await page.route('**/api/configurations', (route) => route.fulfill({ json: CONFIG_LIST }));
    // Any named configuration: GET returns the doc (bootstrap probes the
    // default name before falling back to the list), PUT accepts saves.
    await page.route('**/api/configurations/**', (route) => {
        if (route.request().method() === 'GET') {
            return route.fulfill({ json: CONFIG_RESPONSE });
        }
        return route.fulfill({ json: { success: true, data: {} } });
    });
}
