import i18n from './i18n';

beforeEach(async () => {
    await i18n.changeLanguage('en');
});

test('i18n loads English strings for timer title', async () => {
    expect(i18n.t('timer.title')).toMatch(/debate timer/i);
});
