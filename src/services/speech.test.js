import {
    __resetTtsForTests,
    getVoices,
    isTtsSupported,
    isTtsUnlocked,
    pickVoiceForLang,
    primeTts,
    speakAnnouncement,
} from './speech.js';

// bun has no `window`; speech.js touches it lazily so tests can stub the
// whole speech surface per case (same trick the app's guard relies on).
class StubUtterance {
    constructor(text) {
        this.text = text;
        this.lang = '';
        this.volume = 1;
        this.rate = 1;
        this.pitch = 1;
    }
}

function installSynth({ voices = [], speakImpl } = {}) {
    const ops = [];
    const speakCalls = [];
    const synthListeners = {};
    const windowListeners = {};
    const synth = {
        _voices: voices,
        getVoices: () => synth._voices,
        cancel: () => ops.push('cancel'),
        speak: (utterance) => {
            ops.push('speak');
            speakCalls.push(utterance);
            speakImpl?.(utterance);
        },
        addEventListener: (name, fn) => {
            (synthListeners[name] ??= []).push(fn);
        },
        removeEventListener: () => {},
    };
    globalThis.window = {
        speechSynthesis: synth,
        SpeechSynthesisUtterance: StubUtterance,
        addEventListener: (name, fn) => {
            (windowListeners[name] ??= []).push(fn);
        },
        removeEventListener: (name, fn) => {
            windowListeners[name] = (windowListeners[name] ?? []).filter((f) => f !== fn);
        },
    };
    return {
        synth,
        ops,
        speakCalls,
        fireSynth: (name) => (synthListeners[name] ?? []).forEach((fn) => fn()),
        fireWindow: (name) => (windowListeners[name] ?? []).forEach((fn) => fn()),
    };
}

beforeEach(() => {
    __resetTtsForTests();
});

afterEach(() => {
    delete globalThis.window;
});

test('isTtsSupported is false without a speechSynthesis surface', () => {
    delete globalThis.window;
    expect(isTtsSupported()).toBe(false);
    expect(speakAnnouncement('时间到', 'zh-Hans')).toEqual({ spoken: false, reason: 'unsupported' });
});

test('pickVoiceForLang: zh-Hans prefers the zh-CN voice', () => {
    const voices = [
        { lang: 'en-US', name: 'Sam' },
        { lang: 'zh-CN', name: 'Ting' },
        { lang: 'zh-TW', name: 'Mei' },
    ];
    expect(pickVoiceForLang('zh-Hans', voices)).toEqual({ voice: voices[1], matched: 'exact' });
});

test('pickVoiceForLang: fr-CA falls back through the fr family', () => {
    const frFR = [{ lang: 'fr-FR', name: 'Thomas' }];
    expect(pickVoiceForLang('fr-CA', frFR).matched).toBe('exact');
    const frBE = [{ lang: 'fr_BE', name: 'Justine' }];
    expect(pickVoiceForLang('fr-CA', frBE)).toEqual({ voice: frBE[0], matched: 'family' });
});

test('pickVoiceForLang: en matches en-US/en-GB exactly', () => {
    const voices = [{ lang: 'en-GB', name: 'Daniel' }, { lang: 'en-US', name: 'Ava' }];
    expect(pickVoiceForLang('en', voices).voice).toBe(voices[1]);
});

test('pickVoiceForLang: no match falls back to the default voice, empty list to null', () => {
    const voices = [
        { lang: 'de-DE', name: 'Anna', default: false },
        { lang: 'it-IT', name: 'Alice', default: true },
    ];
    expect(pickVoiceForLang('zh-Hans', voices)).toEqual({ voice: voices[1], matched: 'fallback' });
    expect(pickVoiceForLang('en', []).voice).toBeNull();
});

test('getVoices: empty first call refills after voiceschanged', () => {
    const { synth, fireSynth } = installSynth({ voices: [] });
    expect(getVoices()).toEqual([]);
    const zhVoice = { lang: 'zh-CN', name: 'Ting' };
    synth._voices = [zhVoice];
    fireSynth('voiceschanged');
    expect(getVoices()).toEqual([zhVoice]);
    expect(pickVoiceForLang('zh-Hans').voice).toBe(zhVoice);
});

test('speakAnnouncement cancels first, then speaks with mapped utterance params', () => {
    const zhVoice = { lang: 'zh-CN', name: 'Ting' };
    const { ops, speakCalls } = installSynth({ voices: [zhVoice] });
    const result = speakAnnouncement('正方时间到', 'zh-Hans');
    expect(result).toEqual({ spoken: true, matched: 'exact' });
    expect(ops).toEqual(['cancel', 'speak']);
    expect(speakCalls.length).toBe(1);
    const utterance = speakCalls[0];
    expect(utterance.text).toBe('正方时间到');
    expect(utterance.lang).toBe('zh-CN');
    expect(utterance.voice).toBe(zhVoice);
    expect(utterance.rate).toBe(1);
    expect(utterance.volume).toBe(1);
});

test('speakAnnouncement maps en to en-US and clamps volume', () => {
    const { speakCalls } = installSynth({ voices: [{ lang: 'en-US', name: 'Ava' }] });
    speakAnnouncement('Time is up', 'en', { volume: 2 });
    expect(speakCalls[0].lang).toBe('en-US');
    expect(speakCalls[0].volume).toBe(1);
    speakAnnouncement('Time is up', 'en', { volume: -1 });
    expect(speakCalls[1].volume).toBe(0);
});

test('speakAnnouncement swallows engine errors', () => {
    const { speakCalls } = installSynth({
        speakImpl: () => {
            throw new Error('engine unavailable');
        },
    });
    expect(speakAnnouncement('时间到', 'zh-Hans')).toEqual({ spoken: false, reason: 'error' });
    expect(speakCalls.length).toBe(1); // attempted, then failed
});

test('primeTts unlocks on the first gesture with a silent warm-up utterance', () => {
    const { ops, speakCalls, fireWindow } = installSynth({ voices: [] });
    primeTts();
    expect(isTtsUnlocked()).toBe(false);
    fireWindow('pointerdown');
    expect(isTtsUnlocked()).toBe(true);
    expect(ops).toEqual(['speak']);
    // The warm-up utterance is a space at volume 0 (opens the audio path).
    expect(speakCalls[0].text).toBe(' ');
    expect(speakCalls[0].volume).toBe(0);
});
