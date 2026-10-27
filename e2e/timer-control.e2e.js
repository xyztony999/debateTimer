import { expect, test } from '@playwright/test';
import { mockBaseApi } from './mocks.js';

/**
 * Timer control page with a fully mocked API. Guards the core local loop:
 * stage switching via the PID timeline, dual-mode clocks, keyboard start,
 * the desktop-form pairing gate, and the TTS announcements (speechSynthesis
 * stubbed via addInitScript — playwright is silent, so speak() is recorded
 * and asserted instead of heard).
 */
test.beforeEach(async ({ page }) => {
    await mockBaseApi(page);
});

/** Pre-load TTS prefs + a recording speechSynthesis stub; kill transitions. */
async function enableTts(page, { lang = 'en', enabled = true } = {}) {
    await page.addInitScript(({ lang: initLang, ttsEnabled }) => {
        // Freeze CSS transitions/animations before any assertion (anti-flake).
        try {
            const noMotion = document.createElement('style');
            noMotion.textContent = '* { transition: none !important; animation: none !important; }';
            (document.head ?? document.documentElement)?.append(noMotion);
        } catch {
            // Head not ready yet — transitions are a nice-to-have here.
        }

        localStorage.setItem('debateTimerLang', initLang);
        localStorage.setItem('timer.soundPrefs', JSON.stringify({
            warn30: { sound: 'split', volume: 100 },
            timeUp: { sound: 'timeup', volume: 100 },
            mustStop: { sound: 'notify', volume: 100 },
            tts: { enabled: ttsEnabled, warn30: true, timeUp: true, mustStop: true, handover: true },
        }));

        const calls = [];
        const StubUtterance = class {
            constructor(text) {
                this.text = text;
                this.lang = '';
                this.volume = 1;
            }
        };
        const stubSynth = {
            getVoices: () => [],
            cancel: () => {},
            speak: (utterance) => calls.push({ text: utterance.text, lang: utterance.lang }),
        };
        // speechSynthesis is a read-only prototype getter in Chromium — plain
        // assignment silently no-ops and the native engine would then reject
        // stub utterances. Define own properties to shadow both.
        Object.defineProperty(window, 'SpeechSynthesisUtterance', {
            value: StubUtterance, writable: true, configurable: true,
        });
        Object.defineProperty(window, 'speechSynthesis', {
            value: stubSynth, writable: true, configurable: true,
        });
        window.__tts = calls;
    }, { lang, ttsEnabled: enabled });
}

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

// ---------------------------------------------------------------------------
// TTS announcements: engine voice events → hook → speechSynthesis.speak.
// ---------------------------------------------------------------------------

// The one-shot primeTts unlock speaks a silent " " warm-up on the first
// gesture — filter it out so assertions see real announcements only.
const spokenCalls = (page) => page.evaluate(
    () => window.__tts.filter((call) => call.text.trim() !== ''),
);

test('sound-check test buttons speak the announcements in the UI language', async ({ page }) => {
    await enableTts(page, { lang: 'zh-Hans' });
    await page.goto('/');

    // sound_check is the first stage: its bell-test buttons are already up.
    await page.getByRole('button', { name: /测试30秒声音/ }).click();
    await page.getByRole('button', { name: /测试结束声音/ }).click();

    await expect.poll(async () => (await spokenCalls(page)).length).toBe(2);
    const calls = await spokenCalls(page);
    expect(calls.map((call) => call.text)).toEqual(['还剩30秒', '必须停止发言']);
    expect(calls[0].lang).toBe('zh-CN');
});

test('announcements follow the UI language (fr-CA)', async ({ page }) => {
    await enableTts(page, { lang: 'fr-CA' });
    await page.goto('/');

    await page.getByRole('button', { name: /Tester le signal 30 s/ }).click();
    await expect.poll(async () => (await spokenCalls(page)).length).toBe(1);
    const calls = await spokenCalls(page);
    expect(calls[0].text).toMatch(/trente secondes restantes/i);
    expect(calls[0].lang).toBe('fr-CA');
});

test('free-debate handover speaks the receiving team name', async ({ page }) => {
    await enableTts(page);
    await page.goto('/');
    await page.getByRole('tablist').getByRole('tab', { name: /自由辩论|Free debate/i }).click();

    // A starts/stops the affirmative; stopping hands the floor to negative.
    // Wait for the running state to land before the second press — two
    // presses in one frame would both read "not running" and just START twice.
    await page.keyboard.press('a');
    await expect(page.getByText(/^0?0:5\d$/).first()).toBeVisible();
    await page.keyboard.press('a');

    await expect.poll(async () => (await spokenCalls(page)).length).toBe(1);
    const calls = await spokenCalls(page);
    expect(calls[0].text).toMatch(/蓝队, your turn to speak/i);
    expect(calls[0].lang).toBe('en-US');
});

test('tts master switch off silences every announcement', async ({ page }) => {
    await enableTts(page, { enabled: false });
    await page.goto('/');

    await page.getByRole('button', { name: /Test 30s cue/i }).click();
    await page.getByRole('button', { name: /Test end cue/i }).click();
    // Give any (wrong) speak a chance to land before asserting silence.
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__tts)).toEqual([]);
});
