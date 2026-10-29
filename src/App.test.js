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

test('session and free-debate strings are present in all three languages', async () => {    expect(i18n.t('timer.session.start')).toMatch(/remote control/i);
    expect(i18n.t('timer.session.active')).toMatch(/remote control/i);
    expect(i18n.t('timer.session.weak')).toMatch(/weak signal/i);
    expect(i18n.t('timer.session.enableShareFirst')).toMatch(/sharing/i);
    expect(i18n.t('timer.display.following')).toMatch(/live/i);
    expect(i18n.t('timer.display.sessionEnded')).toMatch(/standalone/i);
    expect(i18n.t('timer.free.locked')).toMatch(/concluded/i);
    expect(i18n.t('timer.hintFree')).toMatch(/stopping one side/i);
    expect(i18n.t('settings.freeTimer')).toMatch(/free debate/i);

    await i18n.changeLanguage('zh-Hans');
    expect(i18n.t('timer.session.start')).toBe('开启远程控制');
    expect(i18n.t('timer.display.following')).toBe('正在大屏跟随');
    expect(i18n.t('timer.free.locked')).toBe('自由辩论环节已结束');
    expect(i18n.t('settings.freeTimer')).toMatch(/自由辩论/);

    await i18n.changeLanguage('fr-CA');
    expect(i18n.t('timer.session.start')).toMatch(/contrôle à distance/i);
    expect(i18n.t('timer.display.following')).toMatch(/direct/i);
    expect(i18n.t('timer.free.locked')).toMatch(/débat libre/i);
    expect(i18n.t('settings.freeTimer')).toMatch(/débat libre/i);
});

test('pwa strings are present', async () => {
    expect(i18n.t('pwa.offline')).toMatch(/offline/i);
    expect(i18n.t('pwa.install')).toMatch(/install/i);
    await i18n.changeLanguage('zh-Hans');
    expect(i18n.t('pwa.offline')).toMatch(/离线/);
});

test('registration toggle strings are present in all three languages', async () => {
    expect(i18n.t('auth.registrationClosed')).toMatch(/registration is/i);
    expect(i18n.t('admin.registrationTitle')).toMatch(/registration/i);
    expect(i18n.t('admin.registrationOn')).toMatch(/open/i);
    expect(i18n.t('admin.registrationOff')).toMatch(/closed/i);
    expect(i18n.t('admin.registrationSourceAdmin', { name: 'Alice' })).toMatch(/alice/i);
    expect(i18n.t('admin.registrationSourceEnv')).toMatch(/ALLOW_REGISTRATION/i);

    await i18n.changeLanguage('zh-Hans');
    expect(i18n.t('auth.registrationClosed')).toMatch(/已关闭/);
    expect(i18n.t('admin.registrationTitle')).toBe('开放注册');
    expect(i18n.t('admin.registrationOn')).toMatch(/开放/);
    expect(i18n.t('admin.registrationOff')).toMatch(/关闭/);
    expect(i18n.t('admin.registrationSourceAdmin', { name: '管理员' })).toMatch(/管理员/);

    await i18n.changeLanguage('fr-CA');
    expect(i18n.t('auth.registrationClosed')).toMatch(/fermée/i);
    expect(i18n.t('admin.registrationTitle')).toMatch(/inscription/i);
    expect(i18n.t('admin.registrationOn')).toMatch(/ouverte/i);
    expect(i18n.t('admin.registrationOff')).toMatch(/fermée/i);
    expect(i18n.t('admin.registrationSourceAdmin', { name: 'Admin' })).toMatch(/admin/i);
    expect(i18n.t('admin.registrationSourceEnv')).toMatch(/ALLOW_REGISTRATION/i);
});

test('stage enhancement strings are present in all three languages', async () => {
    expect(i18n.t('settings.graceSeconds')).toMatch(/grace/i);
    expect(i18n.t('settings.autoAdvance')).toMatch(/auto/i);
    expect(i18n.t('settings.soundTimeUp')).toMatch(/time is up/i);
    expect(i18n.t('settings.soundMustStop')).toMatch(/must stop/i);
    expect(i18n.t('settings.soundOption.timeup')).toMatch(/ding/i);
    expect(i18n.t('timer.graceHint')).toMatch(/wrapping/i);
    expect(i18n.t('timer.advanceCountdown', { n: 3 })).toMatch(/3s|3 s/);
    expect(i18n.t('timer.affBadge')).toBe('AFF');

    await i18n.changeLanguage('zh-Hans');
    expect(i18n.t('settings.graceSeconds')).toBe('宽限秒数');
    expect(i18n.t('timer.graceHint')).toMatch(/收尾/);
    expect(i18n.t('timer.advanceCountdown', { n: 3 })).toMatch(/3 秒/);

    await i18n.changeLanguage('fr-CA');
    expect(i18n.t('settings.teamNames')).toMatch(/équipes/);
    expect(i18n.t('timer.graceHint')).toMatch(/conclusion/i);
});

test('tts announcement strings are present in all three languages', async () => {
    expect(i18n.t('timer.tts.warn30')).toMatch(/thirty seconds left/i);
    expect(i18n.t('timer.tts.timeUp')).toMatch(/time is up/i);
    expect(i18n.t('timer.tts.timeUpSide', { team: 'Red' })).toMatch(/time is up, red/i);
    expect(i18n.t('timer.tts.mustStop')).toMatch(/must stop speaking/i);
    expect(i18n.t('timer.tts.mustStopSide', { team: 'Red' })).toMatch(/red, must stop speaking/i);
    expect(i18n.t('timer.tts.handover', { team: 'Blue' })).toMatch(/blue, your turn to speak/i);
    expect(i18n.t('settings.ttsTitle')).toMatch(/voice announcements/i);
    expect(i18n.t('settings.ttsEnabled')).toMatch(/enable voice/i);
    expect(i18n.t('settings.ttsHandover')).toMatch(/free-debate handover/i);
    expect(i18n.t('settings.ttsUnlockHint')).toMatch(/blocked/i);

    await i18n.changeLanguage('zh-Hans');
    expect(i18n.t('timer.tts.warn30')).toBe('还剩30秒');
    expect(i18n.t('timer.tts.timeUp')).toBe('时间到');
    expect(i18n.t('timer.tts.timeUpSide', { team: '正方' })).toBe('正方时间到');
    expect(i18n.t('timer.tts.mustStop')).toBe('必须停止发言');
    expect(i18n.t('timer.tts.mustStopSide', { team: '反方' })).toBe('反方必须停止发言');
    expect(i18n.t('timer.tts.handover', { team: '反方' })).toBe('请反方发言');
    expect(i18n.t('settings.ttsTitle')).toMatch(/语音播报/);
    expect(i18n.t('settings.ttsUnsupported')).toMatch(/不支持语音合成/);

    await i18n.changeLanguage('fr-CA');
    expect(i18n.t('timer.tts.warn30')).toMatch(/trente secondes restantes/i);
    expect(i18n.t('timer.tts.timeUpSide', { team: 'Équipe A' })).toMatch(/temps écoulé, équipe a/i);
    expect(i18n.t('timer.tts.mustStop')).toMatch(/arrêter de parler/i);
    expect(i18n.t('timer.tts.handover', { team: 'Équipe B' })).toMatch(/équipe b, à vous la parole/i);
    expect(i18n.t('settings.ttsTitle')).toMatch(/annonces vocales/i);
    expect(i18n.t('settings.ttsVoiceFallback')).toMatch(/voix par défaut/i);
});
