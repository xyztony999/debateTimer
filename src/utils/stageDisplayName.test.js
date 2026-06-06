import { stageDisplayName } from './stageDisplayName';

const t = (key, { defaultValue } = {}) => {
    const translations = {
        'stages.sound_check': 'Sound Check',
        'stages.aff_c1': 'Affirmative Constructive 1',
    };
    return translations[key] ?? defaultValue;
};

test('returns custom label for current language', () => {
    const stageLabels = {
        my_stage: { en: 'My Stage', 'zh-Hans': '我的环节' },
    };
    expect(stageDisplayName(t, 'my_stage', stageLabels, 'zh-Hans')).toBe('我的环节');
});

test('falls back through label chain when current language is missing', () => {
    const stageLabels = {
        my_stage: { 'zh-Hans': '我的环节' },
    };
    expect(stageDisplayName(t, 'my_stage', stageLabels, 'fr-CA')).toBe('我的环节');
});

test('resolves preset stage via i18n when no custom labels', () => {
    expect(stageDisplayName(t, 'sound_check', {}, 'en')).toBe('Sound Check');
});

test('falls back to stage id for unknown stages', () => {
    expect(stageDisplayName(t, 'unknown_stage', {}, 'en')).toBe('unknown_stage');
});
