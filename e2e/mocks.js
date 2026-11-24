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

// --- R20: privacy notice, two-step verification, audit log ------------------

/** Pins the interface language before the app boots (the detector reads localStorage first). */
export async function useLanguage(page, lng = 'en') {
    await page.addInitScript((value) => {
        window.localStorage.setItem('debateTimerLang', value);
    }, lng);
}

export const NOTICE_VERSION = '2026.11.1';

/** GET /api/privacy/notices/current — same shape as server/lib/privacyNotices.js. */
export function noticePayload(overrides = {}) {
    return {
        success: true,
        data: {
            version: NOTICE_VERSION,
            effectiveDate: '{{PRIVACY_EFFECTIVE_DATE}}',
            lng: 'en',
            operator: { name: 'E2E Operator', contactEmail: 'ops@example.com' },
            title: 'Privacy Notice',
            intro: 'What this service collects and why.',
            sections: [
                { heading: '1. Information we collect', items: ['Account information.', 'Sign-in records.'] },
                { heading: '7. Contact', items: ['Operator: E2E Operator'] },
            ],
            ...overrides,
        },
    };
}

/** The "session user" every signed-in response shares: { status, id, username, role, pending }. */
export function sessionUser(overrides = {}) {
    return {
        status: 'ok',
        id: 'e2euser',
        username: 'e2e',
        role: 'user',
        pending: [],
        ...overrides,
    };
}

export function meResponse(overrides = {}) {
    return { success: true, data: sessionUser(overrides) };
}

export const ANONYMOUS_ME = { status: 401, json: { success: false, message: 'Authentication required' } };

/** LOGIN for an account with two-step verification on: a ticket, and no session yet. */
export const TOTP_REQUIRED = {
    success: true,
    data: { status: 'totp_required', ticket: 'e2eticket01', expiresIn: 300 },
};

const E2E_SECRET = 'JBSWY3DPEHPK3PXPK3PXPK3PXPK3PXPK3P';

/** POST /api/auth/totp/setup — the otpauth link and the Base32 key. */
export const TOTP_SETUP = {
    success: true,
    data: {
        otpauthUri: `otpauth://totp/Debate%20Timer:e2e?secret=${E2E_SECRET}&issuer=Debate%20Timer`
            + '&algorithm=SHA1&digits=6&period=30',
        secret: E2E_SECRET,
        expiresIn: 600,
    },
};

/** GET /api/auth/totp/status */
export function totpStatus(overrides = {}) {
    return {
        success: true,
        data: {
            available: true,
            enabled: false,
            enforced: false,
            needsPassword: false,
            recoveryCodesRemaining: null,
            ...overrides,
        },
    };
}

export const RECOVERY_CODES = [
    'ABCDE-FGH23', 'JKLMN-PQRST4', 'UVWXY-ZABCD5', 'EFGHI-JKLMN6', 'OPQRS-TUVWX7',
    'YZABC-DEFGH8', 'JKLMN-PQRST9', 'UVWXY-ZABCD2', 'EFGHI-JKLMN3', 'OPQRS-TUVWX4',
];

/** POST /api/auth/totp/confirm — the only time the codes exist in plain text. */
export const TOTP_CONFIRMED = { success: true, data: { recoveryCodes: [...RECOVERY_CODES] } };

export const GATE_REQUIRED_403 = {
    status: 403,
    json: { success: false, code: 'GATE_REQUIRED', message: 'Additional steps are required before continuing', gates: ['privacy_consent'] },
};

/** GET /api/audit/logs/list and /logins/list — `{ items, total, page, pageSize }`. */
export function auditPage(items, { total = items.length, page = 1, pageSize = 20 } = {}) {
    return { success: true, data: { items, total, page, pageSize } };
}

// Fixed instants, so assertions on them do not depend on when the suite runs.
export const AT_1 = Date.UTC(2026, 10, 24, 9, 5, 0);

/** One administrator audit entry, shaped like server/lib/auditLog.js `toAuditItem`. */
export function auditItem({ n = 1, ...overrides } = {}) {
    return {
        id: `evt-${n}`,
        type: 'login_succeeded',
        result: 'success',
        at: AT_1 + n * 60_000,
        actor: { id: 'u1', username: 'alice' },
        subject: { id: 'u1', username: 'alice' },
        ip: '203.0.113.7',
        detail: {},
        anonymized: false,
        ...overrides,
    };
}

/** One entry of "my sign-in history", shaped like `toLoginItem`. */
export function loginItem({ n = 1, ...overrides } = {}) {
    return {
        id: `login-${n}`,
        type: 'login_succeeded',
        result: 'success',
        at: AT_1 + n * 60_000,
        ip: '203.0.113.7',
        detail: {},
        ...overrides,
    };
}

/** The administrator the suite signs in as, as GET /api/admin/users lists it. */
export const ADMIN_SELF = {
    id: 'admin1',
    username: 'boss',
    role: 'admin',
    disabled: false,
    totpEnabled: true,
    createdAt: Date.UTC(2026, 9, 31, 14, 17, 45),
};

/** One more account, as GET /api/admin/users lists it. */
export function adminUser(overrides = {}) {
    return {
        id: 'u2',
        username: 'bob',
        role: 'user',
        disabled: false,
        totpEnabled: false,
        createdAt: Date.UTC(2026, 10, 1, 6, 13, 18),
        ...overrides,
    };
}

/**
 * Installs the standard anonymous/auth API surface used by app bootstrap.
 *
 * Third-party font requests are cut off here so a run never depends on
 * Google Fonts being reachable: the page must render from the local bundle.
 */
export async function mockBaseApi(page) {
    await page.route('https://fonts.googleapis.com/**', (route) => route.abort());
    await page.route('https://fonts.gstatic.com/**', (route) => route.abort());
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
    // "Account and security" and the audit log: nothing switched on and
    // nothing recorded unless a spec says otherwise (a spec registers its own
    // handler afterwards, which then takes precedence).
    await page.route('**/api/auth/totp/status', (route) => route.fulfill({ json: totpStatus() }));
    await page.route('**/api/audit/logs/list**', (route) => route.fulfill({ json: auditPage([]) }));
    await page.route('**/api/audit/logins/list**', (route) => route.fulfill({ json: auditPage([]) }));
}
