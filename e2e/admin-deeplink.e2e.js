import { expect, test } from '@playwright/test';

/**
 * Admin console → "编辑" deep link regression (admin-edit-fixes):
 * 1) editing one's OWN template = normal visit: no "another user" banner,
 *    and the ?name= template is preselected over the remembered one;
 * 2) a genuinely different owner keeps the banner (guard against over-fix).
 */

const NAMES = ['默认配置', '校内赛'];

function configDoc(name) {
    return {
        success: true,
        data: {
            name,
            schemaVersion: 2,
            debateStages: { sound_check: 30, aff_c1: 120 },
            timerSettings: { sound_check: 'single', aff_c1: 'single' },
            stageOrder: ['sound_check', 'aff_c1'],
            stageLabels: {},
            stageGrace: {},
            stageAutoAdvance: {},
            teamNames: {},
            stagePid: {},
            shareEnabled: false,
            shareToken: null,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        },
    };
}

test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/status', (route) =>
        route.fulfill({ json: { success: true, data: { hasUsers: true, registrationOpen: false } } }));
    await page.route('**/api/auth/me', (route) =>
        route.fulfill({ json: { success: true, data: { id: 'e2eadmin', username: 'admin', role: 'admin' } } }));
    await page.route('**/api/auth/logout', (route) => route.fulfill({ json: { success: true } }));
    await page.route('**/api/configurations/stream**', (route) =>
        route.fulfill({ status: 200, contentType: 'text/event-stream', body: ': connected\n\n' }));
    // List calls carry ?ownerId= when acting on behalf — glob patterns
    // match the full URL including query, so both shapes need a route.
    const listHandler = (route) =>
        route.fulfill({
            json: {
                success: true,
                data: NAMES.map((name) => ({ name, createdAt: Date.now(), updatedAt: Date.now(), shareEnabled: false })),
            },
        });
    await page.route('**/api/configurations', listHandler);
    await page.route('**/api/configurations?*', listHandler);
    await page.route('**/api/configurations/**', (route) => {
        if (route.request().method() !== 'GET') {
            return route.fulfill({ json: { success: true, data: {} } });
        }
        const url = new URL(route.request().url());
        const name = decodeURIComponent(url.pathname.split('/').pop());
        return route.fulfill({ json: configDoc(NAMES.includes(name) ? name : NAMES[0]) });
    });
    // Remember the default so the deep link has to beat the memory.
    await page.addInitScript(() => {
        window.localStorage.setItem('selectedConfigurationName', '默认配置');
    });
});

async function selectedTemplate(page) {
    const box = page.getByRole('combobox', { name: /当前模板|Current template|Modèle actuel/i });
    return box.textContent();
}

test('admin editing own template: no banner, deep-linked template preselected', async ({ page }) => {
    await page.goto('/settings?ownerId=e2eadmin&name=' + encodeURIComponent('校内赛'));
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect.poll(() => selectedTemplate(page)).toContain('校内赛');
});

test('admin editing another owner keeps the acting-on-behalf banner', async ({ page }) => {
    await page.goto('/settings?ownerId=otherowner&name=' + encodeURIComponent('校内赛'));
    await expect(page.getByText(/你正在编辑其他用户的模板|editing another user/i)).toBeVisible();
    await expect.poll(() => selectedTemplate(page)).toContain('校内赛');
});
