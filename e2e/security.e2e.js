import { expect, test } from '@playwright/test';
import {
    ANONYMOUS_ME,
    GATE_REQUIRED_403,
    NOTICE_VERSION,
    RECOVERY_CODES,
    TOTP_CONFIRMED,
    TOTP_REQUIRED,
    TOTP_SETUP,
    galleryList,
    meResponse,
    mockBaseApi,
    noticePayload,
    totpStatus,
    useLanguage,
} from './mocks';

/**
 * R20 security and compliance, sign-in side (frontend-only, every /api call mocked):
 *  - the sign-in page: privacy notice before the form, consent on register,
 *    the second-factor step;
 *  - /gate: the page an account owes a post-login step to.
 *
 * The interface language is pinned to English so assertions can be exact.
 */

const PRIVACY_LINE = 'To protect accounts, we record the time and source IP of every sign-in attempt.';
const CONSENT_NAME = 'I have read and agree to the Privacy Notice';
const CONSENT_LABEL = 'I have read and agree to the';
const NOTICE_UPDATED = 'The privacy notice has been updated. Please read the latest version and confirm again.';
const NOTICE_UPDATE_409 = {
    status: 409,
    json: {
        success: false,
        code: 'PRIVACY_NOTICE_UPDATED',
        message: 'Privacy notice has been updated, please review and consent again',
    },
};

const OPEN_REGISTRATION = { success: true, data: { hasUsers: true, registrationOpen: true } };

/** Anonymous visitor with registration open and a notice that loads on demand. */
async function anonymousVisitor(page) {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/status', (route) => route.fulfill({ json: OPEN_REGISTRATION }));
    await page.route('**/api/auth/me', (route) => route.fulfill(ANONYMOUS_ME));
}

async function fillCredentials(page, username = 'alice', password = 'correct horse battery') {
    await page.getByLabel('Username').fill(username);
    await page.getByLabel(/^Password/).fill(password);
}

// ---------------------------------------------------------------- sign-in page

test('the sign-in page announces IP recording before the form and shows the notice only when asked', async ({ page }) => {
    await anonymousVisitor(page);
    const noticeRequests = [];
    await page.route('**/api/privacy/notices/current**', (route) => {
        noticeRequests.push(route.request().url());
        return route.fulfill({
            json: noticePayload({ intro: 'Intro with <b>markup</b> and <img src=x onerror=alert(1)>.' }),
        });
    });

    await page.goto('/login');

    // The line sits above the form, and nothing was fetched to draw it.
    await expect(page.getByText(PRIVACY_LINE)).toBeVisible();
    await expect(page.getByLabel('Username')).toBeVisible();
    expect(noticeRequests).toEqual([]);

    await page.getByRole('button', { name: 'Privacy notice', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Privacy Notice' })).toBeVisible();
    expect(noticeRequests).toHaveLength(1);
    expect(noticeRequests[0]).toContain('lng=en');

    // Rendered as text: the markup is visible as characters, not as elements.
    await expect(dialog.getByText(/Intro with <b>markup<\/b>/)).toBeVisible();
    await expect(dialog.locator('b, img, script')).toHaveCount(0);
    await expect(dialog.getByRole('heading', { name: '1. Information we collect' })).toBeVisible();
    // The operator is named in the notice header and again in the contact section.
    await expect(dialog.getByText('Operator: E2E Operator').first()).toBeVisible();

    // The effective date is still the release-time placeholder: not shown raw.
    await expect(dialog.getByText(`Version ${NOTICE_VERSION}`, { exact: true })).toBeVisible();
    await expect(dialog.getByText(/\{\{/)).toHaveCount(0);

    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
});

test('register: consent cannot be given before the notice has loaded, and travels with the request', async ({ page }) => {
    await anonymousVisitor(page);
    let releaseNotice;
    const noticeGate = new Promise((resolve) => {
        releaseNotice = resolve;
    });
    await page.route('**/api/privacy/notices/current**', async (route) => {
        await noticeGate;
        await route.fulfill({ json: noticePayload() });
    });
    const bodies = [];
    await page.route('**/api/auth/register', (route) => {
        bodies.push(route.request().postDataJSON());
        return route.fulfill({ status: 201, json: meResponse({ pending: ['privacy_consent'] }) });
    });

    await page.goto('/login?next=%2Frecords');
    await page.getByRole('button', { name: /need an account/i }).click();

    const consent = page.getByRole('checkbox', { name: CONSENT_NAME });
    const submit = page.getByRole('button', { name: 'Create account', exact: true });

    // Register mode fetches the notice by itself; while it is on its way the
    // checkbox is disabled and says so.
    await expect(page.getByText('Loading the privacy notice…')).toBeVisible();
    await expect(consent).toBeDisabled();
    await expect(submit).toBeDisabled();
    expect(bodies).toEqual([]);

    releaseNotice();
    await expect(consent).toBeEnabled();
    await expect(page.getByText('Loading the privacy notice…')).toHaveCount(0);

    // Loaded but not agreed: still cannot submit.
    await fillCredentials(page);
    await expect(submit).toBeDisabled();

    await consent.check();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect.poll(() => bodies).toEqual([{
        username: 'alice',
        password: 'correct horse battery',
        agree: true,
        privacyVersion: NOTICE_VERSION,
    }]);

    // The account still owes the notice: on to the gate page, same destination.
    await expect(page).toHaveURL(/\/gate\?next=%2Frecords$/);
});

test('the words naming the notice inside the consent sentence open the notice too', async ({ page }) => {
    await anonymousVisitor(page);
    const noticeRequests = [];
    await page.route('**/api/privacy/notices/current**', (route) => {
        noticeRequests.push(route.request().url());
        return route.fulfill({ json: noticePayload() });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: /need an account/i }).click();
    const consent = page.getByRole('checkbox', { name: CONSENT_NAME });
    await expect(consent).toBeEnabled();
    // The in-form link is separate from the one above the form.
    await expect(page.getByText(CONSENT_LABEL)).toBeVisible();

    await page.getByRole('button', { name: 'Privacy Notice', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Privacy Notice' })).toBeVisible();
    expect(noticeRequests).toHaveLength(1); // the prefetch, nothing more

    // The dialog is modal, which hides the form from the accessibility tree:
    // close it first, then check that the link inside the label did not tick the box.
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(consent).not.toBeChecked();
    await expect(consent).toBeEnabled();
});

test('register: a notice updated behind the visitor clears consent and shows the new text', async ({ page }) => {
    await anonymousVisitor(page);
    const versions = [NOTICE_VERSION, '2026.12.1'];
    const noticeRequests = [];
    await page.route('**/api/privacy/notices/current**', (route) => {
        const version = versions[Math.min(noticeRequests.length, versions.length - 1)];
        noticeRequests.push(version);
        return route.fulfill({ json: noticePayload({ version }) });
    });
    const bodies = [];
    await page.route('**/api/auth/register', (route) => {
        bodies.push(route.request().postDataJSON());
        return route.fulfill(NOTICE_UPDATE_409);
    });

    await page.goto('/login');
    await page.getByRole('button', { name: /need an account/i }).click();
    const consent = page.getByRole('checkbox', { name: CONSENT_NAME });
    const submit = page.getByRole('button', { name: 'Create account', exact: true });
    await expect(consent).toBeEnabled();
    await fillCredentials(page);
    await consent.check();
    await submit.click();

    await expect.poll(() => bodies).toHaveLength(1);
    expect(bodies[0]).toMatchObject({ agree: true, privacyVersion: NOTICE_VERSION });
    await expect(page.getByText(NOTICE_UPDATED)).toBeVisible();
    // Asked again, against the new version.
    await expect(consent).not.toBeChecked();
    await expect(submit).toBeDisabled();
    await expect.poll(() => noticeRequests).toEqual([NOTICE_VERSION, '2026.12.1']);
    await expect(consent).toBeEnabled();

    await consent.check();
    await submit.click();
    await expect.poll(() => bodies).toHaveLength(2);
    expect(bodies[1]).toMatchObject({ agree: true, privacyVersion: '2026.12.1' });
});

test('register: a notice that fails to load leaves consent disabled and offers a retry', async ({ page }) => {
    await anonymousVisitor(page);
    let attempts = 0;
    await page.route('**/api/privacy/notices/current**', (route) => {
        attempts += 1;
        return attempts === 1
            ? route.fulfill({ status: 500, json: { success: false, message: 'boom' } })
            : route.fulfill({ json: noticePayload() });
    });

    await page.goto('/login');
    await page.getByRole('button', { name: /need an account/i }).click();

    await expect(page.getByText(/Could not load the privacy notice/)).toBeVisible();
    await expect(page.getByRole('checkbox', { name: CONSENT_NAME })).toBeDisabled();
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('checkbox', { name: CONSENT_NAME })).toBeEnabled();
});

test('register: switching back to sign-in clears the consent', async ({ page }) => {
    await anonymousVisitor(page);
    await page.route('**/api/privacy/notices/current**', (route) => route.fulfill({ json: noticePayload() }));

    await page.goto('/login');
    await page.getByRole('button', { name: /need an account/i }).click();
    const consent = page.getByRole('checkbox', { name: CONSENT_NAME });
    await expect(consent).toBeEnabled();
    await consent.check();
    await expect(consent).toBeChecked();

    await page.getByRole('button', { name: /already have an account/i }).click();
    await expect(consent).toHaveCount(0);
    await page.getByRole('button', { name: /need an account/i }).click();
    await expect(consent).not.toBeChecked();
});

// ---------------------------------------------------------- second-factor step

async function secondFactorVisitor(page, { verify, recover } = {}) {
    await useLanguage(page);
    await mockBaseApi(page);
    const loginBodies = [];
    await page.route('**/api/auth/me', (route) => route.fulfill(ANONYMOUS_ME));
    await page.route('**/api/auth/login', (route) => {
        loginBodies.push(route.request().postDataJSON());
        return route.fulfill({ json: TOTP_REQUIRED });
    });
    if (verify) {
        await page.route('**/api/auth/totp/verify', verify);
    }
    if (recover) {
        await page.route('**/api/auth/totp/recover', recover);
    }
    await page.goto('/login?next=%2Fgallery');
    await fillCredentials(page);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Two-step verification' })).toBeVisible();
    expect(loginBodies).toEqual([{ username: 'alice', password: 'correct horse battery' }]);
}

test('an account with two-step verification is asked for a code before any session exists', async ({ page }) => {
    const verifyBodies = [];
    const recoverBodies = [];
    await secondFactorVisitor(page, {
        verify: (route) => {
            verifyBodies.push(route.request().postDataJSON());
            return route.fulfill({
                status: 401,
                json: { success: false, message: 'Invalid verification code', data: { attemptsRemaining: 3 } },
            });
        },
        recover: (route) => {
            recoverBodies.push(route.request().postDataJSON());
            return route.fulfill({ json: meResponse({ pending: [] }) });
        },
    });
    await page.route('**/api/gallery/**', (route) => route.fulfill({ json: galleryList([]) }));

    // The password form is replaced by the code step: no password on screen.
    await expect(page.getByLabel(/^Password/)).toHaveCount(0);
    const submit = page.getByRole('button', { name: 'Verify and sign in' });
    const code = page.getByLabel('Code', { exact: true });
    await expect(code).toBeFocused();
    await expect(submit).toBeDisabled();

    await code.fill('12345');
    await expect(submit).toBeDisabled();
    await code.fill('123456');
    await submit.click();

    // The ticket from the password step is what gets verified, with the code.
    await expect.poll(() => verifyBodies).toEqual([{ ticket: 'e2eticket01', code: '123456' }]);
    await expect(page.getByText('Incorrect code. 3 attempts left.')).toBeVisible();
    await expect(code).toHaveValue('');

    // Fall back to a recovery code; the hyphen and the case do not matter.
    await page.getByRole('button', { name: /use a recovery code/i }).click();
    await page.getByLabel('Recovery code').fill('abcde-fgh23');
    await submit.click();
    await expect.poll(() => recoverBodies).toEqual([{ ticket: 'e2eticket01', recoveryCode: 'abcde-fgh23' }]);

    // Session established: on to where the visitor was heading.
    await expect(page).toHaveURL(/\/gallery$/);
    expect(page.url()).not.toContain('e2eticket01');
});

test('too many wrong codes: the wait comes from Retry-After and only going back is left', async ({ page }) => {
    await secondFactorVisitor(page, {
        verify: (route) => route.fulfill({
            status: 429,
            headers: { 'retry-after': '119' },
            json: { success: false, message: 'Too many verification attempts, please try again later' },
        }),
    });

    const submit = page.getByRole('button', { name: 'Verify and sign in' });
    await page.getByLabel('Code', { exact: true }).fill('123456');
    await submit.click();

    await expect(page.getByText('Too many attempts. Sign in again in 2 minutes.')).toBeVisible();
    await expect(page.getByText(/Incorrect code/)).toHaveCount(0);
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('button', { name: /use a recovery code/i })).toHaveCount(0);

    // Back to the password step: username kept, password cleared.
    await page.getByRole('button', { name: 'Back to sign-in' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('Username')).toHaveValue('alice');
    await expect(page.getByLabel(/^Password/)).toHaveValue('');
});

test('the lock-out message says "1 minute" when that is all Retry-After asks for', async ({ page }) => {
    await secondFactorVisitor(page, {
        verify: (route) => route.fulfill({
            status: 429,
            headers: { 'Retry-After': '45' },
            json: { success: false, message: 'Too many verification attempts, please try again later' },
        }),
    });
    await page.getByLabel('Code', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page.getByText('Too many attempts. Sign in again in 1 minute.')).toBeVisible();
});

test('without a readable Retry-After the wait falls back to the default window', async ({ page }) => {
    await secondFactorVisitor(page, {
        verify: (route) => route.fulfill({
            status: 429,
            json: { success: false, message: 'Too many verification attempts, please try again later' },
        }),
    });
    await page.getByLabel('Code', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();
    await expect(page.getByText('Too many attempts. Sign in again in 15 minutes.')).toBeVisible();
});

test('an expired verification ticket returns to the password step and says so', async ({ page }) => {
    await secondFactorVisitor(page, {
        verify: (route) => route.fulfill({
            status: 400,
            json: { success: false, code: 'TICKET_INVALID', message: 'Verification session expired or invalid' },
        }),
    });
    await page.getByLabel('Code', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Verify and sign in' }).click();

    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
    await expect(page.getByText('Verification timed out. Sign in again.')).toBeVisible();
    await expect(page.getByLabel('Username')).toHaveValue('alice');
});

test('second factor unavailable on the server: the message is shown and nothing can be submitted', async ({ page }) => {
    await secondFactorVisitor(page, {
        verify: (route) => route.fulfill({
            status: 503,
            json: { success: false, code: 'TOTP_UNAVAILABLE', message: 'Two-factor verification is unavailable' },
        }),
    });
    const submit = page.getByRole('button', { name: 'Verify and sign in' });
    await page.getByLabel('Code', { exact: true }).fill('123456');
    await submit.click();
    await expect(page.getByText('Two-factor verification is unavailable')).toBeVisible();
    await expect(submit).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Back to sign-in' })).toBeEnabled();
});

// ------------------------------------------------------------------ gate page

const GATE_TITLE = 'Please read and confirm the Privacy Notice';

test('an account that owes the notice is routed from a protected page to the gate, and back once it agrees', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: meResponse({ pending: ['privacy_consent'] }) }));
    await page.route('**/api/privacy/notices/current**', (route) => route.fulfill({ json: noticePayload() }));
    const consentBodies = [];
    await page.route('**/api/privacy/consent/accept', (route) => {
        consentBodies.push(route.request().postDataJSON());
        return route.fulfill({
            json: { success: true, data: { version: NOTICE_VERSION, consentedAt: Date.now(), pending: [] } },
        });
    });

    await page.goto('/settings?ownerId=e2euser');

    await expect(page).toHaveURL(/\/gate\?next=%2Fsettings%3FownerId%3De2euser$/);
    await expect(page.getByRole('heading', { level: 1, name: GATE_TITLE })).toBeVisible();
    const accept = page.getByRole('button', { name: 'I have read and agree' });
    await expect(accept).toBeEnabled();
    // The text that is being agreed to is on screen.
    await expect(page.getByText('What this service collects and why.')).toBeVisible();

    await accept.click();
    expect(consentBodies).toEqual([{ version: NOTICE_VERSION }]);

    // Nothing owed any more: straight back to the page that was asked for.
    await expect(page).toHaveURL(/\/settings\?ownerId=e2euser$/);
});

test('gate: consent is never collected for a notice that did not load; retry works', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: meResponse({ pending: ['privacy_consent'] }) }));
    let attempts = 0;
    await page.route('**/api/privacy/notices/current**', (route) => {
        attempts += 1;
        return attempts === 1
            ? route.fulfill({ status: 500, json: { success: false, message: 'boom' } })
            : route.fulfill({ json: noticePayload() });
    });
    const consentBodies = [];
    await page.route('**/api/privacy/consent/accept', (route) => {
        consentBodies.push(route.request().postDataJSON());
        return route.fulfill({ json: { success: true, data: { version: NOTICE_VERSION, consentedAt: 1, pending: [] } } });
    });

    await page.goto('/gate');
    await expect(page.getByText(/Could not load the privacy notice/)).toBeVisible();
    const accept = page.getByRole('button', { name: 'I have read and agree' });
    await expect(accept).toBeDisabled();

    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(accept).toBeEnabled();
    await accept.click();
    expect(consentBodies).toEqual([{ version: NOTICE_VERSION }]);
});

test('gate: a notice updated while it was being read is fetched again before consent can be given', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: meResponse({ pending: ['privacy_consent'] }) }));
    const versions = [NOTICE_VERSION, '2026.12.1'];
    const fetched = [];
    await page.route('**/api/privacy/notices/current**', (route) => {
        const version = versions[Math.min(fetched.length, versions.length - 1)];
        fetched.push(version);
        return route.fulfill({ json: noticePayload({ version }) });
    });
    const consentBodies = [];
    await page.route('**/api/privacy/consent/accept', (route) => {
        consentBodies.push(route.request().postDataJSON());
        return consentBodies.length === 1
            ? route.fulfill(NOTICE_UPDATE_409)
            : route.fulfill({ json: { success: true, data: { version: '2026.12.1', consentedAt: 1, pending: [] } } });
    });

    await page.goto('/gate?next=%2Fgallery');
    await page.route('**/api/gallery/**', (route) => route.fulfill({ json: galleryList([]) }));
    const accept = page.getByRole('button', { name: 'I have read and agree' });
    await expect(accept).toBeEnabled();
    await accept.click();

    await expect(page.getByText(NOTICE_UPDATED)).toBeVisible();
    await expect.poll(() => fetched).toEqual([NOTICE_VERSION, '2026.12.1']);
    await expect(accept).toBeEnabled();
    await accept.click();
    expect(consentBodies).toEqual([{ version: NOTICE_VERSION }, { version: '2026.12.1' }]);
    await expect(page).toHaveURL(/\/gallery$/);
});

test('gate: declining signs the account out', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: meResponse({ pending: ['privacy_consent'] }) }));
    await page.route('**/api/privacy/notices/current**', (route) => route.fulfill({ json: noticePayload() }));
    const logouts = [];
    await page.route('**/api/auth/logout', (route) => {
        logouts.push(route.request().method());
        return route.fulfill({ json: { success: true } });
    });

    await page.goto('/gate');
    await page.getByRole('button', { name: 'Disagree and sign out' }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(logouts).toEqual(['POST']);
});

test('gate: the card sign-out button works the same way', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: meResponse({ pending: ['privacy_consent'] }) }));
    await page.route('**/api/privacy/notices/current**', (route) => route.fulfill({ json: noticePayload() }));

    await page.goto('/gate');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
});

test('gate: nothing owed means the page just forwards to the destination (never back to itself)', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: meResponse({ pending: [] }) }));
    await page.route('**/api/gallery/**', (route) => route.fulfill({ json: galleryList([]) }));

    await page.goto('/gate?next=%2Fgallery');
    await expect(page).toHaveURL(/\/gallery$/);

    // A destination that is the gate itself would loop: home instead.
    await page.goto('/gate?next=%2Fgate');
    await expect(page).toHaveURL(/\/$/);
});

test('gate: a visitor without a session is sent to sign in, keeping the destination', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill(ANONYMOUS_ME));

    await page.goto('/gate?next=%2Frecords');
    await expect(page).toHaveURL(/\/login\?next=%2Frecords$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
});

test('gate: a step this build does not know is reported instead of a blank card', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: meResponse({ pending: ['something_new'] }) }));

    await page.goto('/gate');
    await expect(page.getByText(/This version of the app can’t complete a step/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('a request refused mid-session for a missing step brings the account to the gate and re-reads it', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    // First read: nothing owed (so the timer page opens). Later reads: the
    // notice step is owed — as if the notice had been republished meanwhile.
    let meReads = 0;
    await page.route('**/api/auth/me', (route) => {
        meReads += 1;
        return route.fulfill({ json: meResponse({ pending: meReads === 1 ? [] : ['privacy_consent'] }) });
    });
    for (const pattern of ['**/api/configurations', '**/api/configurations/**']) {
        await page.route(pattern, (route) => route.fulfill(GATE_REQUIRED_403));
    }
    await page.route('**/api/privacy/notices/current**', (route) => route.fulfill({ json: noticePayload() }));

    await page.goto('/');

    // A full navigation (the interceptor cannot use the Router), to the gate,
    // carrying where the account was and the flag that says "re-read me".
    await expect(page).toHaveURL(/\/gate\?next=%2F&sync=1$/);
    await expect(page.getByRole('heading', { level: 1, name: GATE_TITLE })).toBeVisible();
    expect(meReads).toBeGreaterThanOrEqual(3); // boot, gate sync (the timer page's read aborted by the navigation)
});

// -------------------------------------------------- gate: mandatory two-step setup

/** Administrator who owes the authenticator binding; `/me` clears it once asked again. */
async function gatedAdmin(page, { needsPassword = true } = {}) {
    await useLanguage(page);
    await mockBaseApi(page);
    let meReads = 0;
    await page.route('**/api/auth/me', (route) => {
        meReads += 1;
        return route.fulfill({ json: meResponse({ role: 'admin', pending: meReads === 1 ? ['totp_enroll'] : [] }) });
    });
    await page.route('**/api/auth/totp/status', (route) =>
        route.fulfill({ json: totpStatus({ enforced: true, needsPassword }) }));
    const setupBodies = [];
    await page.route('**/api/auth/totp/setup', (route) => {
        setupBodies.push(route.request().postDataJSON());
        return route.fulfill({ json: TOTP_SETUP });
    });
    const confirmBodies = [];
    await page.route('**/api/auth/totp/confirm', (route) => {
        confirmBodies.push(route.request().postDataJSON());
        return route.fulfill({ json: TOTP_CONFIRMED });
    });
    // Where the administrator is headed afterwards.
    await page.route('**/api/admin/users', (route) => route.fulfill({ json: { success: true, data: [] } }));
    await page.route('**/api/admin/configurations', (route) => route.fulfill({ json: { success: true, data: [] } }));
    await page.route('**/api/admin/settings/registration', (route) =>
        route.fulfill({ json: { success: true, data: { registrationOpen: false, source: 'env', envDefault: false, updatedAt: null, updatedBy: null } } }));

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/gate\?next=%2Fadmin$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Set up two-step verification' })).toBeVisible();
    await expect(page.getByText(/Administrator accounts must use two-step verification/)).toBeVisible();
    return { setupBodies, confirmBodies };
}

test('the administrator binds an authenticator with a password proof, a scanned key and one code, then saves the recovery codes', async ({ page }) => {
    const { setupBodies, confirmBodies } = await gatedAdmin(page);

    // Step 0: the sign-in is not recent, so the password is asked first.
    await page.getByLabel(/^Password/).fill('s3cret-pw');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect.poll(() => setupBodies).toEqual([{ password: 's3cret-pw' }]);

    // Step 1: the QR code is drawn in the browser from the otpauth link …
    const qr = page.getByRole('img', { name: 'Set up two-step verification' });
    await expect(qr).toBeVisible();
    await expect.poll(() => qr.getAttribute('src')).toMatch(/^data:image\//);
    // … with the two ways that work without a camera.
    await expect(page.getByRole('link', { name: /add it to your authenticator/i }))
        .toHaveAttribute('href', /^otpauth:\/\/totp\//);
    await expect(page.getByText('JBSW Y3DP EHPK 3PXP K3PX PK3P XPK3 P')).toBeVisible();

    // Step 2: one code from the app.
    const code = page.getByLabel('Code', { exact: true });
    const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
    await expect(confirm).toBeDisabled();
    await code.fill('123456');
    await confirm.click();
    await expect.poll(() => confirmBodies).toEqual([{ code: '123456' }]);

    // Step 3: the recovery codes, shown once, and the key gone from screen.
    const codes = page.locator('pre');
    await expect(codes).toHaveCount(1);
    // Exactly these ten codes, one per line, in the order the server sent them.
    await expect(codes).toHaveText(RECOVERY_CODES.join('\n'));
    await expect(page.getByText('JBSW Y3DP EHPK 3PXP K3PX PK3P XPK3 P')).toHaveCount(0);
    await expect(page.getByText(/signed out on your other devices/)).toBeVisible();

    // Leaving is only possible after confirming the codes are saved.
    const done = page.getByRole('button', { name: 'Done', exact: true });
    await expect(done).toBeDisabled();
    await page.getByRole('checkbox', { name: 'I’ve saved my recovery codes' }).check();
    await done.click();

    // The account is re-read: nothing owed, on to the admin page.
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText('Administration', { exact: true })).toBeVisible();
    // Never persisted client-side.
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })))
        .not.toMatch(/JBSWY3DP|ABCDE-FGH23|s3cret-pw|e2eticket/);
});

test('binding: a recent sign-in skips the password step', async ({ page }) => {
    const { setupBodies } = await gatedAdmin(page, { needsPassword: false });
    await expect(page.getByLabel(/^Password/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
    expect(setupBodies).toEqual([{}]);
});

test('binding: a wrong password is reported in place and the scan step does not start', async ({ page }) => {
    await gatedAdmin(page);
    // This spec installs its own setup handler, so it records the bodies itself.
    const setupBodies = [];
    let attempts = 0;
    await page.route('**/api/auth/totp/setup', (route) => {
        setupBodies.push(route.request().postDataJSON());
        attempts += 1;
        return attempts === 1
            ? route.fulfill({ status: 400, json: { success: false, message: 'Password is incorrect' } })
            : route.fulfill({ json: TOTP_SETUP });
    });

    // The password is checked by the request that starts the binding, so that
    // one request is sent; what must not happen is the scan step appearing.
    await page.getByLabel(/^Password/).fill('wrong-pw');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByText('Wrong password.')).toBeVisible();
    expect(setupBodies).toEqual([{ password: 'wrong-pw' }]);
    await expect(page.getByLabel(/^Password/)).toBeVisible();
    await expect(page.getByLabel('Code', { exact: true })).toHaveCount(0);
    await expect(page.getByRole('img', { name: 'Set up two-step verification' })).toHaveCount(0);

    await page.getByLabel(/^Password/).fill('right-pw');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
    expect(setupBodies).toEqual([{ password: 'wrong-pw' }, { password: 'right-pw' }]);
    // A refused proof is never retried with the old password behind the scenes.
    expect(setupBodies).toHaveLength(2);
});

test('binding: a wrong code clears the field and asks again', async ({ page }) => {
    await gatedAdmin(page, { needsPassword: false });
    // This spec installs its own confirm handler, so it records the bodies itself.
    const confirmBodies = [];
    let attempts = 0;
    await page.route('**/api/auth/totp/confirm', (route) => {
        confirmBodies.push(route.request().postDataJSON());
        attempts += 1;
        return attempts === 1
            ? route.fulfill({
                status: 401,
                json: { success: false, message: 'Invalid verification code', data: { attemptsRemaining: 3 } },
            })
            : route.fulfill({ json: TOTP_CONFIRMED });
    });

    const code = page.getByLabel('Code', { exact: true });
    await code.fill('000000');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByText(/Incorrect code\. Check that your phone’s clock/)).toBeVisible();
    await expect(code).toHaveValue('');
    await expect(code).toBeFocused();

    await code.fill('123456');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.locator('pre')).toContainText(RECOVERY_CODES[0]);
    expect(confirmBodies).toEqual([{ code: '000000' }, { code: '123456' }]);
});

test('binding: running out of attempts is reported as a wait, never as a wrong code', async ({ page }) => {
    await gatedAdmin(page, { needsPassword: false });
    let attempts = 0;
    await page.route('**/api/auth/totp/confirm', (route) => {
        attempts += 1;
        return attempts === 1
            ? route.fulfill({
                status: 429,
                headers: { 'retry-after': '60' },
                json: { success: false, message: 'Too many verification attempts, please try again later' },
            })
            : route.fulfill({ json: TOTP_CONFIRMED });
    });

    const confirm = page.getByRole('button', { name: 'Confirm', exact: true });
    const code = page.getByLabel('Code', { exact: true });
    await code.fill('123456');
    await confirm.click();

    await expect(page.getByText('Too many attempts. Try again in 1 minute.')).toBeVisible();
    await expect(page.getByText(/Incorrect code/)).toHaveCount(0);
    await expect(confirm).toBeDisabled();
    // Still a way out, and a way to try again once the wait is over.
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(confirm).toBeEnabled();

    await code.fill('123456');
    await confirm.click();
    await expect(page.locator('pre')).toContainText(RECOVERY_CODES[0]);
});

test('binding: a setup that timed out starts over with a fresh key', async ({ page }) => {
    const { setupBodies } = await gatedAdmin(page, { needsPassword: false });
    const OLD_KEY = 'JBSW Y3DP EHPK 3PXP K3PX PK3P XPK3 P';
    const FRESH_SECRET = 'KRSXG5CTMVRXEZLUNF2GSMZ3GNZSSZTQ';
    const FRESH_KEY = 'KRSX G5CT MVRX EZLU NF2G SMZ3 GNZS SZTQ';
    // The first key has arrived …
    await expect(page.getByText(OLD_KEY)).toBeVisible();
    expect(setupBodies).toHaveLength(1);

    await page.route('**/api/auth/totp/confirm', (route) => route.fulfill({
        status: 400,
        json: { success: false, code: 'SETUP_EXPIRED', message: 'Setup session expired, start again' },
    }));
    // … and a restart is answered with a different one, as a real server would.
    await page.route('**/api/auth/totp/setup', (route) => route.fulfill({
        json: {
            success: true,
            data: {
                otpauthUri: `otpauth://totp/Debate%20Timer:e2e?secret=${FRESH_SECRET}&issuer=Debate%20Timer`,
                secret: FRESH_SECRET,
                expiresIn: 600,
            },
        },
    }));

    await page.getByLabel('Code', { exact: true }).fill('123456');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(page.getByText('Setup timed out. Please start again.')).toBeVisible();
    // The old key is off screen for good; what is on screen now is the new one,
    // which could only have come from the restarted setup.
    await expect(page.getByText(FRESH_KEY)).toBeVisible();
    await expect(page.getByText(OLD_KEY)).toHaveCount(0);
    await expect(page.getByLabel('Code', { exact: true })).toHaveValue('');
    await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
});

test('gate: without a server key the step cannot be done here; "Continue" moves the account on', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: meResponse({ role: 'admin', pending: ['totp_enroll'] }) }));
    await page.route('**/api/auth/totp/status', (route) => route.fulfill({ json: totpStatus({ available: false }) }));

    await page.goto('/gate');
    await expect(page.getByText(/Two-step verification isn’t configured on this server yet/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
});

test('gate: when the status cannot be read, the step offers a retry instead of a dead end', async ({ page }) => {
    await useLanguage(page);
    await mockBaseApi(page);
    await page.route('**/api/auth/me', (route) => route.fulfill({ json: meResponse({ role: 'admin', pending: ['totp_enroll'] }) }));
    let attempts = 0;
    await page.route('**/api/auth/totp/status', (route) => {
        attempts += 1;
        return attempts === 1
            ? route.fulfill({ status: 500, json: { success: false, message: 'boom' } })
            : route.fulfill({ json: totpStatus({ enforced: true, needsPassword: false }) });
    });
    await page.route('**/api/auth/totp/setup', (route) => route.fulfill({ json: TOTP_SETUP }));

    await page.goto('/gate');
    await expect(page.getByText('Couldn’t load', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Confirm', exact: true })).toBeVisible();
});
