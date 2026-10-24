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
 * fallback while the mocked SSE body ends immediately) and the config effect
 * resets the engine to the first stage — in production snapshots keep
 * arriving over the long-lived stream and win, but with a single-shot mock
 * frame the reset can land last. Stage adoption itself is covered by engine
 * unit tests (snapshotCodec) and the R13/R14 browser validations; these
 * specs pin the follow-mode UX contracts (banner / read-only / fallback).
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

    // Follow banner appears; the shared config's first stage renders.
    await expect(page.getByText(/正在大屏跟随|Live from controller|Diffusion/i).first()).toBeVisible();
    await expect(page.locator('.dt-stage-name')).toContainText(/试音|Sound check/i);

    // Read-only while following: no start buttons anywhere on the screen.
    await expect(page.getByRole('button', { name: /▶/ })).toHaveCount(0);
    // Sound panel entry stays available for the venue's local bell prefs.
    await expect(page.getByRole('button', { name: /🔊|提示音|Alert sounds/i }).first()).toBeVisible();
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
