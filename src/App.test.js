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
    expect(i18n.t('errors.notFoundEyebrow')).toBe('404');
});

test('session and free-debate strings are present in all three languages', async () => {
    expect(i18n.t('timer.session.start')).toMatch(/display sync/i);
    expect(i18n.t('timer.session.active')).toMatch(/synced/i);
    expect(i18n.t('timer.session.weak')).toMatch(/weak signal/i);
    expect(i18n.t('timer.session.enableShareFirst')).toMatch(/sharing/i);
    expect(i18n.t('timer.display.following')).toMatch(/live/i);
    expect(i18n.t('timer.display.sessionEnded')).toMatch(/standalone/i);
    expect(i18n.t('timer.free.locked')).toMatch(/concluded/i);
    expect(i18n.t('timer.hintFree')).toMatch(/stopping one side/i);
    expect(i18n.t('settings.freeTimer')).toMatch(/free debate/i);

    await i18n.changeLanguage('zh-Hans');
    expect(i18n.t('timer.session.start')).toBe('开启大屏同步');
    expect(i18n.t('timer.display.following')).toBe('正在大屏跟随');
    expect(i18n.t('timer.free.locked')).toBe('自由辩论环节已结束');
    expect(i18n.t('settings.freeTimer')).toMatch(/自由辩论/);

    await i18n.changeLanguage('fr-CA');
    expect(i18n.t('timer.session.start')).toMatch(/synchro/i);
    expect(i18n.t('timer.display.following')).toMatch(/direct/i);
    expect(i18n.t('timer.free.locked')).toMatch(/débat libre/i);
    expect(i18n.t('settings.freeTimer')).toMatch(/débat libre/i);
});
