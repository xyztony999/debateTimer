import i18n from './i18n';

beforeEach(async () => {
    await i18n.changeLanguage('en');
});

test('i18n loads English strings for timer title', async () => {
    expect(i18n.t('timer.title')).toMatch(/debate timer/i);
});

test('i18n loads auth and share strings', async () => {
    expect(i18n.t('auth.login')).toMatch(/sign in/i);
    expect(i18n.t('auth.logout')).toMatch(/sign out/i);
    expect(i18n.t('share.notFound')).toMatch(/display link/i);
    expect(i18n.t('admin.title')).toMatch(/administration/i);
});

test('Chinese auth strings are present', async () => {
    await i18n.changeLanguage('zh-Hans');
    expect(i18n.t('auth.login')).toBe('登录');
    expect(i18n.t('share.title')).toMatch(/投影/);
});

test('error page strings are present', async () => {
    expect(i18n.t('errors.notFoundTitle')).toMatch(/not found/i);
    expect(i18n.t('errors.displayTitle')).toMatch(/unavailable/i);
});
