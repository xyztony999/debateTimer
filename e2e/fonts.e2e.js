import { expect, test } from '@playwright/test';
import { ANONYMOUS_ME, useLanguage } from './mocks';

const FONT_URL = 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap';
const FONT_HOSTS = ['https://fonts.googleapis.com/**', 'https://fonts.gstatic.com/**'];

/**
 * The web font is loaded without holding back the first paint (P-03 PRD
 * FR-4). mockBaseApi cuts the font requests off, which is right for every
 * other spec; these tests must not use it, or the "hanging" case could not
 * exist. Only what the sign-in page asks for on its own is answered here.
 */
async function anonymousVisitor(page) {
    await useLanguage(page);
    await page.route('**/api/auth/status', (route) => route.fulfill({
        json: { success: true, data: { hasUsers: true, registrationOpen: true } },
    }));
    await page.route('**/api/auth/me', (route) => route.fulfill(ANONYMOUS_ME));
}

async function hangFonts(page) {
    // Neither answered nor refused — as on a network where the font host
    // cannot be reached. A render-blocking stylesheet would wait forever.
    for (const pattern of FONT_HOSTS) {
        await page.route(pattern, () => {});
    }
}

async function refuseFonts(page) {
    // Refused rather than answered: the sheet never "arrives", so the link
    // stays in the state it started in and can be inspected.
    for (const pattern of FONT_HOSTS) {
        await page.route(pattern, (route) => route.abort());
    }
}

test.describe('the web font never blocks the first paint', () => {
    test('the sign-in page renders while both font requests hang', async ({ page }) => {
        await anonymousVisitor(page);
        await hangFonts(page);

        await page.goto('/login');
        await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible({ timeout: 5000 });
        await expect(page.getByLabel('Username')).toBeVisible();
    });

    test('the font is fetched first as a preload and applied only once it has arrived', async ({ page }) => {
        await anonymousVisitor(page);
        await refuseFonts(page);

        await page.goto('/login');
        const links = await page.evaluate((href) => [...document.querySelectorAll('link')]
            .filter((link) => link.href === href)
            .map((link) => ({
                rel: link.rel,
                as: link.as,
                switchesOnLoad: link.hasAttribute('onload'),
                inNoscript: Boolean(link.closest('noscript')),
            })), FONT_URL);

        // One waiting copy outside <noscript>. (Inside <noscript> is text while
        // script runs, so it is not an element here.)
        expect(links).toEqual([{ rel: 'preload', as: 'style', switchesOnLoad: true, inNoscript: false }]);
    });

    test('once the font stylesheet has arrived it becomes a stylesheet', async ({ page }) => {
        await anonymousVisitor(page);
        await page.route('https://fonts.googleapis.com/**', (route) => route.fulfill({
            status: 200,
            contentType: 'text/css',
            body: '/* e2e font-face */',
        }));
        await page.route('https://fonts.gstatic.com/**', (route) => route.abort());

        await page.goto('/login');
        const applied = page.locator(`link[rel="stylesheet"][href^="https://fonts.googleapis.com/css2"]`);
        await expect(applied).toHaveCount(1);
        // The other spelling would have left a blocking stylesheet in place
        // from the first byte; here nothing is a stylesheet before it arrives.
        expect(await page.evaluate(() => [...document.querySelectorAll('link[rel="stylesheet"]')]
            .filter((link) => link.href.startsWith('https://fonts.googleapis.com/css2') && link.href !== undefined)
            .map((link) => link.href))).toEqual([FONT_URL]);
    });
});

test.describe('in a browser without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the page keeps a regular font stylesheet', async ({ page }) => {
        await page.goto('/');

        const plain = page.locator(`noscript link[rel="stylesheet"][href="${FONT_URL}"]`);
        await expect(plain).toHaveCount(1);
        // The waiting copy cannot switch itself on without script, and does not have to.
        const waiting = page.locator('link[rel="preload"][as="style"][href^="https://fonts.googleapis.com/css2"]');
        await expect(waiting).toHaveCount(1);
    });
});
