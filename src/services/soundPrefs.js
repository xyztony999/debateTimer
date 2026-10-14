import notifySound from '../resources/notify.mp3';
import splitSound from '../resources/split.mp3';
import timeupSound from '../resources/timeup.mp3';
import chimeSound from '../resources/chime.mp3';

// Alert nodes (business semantics fixed; the sound per node is a local preference).
export const ALERT_NODES = ['warn30', 'timeUp', 'mustStop'];

export const SOUND_OPTIONS = [
    { id: 'split', url: splitSound },
    { id: 'notify', url: notifySound },
    { id: 'timeup', url: timeupSound },
    { id: 'chime', url: chimeSound },
];

export const DEFAULT_SOUND_PREFS = {
    warn30: { sound: 'split', volume: 100 },
    timeUp: { sound: 'timeup', volume: 100 },
    mustStop: { sound: 'notify', volume: 100 },
};

const STORAGE_KEY = 'timer.soundPrefs';

export function loadSoundPrefs() {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
            return { ...DEFAULT_SOUND_PREFS };
        }
        const parsed = JSON.parse(raw);
        const prefs = { ...DEFAULT_SOUND_PREFS };
        for (const node of ALERT_NODES) {
            const entry = parsed[node];
            if (entry && SOUND_OPTIONS.some((option) => option.id === entry.sound)) {
                const volume = Number(entry.volume);
                prefs[node] = {
                    sound: entry.sound,
                    volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 100,
                };
            }
        }
        return prefs;
    } catch {
        return { ...DEFAULT_SOUND_PREFS };
    }
}

export function saveSoundPrefs(prefs) {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
        // Private mode / storage disabled: preferences stay in-memory only.
    }
}

// Warm decode so the first playback is not delayed (same trick as the timer page).
export function warmupSounds() {
    for (const option of SOUND_OPTIONS) {
        try {
            const audio = new Audio(option.url);
            audio.preload = 'auto';
            audio.load();
        } catch {
            // Ignore warmup failures.
        }
    }
}

function playUrl(url, volume) {
    try {
        const audio = new Audio(url);
        audio.volume = Math.min(1, Math.max(0, volume / 100));
        const promise = audio.play();
        if (promise?.catch) {
            promise.catch(() => {});
        }
    } catch {
        // Ignore autoplay / decode errors during local testing.
    }
}

// Play an alert node with this device's preference (controller and display
// each keep their own local preference).
export function playAlert(node) {
    const prefs = loadSoundPrefs();
    const pref = prefs[node] || DEFAULT_SOUND_PREFS[node];
    const option = SOUND_OPTIONS.find((item) => item.id === pref.sound)
        || SOUND_OPTIONS.find((item) => item.id === DEFAULT_SOUND_PREFS[node].sound);
    if (!option) {
        return;
    }
    playUrl(option.url, pref.volume);
}

// Preview a concrete option at a concrete volume (settings panel preview button).
export function previewSound(soundId, volume = 100) {
    const option = SOUND_OPTIONS.find((item) => item.id === soundId);
    if (option) {
        playUrl(option.url, volume);
    }
}
