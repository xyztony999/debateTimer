import {
    ALERT_NODES,
    DEFAULT_SOUND_PREFS,
    DEFAULT_TTS_PREFS,
    loadSoundPrefs,
    saveSoundPrefs,
} from './soundPrefs.js';

// bun has no `window`/localStorage; soundPrefs touches them lazily inside
// try/catch, so a per-test stub is enough.
function installStorage(initialRaw = null) {
    let stored = initialRaw;
    globalThis.window = {
        localStorage: {
            getItem: () => stored,
            setItem: (_key, value) => {
                stored = String(value);
            },
        },
    };
    return {
        readBack: () => stored,
    };
}

afterEach(() => {
    delete globalThis.window;
});

test('missing storage yields full defaults including the tts block', () => {
    installStorage(null);
    const prefs = loadSoundPrefs();
    expect(prefs.warn30).toEqual(DEFAULT_SOUND_PREFS.warn30);
    expect(prefs.tts).toEqual(DEFAULT_TTS_PREFS);
});

test('legacy stored shape without a tts block loads with default tts prefs', () => {
    installStorage(JSON.stringify({
        warn30: { sound: 'chime', volume: 40 },
        timeUp: { sound: 'notify', volume: 80 },
        mustStop: { sound: 'split', volume: 100 },
    }));
    const prefs = loadSoundPrefs();
    expect(prefs.warn30).toEqual({ sound: 'chime', volume: 40 });
    expect(prefs.tts).toEqual(DEFAULT_TTS_PREFS);
});

test('invalid tts fields fall back per-key, valid booleans are kept', () => {
    installStorage(JSON.stringify({
        tts: { enabled: 'yes', warn30: 1, timeUp: false, mustStop: null, handover: true },
    }));
    const { tts } = loadSoundPrefs();
    expect(tts.enabled).toBe(false); // non-boolean → default
    expect(tts.warn30).toBe(true); // non-boolean → default
    expect(tts.timeUp).toBe(false); // valid boolean kept
    expect(tts.mustStop).toBe(true); // null → default
    expect(tts.handover).toBe(true);
});

test('corrupt storage JSON falls back to defaults without throwing', () => {
    installStorage('{not json');
    expect(loadSoundPrefs().tts).toEqual(DEFAULT_TTS_PREFS);
    expect(loadSoundPrefs().timeUp).toEqual(DEFAULT_SOUND_PREFS.timeUp);
});

test('tts toggles persist through a save/load roundtrip', () => {
    const { readBack } = installStorage(null);
    const prefs = loadSoundPrefs();
    prefs.tts.enabled = true;
    prefs.tts.warn30 = false;
    saveSoundPrefs(prefs);

    // The persisted payload still carries the sound entries next to tts.
    const raw = JSON.parse(readBack());
    expect(Object.keys(raw).sort()).toEqual([...ALERT_NODES, 'tts'].sort());

    const reloaded = loadSoundPrefs();
    expect(reloaded.tts).toEqual({ ...DEFAULT_TTS_PREFS, enabled: true, warn30: false });
});
