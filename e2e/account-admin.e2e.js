import { expect, test } from '@playwright/test';
import {
    ADMIN_SELF,
    RECOVERY_CODES,
    TOTP_CONFIRMED,
    TOTP_SETUP,
    adminUser,
    auditItem,
    auditPage,
    loginItem,
    meResponse,
    mockBaseApi,
    totpStatus,
    useLanguage,
} from './mocks';

/**
 * R20, the signed-in side (frontend-only, every /api call mocked):
 *  - /settings: "Account and security" — the two-step card and "My sign-in
 *    history";
 *  - /admin: the two-step and "Registered" columns, resetting another
 *    account's two-step verification, the registration switch's provenance,
 *    and the audit log card.
 *
 * The interface language is pinned to English so assertions can be exact.
 */

const CURLY = '\u2019'; // the apostrophe the English wordings use

/** The one card whose text includes `title` exactly. */
const card = (page, title) => page.locator('.MuiCard-root').filter({ has: page.getByText(title, { exact: true }) });
const totpCard = (page) => card(page, 'Two-step verification');
const historyCard = (page) => card(page, 'My sign-in history');
const auditCard = (page) => card(page, 'Audit log');

async function openSettings(page, { role = 'user', before } = {}) {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: meResponse({ role }) }));
    if (before) {
        await before();
    }
    await page.goto('/settings?ownerId=e2euser');
    await expect(page.getByRole('heading', { level: 2, name: 'Account and security' })).toBeVisible();
}

function registrationSetting(overrides = {}) {
    return { registrationOpen: false, source: 'env', envDefault: false, updatedAt: null, updatedBy: null, ...overrides };
}

async function openAdmin(page, { users = [], registration = registrationSetting(), before } = {}) {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({
        json: meResponse({ id: ADMIN_SELF.id, username: ADMIN_SELF.username, role: 'admin' }),
    }));
    await page.route('**/api/admin/users', (route) => route.fulfill({ json: { success: true, data: users } }));
    await page.route('**/api/admin/configurations', (route) => route.fulfill({ json: { success: true, data: [] } }));
    await page.route('**/api/admin/settings/registration', (route) => route.fulfill({ json: { success: true, data: registration } }));
    if (before) {
        await before();
    }
    await page.goto('/admin');
    await expect(page.getByText('Administration', { exact: true })).toBeVisible();
}

// -------------------------------------------------- settings: two-step card

test('settings: turning two-step on runs the binding in a dialog, then the card says it is on', async ({ page }) => {
    let reads = 0;
    const setupBodies = [];
    const confirmBodies = [];
    await openSettings(page, {
        before: async () => {
            await page.route('**/api/auth/totp/status', (route) => {
                reads += 1;
                return route.fulfill({ json: totpStatus(reads === 1 ? {} : { enabled: true, recoveryCodesRemaining: 10 }) });
            });
            await page.route('**/api/auth/totp/setup', (route) => {
                setupBodies.push(route.request().postDataJSON());
                return route.fulfill({ json: TOTP_SETUP });
            });
            await page.route('**/api/auth/totp/confirm', (route) => {
                confirmBodies.push(route.request().postDataJSON());
                return route.fulfill({ json: TOTP_CONFIRMED });
            });
        },
    });

    const card = totpCard(page);
    await expect(card.getByText('Off', { exact: true })).toBeVisible();
    const turnOn = card.getByRole('button', { name: 'Turn on', exact: true });
    await expect(turnOn).toBeVisible();
    await expect(card.getByRole('button', { name: 'Turn off', exact: true })).toHaveCount(0);

    await turnOn.click();
    const dialog = page.getByRole('dialog', { name: 'Set up two-step verification' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('img', { name: 'Set up two-step verification' })).toBeVisible();
    await dialog.getByLabel('Code', { exact: true }).fill('123456');
    await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();

    // The codes are in the dialog, once, and leaving needs the saved tick.
    await expect(dialog.locator('pre')).toHaveText(RECOVERY_CODES.join('\n'));
    const close = dialog.getByRole('button', { name: 'Saved, close', exact: true });
    await expect(close).toBeDisabled();
    await dialog.getByRole('checkbox', { name: `I${CURLY}ve saved my recovery codes` }).check();
    await close.click();
    await expect(dialog).toHaveCount(0);
    expect(setupBodies).toEqual([{}]);
    expect(confirmBodies).toEqual([{ code: '123456' }]);

    await expect(page.getByText('Two-step verification is on', { exact: true })).toBeVisible();
    await expect(card.getByText('On', { exact: true })).toBeVisible();
    await expect(card.getByText('10 recovery codes left')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Rebind authenticator' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Turn off', exact: true })).toBeVisible();

    // The codes left with the dialog. Rebinding is a new binding: a fresh key
    // is asked for, and it says that the old ones stop working.
    await card.getByRole('button', { name: 'Rebind authenticator' }).click();
    await expect(dialog.getByText('Rebinding generates a new key and new recovery codes; the old ones stop working.')).toBeVisible();
    await expect(dialog.locator('pre')).toHaveCount(0);
    await expect(dialog.getByRole('img', { name: 'Set up two-step verification' })).toBeVisible();
    expect(setupBodies).toEqual([{}, {}]);

    await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    // Closing without binding changes nothing.
    await expect(card.getByText('On', { exact: true })).toBeVisible();
});

test('settings: while the binding is being started the dialog cannot be closed', async ({ page }) => {
    let release;
    const started = new Promise((resolve) => {
        release = resolve;
    });
    await openSettings(page, {
        before: async () => {
            await page.route('**/api/auth/totp/setup', async (route) => {
                await started;
                await route.fulfill({ json: TOTP_SETUP });
            });
        },
    });

    await totpCard(page).getByRole('button', { name: 'Turn on', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // No close button, and neither Escape nor a click outside ends it: a
    // request that completes after the dialog is gone would lose the codes.
    await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0);
    // A click outside the dialog lands on the overlay that carries it.
    await page.keyboard.press('Escape');
    await page.locator('.MuiDialog-container').click({ position: { x: 2, y: 2 } });
    await expect(dialog).toBeVisible();

    release();
    const cancel = dialog.getByRole('button', { name: 'Cancel', exact: true });
    await expect(cancel).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(totpCard(page).getByRole('button', { name: 'Turn on', exact: true })).toBeVisible();
});

test('settings: an administrator keeps two-step on and is told to rebind instead of turning it off', async ({ page }) => {
    await openSettings(page, {
        role: 'admin',
        before: async () => {
            await page.route('**/api/auth/totp/status', (route) =>
                route.fulfill({ json: totpStatus({ enabled: true, enforced: true, recoveryCodesRemaining: 4 }) }));
        },
    });

    const card = totpCard(page);
    await expect(card.getByText('On', { exact: true })).toBeVisible();
    await expect(card.getByText('4 recovery codes left')).toBeVisible();
    await expect(card.getByText('Administrator accounts must keep two-step verification on. Use')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Rebind authenticator' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Turn off', exact: true })).toHaveCount(0);
});

test('settings: with no recovery code left the card says so and warns', async ({ page }) => {
    await openSettings(page, {
        before: async () => {
            await page.route('**/api/auth/totp/status', (route) =>
                route.fulfill({ json: totpStatus({ enabled: true, recoveryCodesRemaining: 0 }) }));
        },
    });

    const card = totpCard(page);
    await expect(card.getByText('0 recovery codes left')).toBeVisible();
    await expect(card.getByText('No recovery codes left. Rebind to generate new ones.')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Rebind authenticator' })).toBeVisible();
});

test('settings: turning two-step off asks for confirmation and then the password; a wrong password is said in the dialog', async ({ page }) => {
    let enabled = true;
    const disableBodies = [];
    let attempts = 0;
    await openSettings(page, {
        before: async () => {
            await page.route('**/api/auth/totp/status', (route) => route.fulfill({
                json: totpStatus(enabled ? { enabled: true, recoveryCodesRemaining: 3 } : {}),
            }));
            await page.route('**/api/auth/totp/disable', (route) => {
                disableBodies.push(route.request().postDataJSON());
                attempts += 1;
                return attempts === 1
                    ? route.fulfill({ status: 400, json: { success: false, message: 'Password is incorrect' } })
                    : route.fulfill({ json: { success: true, data: { enabled: false } } });
            });
        },
    });

    const card = totpCard(page);
    await expect(card.getByText('3 recovery codes left')).toBeVisible();
    const turnOff = card.getByRole('button', { name: 'Turn off', exact: true });

    // The confirmation first; declining leaves everything as it is.
    await turnOff.click();
    const confirmation = page.getByRole('dialog', { name: 'Please confirm' });
    await expect(confirmation.getByText(
        'After turning it off, signing in needs only your password. Turn off two-step verification?',
    )).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    expect(disableBodies).toEqual([]);

    // Then the password. A refused one is said where it was typed, and the
    // card still says "on".
    await turnOff.click();
    await page.getByRole('dialog', { name: 'Please confirm' }).getByRole('button', { name: 'Confirm', exact: true }).click();
    const passwordDialog = page.getByRole('dialog', { name: 'Turn off' });
    await expect(passwordDialog.getByText('To confirm it')).toBeVisible();
    const submit = passwordDialog.getByRole('button', { name: 'Turn off', exact: true });
    await expect(submit).toBeDisabled();
    await passwordDialog.getByLabel(/^Password/).fill('wrong-pw');
    await submit.click();
    await expect(passwordDialog.getByText('Wrong password.', { exact: true })).toBeVisible();
    expect(disableBodies).toEqual([{ password: 'wrong-pw' }]);

    enabled = false;
    await passwordDialog.getByLabel(/^Password/).fill('right-pw');
    await submit.click();
    await expect(passwordDialog).toHaveCount(0);
    expect(disableBodies).toEqual([{ password: 'wrong-pw' }, { password: 'right-pw' }]);
    await expect(page.getByText('Two-step verification is off', { exact: true })).toBeVisible();
    await expect(card.getByText('Off', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Turn on', exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Turn off', exact: true })).toHaveCount(0);
});

test('settings: when the server has no key for it, the card says so and offers no button', async ({ page }) => {
    await openSettings(page, {
        before: async () => {
            await page.route('**/api/auth/totp/status', (route) => route.fulfill({ json: totpStatus({ available: false }) }));
        },
    });

    const card = totpCard(page);
    await expect(card.getByText(`Two-step verification isn${CURLY}t configured on this server yet, so it can${CURLY}t be turned on.`))
        .toBeVisible();
    await expect(card.getByRole('button')).toHaveCount(0);
});

test('settings: a status that fails to load is said with a retry, not left blank', async ({ page }) => {
    let reads = 0;
    await openSettings(page, {
        before: async () => {
            await page.route('**/api/auth/totp/status', (route) => {
                reads += 1;
                return reads === 1
                    ? route.fulfill({ status: 500, json: { success: false, message: 'boom' } })
                    : route.fulfill({ json: totpStatus() });
            });
        },
    });

    const card = totpCard(page);
    await expect(card.getByText(`Couldn${CURLY}t load`, { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Turn on', exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(card.getByText('Off', { exact: true })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Turn on', exact: true })).toBeVisible();
});

// ---------------------------------------------- settings: my sign-in history

test('settings: my sign-in history lists the account events, showing the IP as the server sent it', async ({ page }) => {
    await openSettings(page, {
        before: async () => {
            await page.route('**/api/audit/logins/list**', (route) => route.fulfill({ json: auditPage([
                loginItem({ n: 3 }),
                // The server already hides the end of the IP on failed attempts.
                loginItem({
                    n: 2, type: 'login_failed', result: 'failure', ip: '198.51.100.*',
                    detail: { reason: 'invalid_credentials' },
                }),
                // Recorded before the account agreed to the notice: no IP at all.
                loginItem({ n: 1, type: 'totp_succeeded', ip: null }),
            ]) }));
        },
    });

    const card = historyCard(page);
    for (const name of ['Time', 'Event', 'Result', 'Source IP']) {
        await expect(card.getByRole('columnheader', { name, exact: true })).toBeVisible();
    }
    const rows = card.getByRole('row');
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(1)).toContainText('Signed in');
    await expect(rows.nth(1)).toContainText('Success');
    await expect(rows.nth(1)).toContainText('203.0.113.7');
    await expect(rows.nth(2)).toContainText('Sign-in failed');
    await expect(rows.nth(2)).toContainText('Wrong username or password');
    await expect(rows.nth(2)).toContainText('Failed');
    // As sent: nothing here fills the hidden part back in.
    await expect(rows.nth(2)).toContainText('198.51.100.*');
    await expect(rows.nth(3)).toContainText('Two-step code accepted');
    await expect(rows.nth(3)).toContainText('Not recorded');

    await expect(card.getByText('Page 1 of 1, 3 entries')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await expect(card.getByRole('button', { name: 'Next' })).toBeDisabled();
    // The full instant is on the cell for anyone who needs it.
    await expect(rows.nth(1).locator('td').first()).toHaveAttribute('title', /2026/);
});

test('settings: my sign-in history pages on the server, in the order the server sends', async ({ page }) => {
    const asked = [];
    await openSettings(page, {
        before: async () => {
            await page.route('**/api/audit/logins/list**', (route) => {
                const pageNo = Number(new URL(route.request().url()).searchParams.get('page'));
                asked.push(pageNo);
                const items = pageNo === 1
                    ? Array.from({ length: 20 }, (_, index) => loginItem({ n: 25 - index }))
                    : Array.from({ length: 5 }, (_, index) => loginItem({ n: 5 - index, type: 'recovery_code_used' }));
                return route.fulfill({ json: auditPage(items, { total: 25, page: pageNo }) });
            });
        },
    });

    const card = historyCard(page);
    await expect(card.getByText('Page 1 of 2, 25 entries')).toBeVisible();
    await expect(card.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await expect(card.getByText('Signed in', { exact: true })).toHaveCount(20);

    await card.getByRole('button', { name: 'Next' }).click();
    await expect(card.getByText('Page 2 of 2, 25 entries')).toBeVisible();
    await expect(card.getByText('Recovery code used', { exact: true })).toHaveCount(5);
    await expect(card.getByText('Signed in', { exact: true })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Next' })).toBeDisabled();

    await card.getByRole('button', { name: 'Previous' }).click();
    await expect(card.getByText('Page 1 of 2, 25 entries')).toBeVisible();
    expect(asked).toEqual([1, 2, 1]);
});

test('settings: an empty sign-in history is said plainly', async ({ page }) => {
    await openSettings(page);
    await expect(historyCard(page).getByText('No sign-in activity yet.')).toBeVisible();
    await expect(historyCard(page).getByRole('button', { name: 'Previous' })).toBeDisabled();
});

test('settings: a sign-in history that fails to load offers a retry for the page that was asked', async ({ page }) => {
    const asked = [];
    await openSettings(page, {
        before: async () => {
            await page.route('**/api/audit/logins/list**', (route) => {
                const pageNo = Number(new URL(route.request().url()).searchParams.get('page'));
                asked.push(pageNo);
                if (pageNo === 2 && asked.length === 2) {
                    return route.fulfill({ status: 500, json: { success: false, message: 'boom' } });
                }
                return route.fulfill({ json: auditPage(
                    [loginItem({ n: pageNo, type: pageNo === 2 ? 'recovery_code_used' : 'login_succeeded' })],
                    { total: 21, page: pageNo },
                ) });
            });
        },
    });

    const card = historyCard(page);
    await expect(card.getByText('Page 1 of 2, 21 entries')).toBeVisible();
    await card.getByRole('button', { name: 'Next' }).click();
    await expect(card.getByText(`Couldn${CURLY}t load`, { exact: true })).toBeVisible();
    // The retry asks for the page that failed, not for the first one.
    await card.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(card.getByText('Page 2 of 2, 21 entries')).toBeVisible();
    await expect(card.getByText('Recovery code used', { exact: true })).toBeVisible();
    expect(asked).toEqual([1, 2, 2]);
});

// ----------------------------------------------------------- admin: users

test('admin: the users table shows each account’s two-step state and when it registered', async ({ page }) => {
    await openAdmin(page, {
        users: [
            ADMIN_SELF,
            adminUser({ totpEnabled: true }),
            adminUser({ id: 'u3', username: 'carol', totpEnabled: false, createdAt: null }),
        ],
    });

    await expect(page.getByRole('columnheader', { name: 'Two-step', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Registered', exact: true })).toBeVisible();

    const bob = page.getByRole('row', { name: /bob/ });
    await expect(bob.getByText('On', { exact: true })).toBeVisible();
    const registered = bob.locator('td').nth(4);
    await expect(registered).toHaveText(/\S/);
    await expect(registered).toHaveAttribute('title', /2026/);

    // Another account with two-step on is the one case the reset is for.
    await expect(bob.getByRole('button', { name: 'Reset two-step' })).toBeVisible();
    // The administrator rebinds their own on the settings page instead.
    await expect(page.getByRole('row', { name: /boss/ }).getByRole('button', { name: 'Reset two-step' })).toHaveCount(0);

    const carol = page.getByRole('row', { name: /carol/ });
    await expect(carol.getByText('Off', { exact: true })).toBeVisible();
    await expect(carol.getByRole('button', { name: 'Reset two-step' })).toHaveCount(0);
    await expect(carol.locator('td').nth(4)).toHaveText('—');
});

test('admin: resetting two-step verification asks first, sends the account id, and reloads the table', async ({ page }) => {
    let bobOn = true;
    let userReads = 0;
    const resetBodies = [];
    await openAdmin(page, {
        before: async () => {
            await page.route('**/api/admin/users', (route) => {
                userReads += 1;
                return route.fulfill({ json: { success: true, data: [ADMIN_SELF, adminUser({ totpEnabled: bobOn })] } });
            });
            await page.route('**/api/admin/totp/reset', (route) => {
                resetBodies.push(route.request().postDataJSON());
                return route.fulfill({ json: { success: true, message: 'Two-step verification reset for "bob"' } });
            });
        },
    });

    const bob = page.getByRole('row', { name: /bob/ });
    const reset = bob.getByRole('button', { name: 'Reset two-step' });
    const confirmation = page.getByRole('dialog', { name: 'Please confirm' });

    await reset.click();
    await expect(confirmation.getByText(
        'After the reset, bob will be signed out and must set up an authenticator again. Reset?',
    )).toBeVisible();
    await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    expect(resetBodies).toEqual([]);

    bobOn = false;
    await reset.click();
    await confirmation.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect.poll(() => resetBodies).toEqual([{ userId: 'u2' }]);
    await expect(page.getByText('Two-step verification reset', { exact: true })).toBeVisible();
    await expect(bob.getByText('Off', { exact: true })).toBeVisible();
    await expect(bob.getByRole('button', { name: 'Reset two-step' })).toHaveCount(0);
    expect(userReads).toBeGreaterThanOrEqual(2);
});

// -------------------------------------------------- admin: registration switch

test('admin: the registration switch says when the server default is in force', async ({ page }) => {
    await openAdmin(page, { registration: registrationSetting({ source: 'env', registrationOpen: false }) });
    await expect(page.getByText('Not set here yet. Server default: Closed')).toBeVisible();
});

test('admin: the registration switch says who last changed it and when', async ({ page }) => {
    await openAdmin(page, {
        registration: registrationSetting({
            source: 'admin', registrationOpen: true, updatedAt: Date.UTC(2026, 10, 23, 14, 46, 26), updatedBy: 'boss',
        }),
    });
    await expect(page.getByText(/Last changed by boss at .+2026/)).toBeVisible();
    await expect(page.getByText(/Not set here yet/)).toHaveCount(0);
});

test('admin: without a server key a warning says the administrator requirement is not active', async ({ page }) => {
    await openAdmin(page, {
        before: async () => {
            await page.route('**/api/auth/totp/status', (route) => route.fulfill({ json: totpStatus({ available: false }) }));
        },
    });
    const warning = `Two-step verification isn${CURLY}t configured on this server, so the administrator requirement isn${CURLY}t active.`;
    await expect(page.getByText(warning)).toBeVisible();
});

test('admin: a status that cannot be read shows no warning and no error', async ({ page }) => {
    await openAdmin(page, {
        before: async () => {
            await page.route('**/api/auth/totp/status', (route) =>
                route.fulfill({ status: 500, json: { success: false, message: 'boom' } }));
        },
    });
    await expect(page.getByText(/configured on this server, so the administrator requirement/)).toHaveCount(0);
    await expect(page.getByText('boom', { exact: true })).toHaveCount(0);
});

// ----------------------------------------------------------- admin: audit log

test('admin: the audit log lists who did what, on whom, and from where', async ({ page }) => {
    await openAdmin(page, {
        before: async () => {
            await page.route('**/api/audit/logs/list**', (route) => route.fulfill({ json: auditPage([
                auditItem({ n: 4 }),
                auditItem({
                    n: 3, type: 'role_changed',
                    actor: { id: 'admin1', username: 'boss' }, subject: { id: 'u2', username: 'bob' },
                    ip: null, detail: { from: 'user', to: 'admin' },
                }),
                auditItem({
                    n: 2, type: 'user_deleted',
                    actor: { id: 'admin1', username: 'boss' }, subject: null, anonymized: true,
                }),
                auditItem({
                    n: 1, type: 'login_failed', result: 'failure', actor: null,
                    subject: { id: 'u9', username: null }, ip: '198.51.100.*',
                    detail: { reason: 'invalid_credentials', attemptedUsername: 'nosuch' },
                }),
            ]) }));
        },
    });

    const card = auditCard(page);
    for (const name of ['Time', 'Event', 'Result', 'Actor', 'Account', 'Source IP', 'Details']) {
        await expect(card.getByRole('columnheader', { name, exact: true })).toBeVisible();
    }
    const rows = card.getByRole('row');
    await expect(rows).toHaveCount(5);

    await expect(rows.nth(1)).toContainText('Signed in');
    await expect(rows.nth(1)).toContainText('alice');
    await expect(rows.nth(1)).toContainText('Success');
    await expect(rows.nth(1)).toContainText('203.0.113.7');

    await expect(rows.nth(2)).toContainText('Role changed');
    await expect(rows.nth(2).locator('td').nth(3)).toHaveText('boss');
    await expect(rows.nth(2).locator('td').nth(4)).toHaveText('bob');
    await expect(rows.nth(2).locator('td').nth(5)).toHaveText('—');

    // What is left of a deleted account: the record stays, the name is gone.
    await expect(rows.nth(3)).toContainText('Account deleted');
    await expect(rows.nth(3).getByText('Anonymized', { exact: true })).toBeVisible();
    await expect(rows.nth(3).locator('td').nth(4)).toHaveText('—');

    await expect(rows.nth(4)).toContainText('Sign-in failed');
    await expect(rows.nth(4).locator('td').nth(3)).toHaveText('—');
    await expect(rows.nth(4)).toContainText('198.51.100.*');
    await expect(rows.nth(4)).toContainText('Failed');

    // Details: only a row that has some can be expanded.
    await expect(rows.nth(1).getByRole('button', { name: 'Details' })).toBeDisabled();
    const details = rows.nth(2).getByRole('button', { name: 'Details' });
    await details.click();
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    // Roles and states use the wording the rest of the page uses.
    await expect(card.getByText('From: User', { exact: true })).toBeVisible();
    await expect(card.getByText('To: Admin', { exact: true })).toBeVisible();
    await details.click();
    await expect(card.getByText('From: User', { exact: true })).toHaveCount(0);

    await rows.nth(4).getByRole('button', { name: 'Details' }).click();
    // Values other than roles and states are shown as the server sent them.
    await expect(card.getByText('Reason: invalid_credentials', { exact: true })).toBeVisible();
    await expect(card.getByText('Entered username: nosuch', { exact: true })).toBeVisible();

    await expect(card.getByText('Page 1 of 1, 4 entries')).toBeVisible();
});

test('admin: audit filters are sent only on Apply, and turning a page sends them again', async ({ page }) => {
    const asked = [];
    await openAdmin(page, {
        before: async () => {
            await page.route('**/api/audit/logs/list**', (route) => {
                const params = Object.fromEntries(new URL(route.request().url()).searchParams);
                asked.push(params);
                const items = params.page === '1'
                    ? Array.from({ length: 20 }, (_, index) => auditItem({ n: 21 - index }))
                    : [auditItem({ n: 1 })];
                return route.fulfill({ json: auditPage(items, { total: 21, page: Number(params.page) }) });
            });
        },
    });

    const card = auditCard(page);
    const search = card.getByRole('search');
    await expect(card.getByText('Page 1 of 2, 21 entries')).toBeVisible();

    await search.getByLabel('Event type').click();
    await page.getByRole('option', { name: 'Sign-in failed', exact: true }).click();
    await search.getByLabel('Username').fill('alice');
    await search.getByLabel('Result', { exact: true }).click();
    await page.getByRole('option', { name: 'Failed', exact: true }).click();
    await search.getByLabel('From', { exact: true }).fill('2026-11-01T00:00');
    await search.getByLabel('To', { exact: true }).fill('2026-12-01T00:00');

    // Editing a filter asks nothing.
    expect(asked).toEqual([{ page: '1', pageSize: '20' }]);

    await search.getByRole('button', { name: 'Apply' }).click();
    await expect(card.getByText('Page 1 of 2, 21 entries')).toBeVisible();
    expect(asked[1]).toEqual({
        page: '1',
        pageSize: '20',
        type: 'login_failed',
        username: 'alice',
        result: 'failure',
        from: String(new Date('2026-11-01T00:00').getTime()),
        to: String(new Date('2026-12-01T00:00').getTime()),
    });

    // Paging keeps the filters of the list on screen.
    await card.getByRole('button', { name: 'Next' }).click();
    await expect(card.getByText('Page 2 of 2, 21 entries')).toBeVisible();
    expect(asked[2]).toEqual({ ...asked[1], page: '2' });

    await search.getByRole('button', { name: 'Clear filters' }).click();
    await expect(card.getByText('Page 1 of 2, 21 entries')).toBeVisible();
    expect(asked[3]).toEqual({ page: '1', pageSize: '20' });
    await expect(search.getByLabel('Username')).toHaveValue('');
    await expect(search.getByLabel('From', { exact: true })).toHaveValue('');
    await expect(search.getByText('All', { exact: true })).toHaveCount(2);
});

test('admin: a time range that starts after it ends is refused in the card and never sent', async ({ page }) => {
    const asked = [];
    await openAdmin(page, {
        before: async () => {
            await page.route('**/api/audit/logs/list**', (route) => {
                asked.push(route.request().url());
                return route.fulfill({ json: auditPage([auditItem()]) });
            });
        },
    });

    const card = auditCard(page);
    await expect(card.getByText('Page 1 of 1, 1 entries')).toBeVisible();
    const search = card.getByRole('search');
    await search.getByLabel('From', { exact: true }).fill('2026-12-01T00:00');
    await search.getByLabel('To', { exact: true }).fill('2026-11-01T00:00');
    await search.getByRole('button', { name: 'Apply' }).click();

    await expect(card.getByText('The start must be before the end.')).toBeVisible();
    expect(asked).toHaveLength(1);

    await search.getByRole('button', { name: 'Clear filters' }).click();
    await expect(card.getByText('The start must be before the end.')).toHaveCount(0);
    await expect(card.getByText('Page 1 of 1, 1 entries')).toBeVisible();
});

test('admin: an empty audit log and a failed load are each said in the card', async ({ page }) => {
    let reads = 0;
    await openAdmin(page, {
        before: async () => {
            await page.route('**/api/audit/logs/list**', (route) => {
                reads += 1;
                // Only the read after "Apply" fails; the retry succeeds.
                return reads === 2
                    ? route.fulfill({ status: 500, json: { success: false, message: 'boom' } })
                    : route.fulfill({ json: auditPage([]) });
            });
        },
    });

    const card = auditCard(page);
    await expect(card.getByText('No matching entries.')).toBeVisible();

    // A failed reload (here: after clearing the filters) is said in the card.
    const search = card.getByRole('search');
    await search.getByLabel('Username').fill('alice');
    await search.getByRole('button', { name: 'Apply' }).click();
    await expect(card.getByText(`Couldn${CURLY}t load`, { exact: true })).toBeVisible();
    await expect(page.getByText('boom', { exact: true })).toHaveCount(0);
    await card.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(card.getByText('No matching entries.')).toBeVisible();
});

test('admin: the audit card offers no way to change, export or remove anything', async ({ page }) => {
    await openAdmin(page, {
        before: async () => {
            await page.route('**/api/audit/logs/list**', (route) =>
                route.fulfill({ json: auditPage([auditItem({ detail: { role: 'user' }, type: 'registered' })]) }));
        },
    });

    const card = auditCard(page);
    await expect(card.getByText('Account registered')).toBeVisible();
    // The expand button of a row is an icon button, so it has a name but no text.
    const labels = (await card.getByRole('button').allTextContents()).map((name) => name.trim()).filter(Boolean);
    expect(labels).toEqual(['Apply', 'Clear filters', 'Previous', 'Next']);
    expect(await card.getByRole('button', { name: 'Details' }).count()).toBe(1);
    for (const forbidden of [/export/i, /delete/i, /remove/i, /purge/i, /clear log/i]) {
        expect(labels.filter((label) => forbidden.test(label))).toEqual([]);
    }
});
