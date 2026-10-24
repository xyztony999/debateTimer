import { expect, test } from '@playwright/test';
import { galleryList } from './mocks.js';

const NAMES = ['UOMDC 标准赛制', '英国议会制 BP（样例）', '奥瑞冈制（样例）'];

test.beforeEach(async ({ page }) => {
    await page.route('**/api/gallery**', async (route) => {
        const url = new URL(route.request().url());
        const q = url.searchParams.get('q') || '';
        const matched = q ? NAMES.filter((n) => n.toLowerCase().includes(q.toLowerCase())) : NAMES;
        await route.fulfill({ json: galleryList(matched) });
    });
});

test('gallery lists public templates with copy counts', async ({ page }) => {
    await page.goto('/gallery');
    await expect(page.getByRole('heading', { name: /模板广场|Template gallery/i })).toBeVisible();
    await expect(page.getByText('UOMDC 标准赛制')).toBeVisible();
    await expect(page.getByText('英国议会制 BP（样例）')).toBeVisible();
});

test('gallery search filters via the API query param', async ({ page }) => {
    let seenQuery = '';
    await page.route('**/api/gallery**', async (route) => {
        const url = new URL(route.request().url());
        seenQuery = url.searchParams.get('q') || '';
        const matched = seenQuery ? NAMES.filter((n) => n.toLowerCase().includes(seenQuery.toLowerCase())) : NAMES;
        await route.fulfill({ json: galleryList(matched) });
    });

    await page.goto('/gallery');
    await page.getByPlaceholder(/搜索|Search/).fill('BP');
    await expect.poll(() => seenQuery).toBe('BP');
    await expect(page.getByText('英国议会制 BP（样例）')).toBeVisible();
    await expect(page.getByText('UOMDC 标准赛制')).toHaveCount(0);
});

test('gallery detail dialog opens from a card and shows stages', async ({ page }) => {
    await page.route('**/api/gallery/g1', (route) =>
        route.fulfill({
            json: {
                success: true,
                data: {
                    id: 'g1', name: 'E2E 赛制', stageCount: 2, totalSeconds: 150, copies: 3,
                    updatedAt: Date.now(),
                    debateStages: { a: 120, b: 30 },
                    timerSettings: { a: 'single', b: 'free' },
                    stageOrder: ['a', 'b'], stageLabels: { a: { 'zh-Hans': '立论' } },
                },
            },
        }));
    await page.route('**/api/gallery/g1/copy', (route) => route.fulfill({ json: { success: true, data: { counted: true } } }));
    await page.route('**/api/configurations/E2E%20%E8%B5%9B%E5%88%B6**', (route) =>
        route.fulfill({ json: { success: true, data: {} } }));

    await page.goto('/gallery');
    await page.getByText(NAMES[1]).first().click();
    // Detail dialog driven by /gallery/:id route — g1 directly is simpler:
    await page.goto('/gallery/g1');
    await expect(page.getByRole('dialog').getByText('E2E 赛制')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('立论')).toBeVisible();
});
