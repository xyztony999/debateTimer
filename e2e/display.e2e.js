import { expect, test } from '@playwright/test';
import { CONFIG_DOC, snapshotBody } from './mocks.js';

function displayConfig() {
    return {
        success: true,
        data: {
            name: CONFIG_DOC.name,
            schemaVersion: 2,
            debateStages: CONFIG_DOC.debateStages,
            timerSettings: CONFIG_DOC.timerSettings,
            stageOrder: CONFIG_DOC.stageOrder,
            stageLabels: CONFIG_DOC.stageLabels,
            stageGrace: CONFIG_DOC.stageGrace,
            stageAutoAdvance: CONFIG_DOC.stageAutoAdvance,
            teamNames: CONFIG_DOC.teamNames,
            stagePid: CONFIG_DOC.stagePid,
            pidOptions: CONFIG_DOC.pidOptions,
        },
    };
}

/**
 * The display page races its state fetch against config loading; handlers
 * hold the state payload until the config GET has been served.
 *
 * NOTE on stage adoption: the config listener re-loads the config (poll
 * fallback while the mocked SSE body ends immediately). Since the follow-bug
 * fix this re-delivery is a no-op (identical payload keeps the config object
 * identity) and the [config] runtime reset is guarded while following, so
 * the stage adopted from the snapshot survives. Stage adoption mechanics
 * themselves are covered by engine unit tests (snapshotCodec); these specs
 * pin the follow-mode UX contracts (banner / read-only / runtime stability /
 * fallback).
 */
function until(cond) {
    return new Promise((resolve) => {
        const tick = () => (cond() ? resolve() : setTimeout(tick, 50));
        tick();
    });
}

test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth/status', (route) =>
        route.fulfill({ json: { success: true, data: { hasUsers: true, registrationOpen: false } } }));
    await page.route('**/api/auth/me', (route) =>
        route.fulfill({ json: { success: true, data: { id: 'e2e', username: 'e2e', role: 'user' } } }));

    let configServed = false;
    await page.route('**/api/display/e2etoken', async (route) => {
        configServed = true;
        await route.fulfill({ json: displayConfig() });
    });
    await page.route('**/api/display/e2etoken/state', async (route) => {
        await until(() => configServed);
        await route.fulfill({ json: { success: true, data: { active: true, startedAt: Date.now() - 60_000, snapshot: snapshotBody() } } });
    });
    await page.route('**/api/display/e2etoken/stream', async (route) => {
        await until(() => configServed);
        const frame = `event: state\ndata: ${JSON.stringify(snapshotBody())}\n\n`;
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `: connected\n\n${frame}` });
    });
});

test('display follows a live session read-only', async ({ page }) => {
    await page.goto('/display/e2etoken');

    // Follow banner appears; the snapshot's stage (not the config's first
    // stage) renders and survives the config poll fallback.
    await expect(page.getByText(/正在大屏跟随|Live from controller|Diffusion/i).first()).toBeVisible();
    await expect(page.locator('.dt-stage-name')).toContainText(/自由辩论|Free debate|Débat libre/i);

    // Read-only while following: no start buttons anywhere on the screen.
    await expect(page.getByRole('button', { name: /▶/ })).toHaveCount(0);
    // Sound panel entry stays available for the venue's local bell prefs.
    await expect(page.getByRole('button', { name: /🔊|提示音|Alert sounds/i }).first()).toBeVisible();
});

test('display keeps the adopted runtime when identical config is re-delivered mid-follow', async ({ page }) => {
    await page.goto('/display/e2etoken');

    // The one-shot state frame adopts free_debate with the negative clock
    // running (15s left in the shared snapshot body).
    await expect(page.locator('.dt-stage-name')).toContainText(/自由辩论|Free debate|Débat libre/i);

    // The mocked stream body ends immediately, so the config listener falls
    // back to its 5s poll — every tick re-delivers the SAME config document.
    // Wait past two poll ticks: the adopted stage and running clocks must
    // not be reset back to the first stage at full duration.
    await page.waitForTimeout(6500);
    await expect(page.locator('.dt-stage-name')).toContainText(/自由辩论|Free debate|Débat libre/i);
    await expect(page.locator('.dt-stage-name')).not.toContainText(/试音|Sound check|Test audio/i);
    await expect(page.getByText(/^\d{1,2}:\d{2}$/).first()).toBeVisible();
});

test('display falls back to standalone after the session ends', async ({ page }) => {
    let ended = false;
    await page.unroute('**/api/display/e2etoken/stream');
    await page.route('**/api/display/e2etoken/stream', async (route) => {
        await until(() => ended);
        const body = `event: session\ndata: ${JSON.stringify({ type: 'ended', reason: 'closed_by_operator', sessionId: 'e2esession' })}\n\n`;
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: `: connected\n\n${body}` });
    });

    await page.goto('/display/e2etoken');
    await expect(page.getByText(/正在大屏跟随|Live from controller|Diffusion/i).first()).toBeVisible();
    ended = true;
    await page.reload();
    await expect(page.getByText(/已切换为独立计时|standalone|mode autonome/i).first()).toBeVisible();
});
