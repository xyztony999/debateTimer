import { expect, test } from '@playwright/test';
import { AUTH_ME, mockBaseApi } from './mocks';

/**
 * Admin-side registration toggle (管理侧注册开关):
 * 1) AdminPage shows the toggle card sourced from
 *    GET /api/admin/settings/registration; flipping the switch PUTs the new
 *    boolean and the label flips with the mocked response;
 * 2) a closed registration (status.registrationOpen=false with users) shows
 *    the visitor-side "registration closed" hint and no register toggle.
 */

function settingsPayload(overrides = {}) {
    return {
        success: true,
        data: {
            registrationOpen: false,
            source: 'env',
            envDefault: false,
            updatedAt: null,
            updatedBy: null,
            ...overrides,
        },
    };
}

test('admin flips the registration switch and the PUT carries the new value', async ({ page }) => {
    const putBodies = [];
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) =>
        route.fulfill({ json: { success: true, data: { ...AUTH_ME.data, role: 'admin' } } }));
    await page.route('**/api/admin/users', (route) =>
        route.fulfill({ json: { success: true, data: [] } }));
    await page.route('**/api/admin/configurations', (route) =>
        route.fulfill({ json: { success: true, data: [] } }));
    await page.route('**/api/admin/settings/registration', (route) => {
        if (route.request().method() === 'PUT') {
            const body = route.request().postDataJSON();
            putBodies.push(body);
            return route.fulfill({
                json: {
                    success: true,
                    data: {
                        registrationOpen: body.registrationOpen,
                        source: 'admin',
                        envDefault: false,
                        updatedAt: Date.now(),
                        updatedBy: 'boss',
                    },
                },
            });
        }
        return route.fulfill({ json: settingsPayload() });
    });

    await page.goto('/admin');

    // Env-sourced closed state: switch off, switch enabled.
    // MUI Switch renders role="switch", not checkbox.
    const toggle = page.getByRole('switch');
    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeEnabled();

    await toggle.click();

    // The PUT body carries the flipped boolean and the label follows the
    // mocked admin-sourced response.
    await expect.poll(() => putBodies).toEqual([{ registrationOpen: true }]);
    await expect(toggle).toBeChecked();
});

test('closed registration shows the visitor hint and hides the register toggle', async ({ page }) => {
    // mockBaseApi's AUTH_STATUS already is the closed state: hasUsers + !open.
    // Override /me with 401 so /login stays put instead of bouncing to the
    // timer as the default logged-in e2e user.
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) =>
        route.fulfill({ status: 401, json: { success: false, message: 'Authentication required' } }));

    await page.goto('/login');

    await expect(page.getByText(/registration is currently closed|公开注册当前已关闭|actuellement fermée/i))
        .toBeVisible();
    await expect(page.getByText(/need an account|需要账号|Besoin d’un compte/i)).toHaveCount(0);
});
