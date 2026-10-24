import { expect, test } from '@playwright/test';
import { mockBaseApi } from './mocks.js';

/**
 * Timer control page with a fully mocked API. Guards the core local loop:
 * stage switching via the PID timeline, dual-mode clocks, keyboard start,
 * and the desktop-form pairing gate.
 */
test.beforeEach(async ({ page }) => {
    await mockBaseApi(page);
});

test('control page renders the PID timeline stations from the config', async ({ page }) => {
    await page.goto('/');
    const timeline = page.getByRole('tablist');
    await expect(timeline.getByRole('tab', { name: /自由辩论|Free debate/i })).toBeVisible();
    await expect(timeline.getByRole('tab', { name: /试音|Sound check|测试/i })).toBeVisible();
});

test('dual-mode stage renders both clocks and keyboard starts a side', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('tablist').getByRole('tab', { name: /自由辩论|Free debate/i }).click();

    // Free mode: two clock panels labelled with the shared team names.
    await expect(page.getByText('红队').first()).toBeVisible();
    await expect(page.getByText('蓝队').first()).toBeVisible();

    // Keyboard L starts the negative clock — digits tick as mm:ss.
    await page.keyboard.press('l');
    await expect(page.getByText(/^\d{1,2}:\d{2}$/).first()).toBeVisible();
});

test('pairing entry is hidden on the desktop form factor', async ({ page }) => {
    await page.goto('/');
    // Open the app-bar overflow menu (the trailing unnamed icon button of
    // the first banner — the page has a second banner for stage announcements).
    const bar = page.getByRole('banner').first();
    await bar.getByRole('button').last().click();

    const menu = page.getByRole('menu');
    // Menu opened with the regular entries…
    await expect(menu.getByRole('menuitem', { name: /设置|Settings/i })).toHaveCount(1);
    // …but the remote-only pairing entry must not exist on desktop.
    await expect(menu.getByRole('menuitem', { name: /连接电脑|Connect PC|Pair/i })).toHaveCount(0);
});
