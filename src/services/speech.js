/**
 * Voice announcements (TTS) on top of the Web Speech API.
 *
 * Companion to soundPrefs.js bells: the same alert nodes, spoken instead of
 * rung. Same philosophy — every browser API touch is guarded and failures are
 * swallowed silently (speechSynthesis is missing on some browsers, voices
 * load asynchronously, and autoplay policies can block the very first speak
 * until a user gesture unlocks the audio path).
 */

// i18n language → preferred BCP-47 utterance langs, exact tag first.
const VOICE_CHAINS = {
    'zh-Hans': ['zh-CN', 'zh'],
    'fr-CA': ['fr-CA', 'fr-FR', 'fr'],
    en: ['en-US', 'en-GB', 'en'],
};

// utterance.lang needs a concrete tag; i18n codes are not all valid BCP-47.
const UTTERANCE_LANGS = {
    'zh-Hans': 'zh-CN',
    'fr-CA': 'fr-CA',
    en: 'en-US',
};

export function isTtsSupported() {
    return typeof window !== 'undefined'
        && Boolean(window.speechSynthesis)
        && typeof window.SpeechSynthesisUtterance === 'function';
}

function normalizeLang(lang) {
    return String(lang || '').replace('_', '-').toLowerCase();
}

// getVoices() returns [] on the first call in most browsers and fills in
// asynchronously — cache only non-empty lists and refresh on voiceschanged.
let voicesCache = null;
let voicesListenerBound = false;

function bindVoicesListener() {
    if (voicesListenerBound || !isTtsSupported()) {
        return;
    }
    voicesListenerBound = true;
    try {
        window.speechSynthesis.addEventListener?.('voiceschanged', () => {
            voicesCache = null;
        });
    } catch {
        // Older engines expose onvoiceschanged instead.
        try {
            window.speechSynthesis.onvoiceschanged = () => {
                voicesCache = null;
            };
        } catch {
            // Ignore — voice list will simply be re-queried each call.
        }
    }
}

export function getVoices() {
    if (!isTtsSupported()) {
        return [];
    }
    if (voicesCache && voicesCache.length > 0) {
        return voicesCache;
    }
    bindVoicesListener();
    try {
        voicesCache = window.speechSynthesis.getVoices() ?? [];
    } catch {
        voicesCache = [];
    }
    return voicesCache;
}

/**
 * Pick a voice for an i18n language with a fallback chain:
 * exact tag (zh-CN) → language family prefix (zh-*) → system default.
 * Returns { voice, matched } — matched is 'exact' | 'family' | 'fallback';
 * voice may be null when the engine has no voices at all yet.
 */
export function pickVoiceForLang(i18nLang, voices = getVoices()) {
    const chain = VOICE_CHAINS[i18nLang] ?? [];
    for (const tag of chain) {
        const norm = normalizeLang(tag);
        const found = voices.find((v) => normalizeLang(v.lang) === norm);
        if (found) {
            return { voice: found, matched: 'exact' };
        }
    }
    const family = chain[0]?.split('-')[0];
    if (family) {
        const found = voices.find((v) => normalizeLang(v.lang).split('-')[0] === family);
        if (found) {
            return { voice: found, matched: 'family' };
        }
    }
    return {
        voice: voices.find((v) => v.default) ?? voices[0] ?? null,
        matched: 'fallback',
    };
}

// ---------------------------------------------------------------------------
// Autoplay unlock: speechSynthesis (like Audio) can be blocked before the
// first user gesture on iOS Safari and friends. Track gestures so the panel
// can hint, and warm the path with a volume-0 utterance on the first one.
// ---------------------------------------------------------------------------

let unlocked = false;
let unlockBound = false;

function unlockFromGesture() {
    unlocked = true;
    unlockBound = false;
    try {
        window.removeEventListener('pointerdown', unlockFromGesture);
        window.removeEventListener('keydown', unlockFromGesture);
    } catch {
        // Ignore.
    }
    // Warm the audio path with a silent utterance (needs a real gesture on
    // iOS Safari; errors are expected elsewhere and ignored).
    try {
        const utterance = new window.SpeechSynthesisUtterance(' ');
        utterance.volume = 0;
        window.speechSynthesis.speak(utterance);
    } catch {
        // Ignore.
    }
}

/** Register one-shot listeners so the first gesture anywhere unlocks TTS. */
export function primeTts() {
    if (unlockBound || !isTtsSupported()) {
        return;
    }
    unlockBound = true;
    try {
        window.addEventListener('pointerdown', unlockFromGesture, { once: true });
        window.addEventListener('keydown', unlockFromGesture, { once: true });
    } catch {
        unlockBound = false;
    }
}

/** True once any user gesture has been seen since priming. */
export function isTtsUnlocked() {
    return unlocked;
}

/**
 * Force the unlocked state from a code path that is already inside a user
 * gesture (e.g. the enable toggle or a preview button click).
 */
export function unlockTtsNow() {
    if (unlocked || !isTtsSupported()) {
        return;
    }
    unlockFromGesture();
}

/**
 * Speak one announcement (cancel-then-speak: the newest cue wins, which
 * prevents overlapping speech when free-debate handovers come in bursts).
 * Returns a status object; never throws.
 */
export function speakAnnouncement(text, i18nLang, { volume = 1 } = {}) {
    if (!isTtsSupported() || !text) {
        return { spoken: false, reason: 'unsupported' };
    }
    try {
        const synth = window.speechSynthesis;
        const { voice, matched } = pickVoiceForLang(i18nLang);
        const utterance = new window.SpeechSynthesisUtterance(text);
        utterance.lang = UTTERANCE_LANGS[i18nLang] ?? normalizeLang(i18nLang);
        if (voice) {
            utterance.voice = voice;
        }
        utterance.rate = 1;
        utterance.pitch = 1;
        utterance.volume = Math.min(1, Math.max(0, volume));
        synth.cancel();
        synth.speak(utterance);
        return { spoken: true, matched };
    } catch {
        return { spoken: false, reason: 'error' };
    }
}

/** Test hook: reset module caches/listeners between unit tests. */
export function __resetTtsForTests() {
    voicesCache = null;
    voicesListenerBound = false;
    unlocked = false;
    if (unlockBound && typeof window !== 'undefined') {
        try {
            window.removeEventListener('pointerdown', unlockFromGesture);
            window.removeEventListener('keydown', unlockFromGesture);
        } catch {
            // Ignore.
        }
    }
    unlockBound = false;
}
