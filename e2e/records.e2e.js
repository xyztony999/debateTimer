import { expect, test } from '@playwright/test';

/**
 * Match-record pages regression (records-style restyle): list renders record
 * cards with overrun chips and deep-links into the detail table. All
 * /api/match-logs traffic mocked.
 */

const RECORD_ID = 'rec1';

function listItem(overrides = {}) {
    return {
        id: RECORD_ID,
        configName: 'UOMDC 标准赛制',
        teamNames: { aff: '红队', neg: '蓝队' },
        startedAt: Date.now() - 3600_000,
        endedAt: Date.now() - 3000_000,
        savedAt: Date.now() - 60_000,
        stageCount: 16,
        overrunCount: 2,
        ...overrides,
    };
}

const DETAIL = {
    id: RECORD_ID,
    ownerId: 'e2e',
    configName: 'UOMDC 标准赛制',
    teamNames: { aff: '红队', neg: '蓝队' },
    startedAt: Date.now() - 3600_000,
    endedAt: Date.now() - 3000_000,
    savedAt: Date.now() - 60_000,
    stages: [
        {
            stageId: 'aff_c1', label: '正方一辩发言', mode: 'single',
            plannedSeconds: 210, graceSeconds: 15,
            actualAffSeconds: 225, actualNegSeconds: 0,
            overrunAff: 1, overrunNeg: 0,
            enteredAt: Date.now() - 3600_000, exitedAt: Date.now() - 3560_000,
        },
        {
            stageId: 'free_debate', label: '自由辩论', mode: 'free',
            plannedSeconds: 240, graceSeconds: 0,
            actualAffSeconds: 230, actualNegSeconds: 250,
            overrunAff: 0, overrunNeg: 1,
            enteredAt: Date.now() - 3560_000, exitedAt: Date.now() - 3100_000,
        },
    ],
    summary: { totalPlannedSeconds: 450, totalActualSeconds: 705, overrunCount: 2 },
};

test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/status', (route) =>
        route.fulfill({ json: { success: true, data: { hasUsers: true, registrationOpen: false } } }));
    await page.route('**/api/auth/me', (route) =>
        route.fulfill({ json: { success: true, data: { id: 'e2e', username: 'e2e', role: 'user' } } }));
});

test('records list shows cards with team names and overrun chip', async ({ page }) => {
    await page.route('**/api/match-logs?*', (route) =>
        route.fulfill({ json: { success: true, data: { items: [listItem()], nextBefore: null } } }));
    await page.route('**/api/match-logs', (route) =>
        route.fulfill({ json: { success: true, data: { items: [listItem()], nextBefore: null } } }));

    await page.goto('/records');
    await expect(page.getByRole('heading', { name: /比赛记录|Match records|Historique/i })).toBeVisible();
    await expect(page.getByText('UOMDC 标准赛制 · 红队 vs 蓝队')).toBeVisible();
    await expect(page.getByRole('button', { name: /2|overruns|超时/i }).first()).toBeVisible();
});

test('record detail shows summary chips and the stage table', async ({ page }) => {
    await page.route(`**/api/match-logs/${RECORD_ID}`, (route) =>
        route.fulfill({ json: { success: true, data: DETAIL } }));

    await page.goto(`/records/${RECORD_ID}`);
    await expect(page.getByRole('heading', { name: /UOMDC 标准赛制 · 红队 vs 蓝队/ })).toBeVisible();
    await expect(page.getByText('正方一辩发言')).toBeVisible();
    await expect(page.getByText('自由辩论')).toBeVisible();
    // Overrun markers per side in the table.
    await expect(page.getByText('红队 ×1')).toBeVisible();
    await expect(page.getByText('蓝队 ×1')).toBeVisible();
    // AppBar actions present.
    await expect(page.getByRole('button', { name: 'CSV' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'JSON' })).toBeVisible();
});
