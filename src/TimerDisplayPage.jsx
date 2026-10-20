import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './components/LanguageSwitcher';
import SoundSettingsPanel from './components/SoundSettingsPanel';
import StatusPage from './components/StatusPage';
import TimerBox from './components/TimerBox';
import useDebateTimer from './timer/useDebateTimer';
import useTimerKeyboardShortcuts from './timer/useTimerKeyboardShortcuts';
import { stageDisplayName } from './utils/stageDisplayName';
import './timer/display.css';

/**
 * Big-screen view (大屏端): an independent lightweight page — no MUI, no
 * navigation chrome. Follows a live control session read-only (BR-5);
 * falls back to a fully operable standalone timer when no session drives
 * it. Fullscreen via the ⛶ button or F.
 */
export default function TimerDisplayPage() {
    const { token } = useParams();
    const { t, i18n } = useTranslation();
    const [soundPanelOpen, setSoundPanelOpen] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);

    const {
        config,
        status,
        state,
        derived,
        following,
        displayBanner,
        actions,
    liveSides,
    } = useDebateTimer({ shareToken: token });

    useTimerKeyboardShortcuts({
        enabled: !following,
        isDual: derived.isDual,
        handlers: {
            onAnyInput: actions.cancelAdvance,
            onPrevStage: () => actions.goToAdjacentStage(-1),
            onNextStage: () => actions.goToAdjacentStage(1),
            toggleAff: actions.toggleAff,
            resetAff: () => {
                if (!state.sides.aff.running) {
                    actions.resetAff();
                }
            },
            toggleNeg: actions.toggleNeg,
            resetNeg: () => {
                if (!state.sides.neg.running) {
                    actions.resetNeg();
                }
            },
            toggleSingle: actions.toggleSingle,
            resetSingle: () => {
                if (state.sides.single.running) {
                    return;
                }
                if (state.stageId === 'sound_check') {
                    actions.prepZeroSingle();
                } else {
                    actions.resetSingle();
                }
            },
        },
    });

    const toggleFullscreen = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen?.();
        } else {
            document.documentElement.requestFullscreen?.();
        }
    }, []);

    useEffect(() => {
        const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);

    // F toggles fullscreen in every mode (a local display concern, never
    // forwarded to the session).
    useEffect(() => {
        const onKey = (event) => {
            if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
                return;
            }
            const target = event.target;
            if (target instanceof Element
                && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
                return;
            }
            if (event.key === 'f' || event.key === 'F') {
                event.preventDefault();
                toggleFullscreen();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [toggleFullscreen]);

    if (status === 'loading') {
        return null;
    }
    if (status === 'missing' || status === 'error') {
        return <StatusPage variant="display" />;
    }

    const affLabel = config.teamNames.aff || t('timer.affirmative');
    const negLabel = config.teamNames.neg || t('timer.negative');
    const stageName = stageDisplayName(t, state.stageId, config.stageLabels, i18n.language);
    const bannerClass = displayBanner ? `dt-banner dt-banner--${displayBanner}` : 'dt-banner';
    const bannerText = displayBanner === 'following' ? t('timer.display.following')
        : displayBanner === 'weak' ? t('timer.display.weakSignal')
            : displayBanner === 'ended' ? t('timer.display.sessionEnded')
                : '';

    return (
        <div className="dt-display">
            <header className="dt-bar">
                <span className={bannerClass} role="status">{bannerText}</span>
                <div className="dt-actions">
                    <LanguageSwitcher className="dt-lang" />
                    <button
                        type="button"
                        className="dt-icon-btn"
                        onClick={() => setSoundPanelOpen((open) => !open)}
                        title={t('settings.soundTitle')}
                    >
                        🔊
                    </button>
                    <button
                        type="button"
                        className="dt-icon-btn"
                        onClick={toggleFullscreen}
                        title={fullscreen ? t('timer.display.exitFullscreen') : t('timer.display.fullscreen')}
                    >
                        {fullscreen ? '⤡' : '⛶'}
                    </button>
                </div>
            </header>

            {soundPanelOpen ? (
                <div className="dt-sound-panel">
                    <SoundSettingsPanel />
                </div>
            ) : null}

            <main className="dt-main">
                <div className="dt-stage-name">{stageName}</div>
                <div className="dt-clocks">
                    {derived.isDual ? (
                        <React.Fragment>
                            <TimerBox
                                variant="display"
                                sideState={liveSides.aff}
                                blinking={derived.blinking.aff}
                                active={derived.isFree && derived.activeSide === 'aff'}
                                title={affLabel}
                                badge={t('timer.affBadge')}
                                graceText={t('timer.graceHint')}
                                readonly={following}
                                readonlyText={following ? t('timer.display.following') : null}
                                startTitle={t('timer.shortcutAffToggle')}
                                stopTitle={t('timer.shortcutAffToggle')}
                                resetTitle={t('timer.shortcutAffReset')}
                                onStart={actions.startAff}
                                onStop={actions.stopAff}
                                onReset={actions.resetAff}
                            />
                            <TimerBox
                                variant="display"
                                sideState={liveSides.neg}
                                blinking={derived.blinking.neg}
                                active={derived.isFree && derived.activeSide === 'neg'}
                                title={negLabel}
                                badge={t('timer.negBadge')}
                                graceText={t('timer.graceHint')}
                                readonly={following}
                                readonlyText={following ? t('timer.display.following') : null}
                                startTitle={t('timer.shortcutNegToggle')}
                                stopTitle={t('timer.shortcutNegToggle')}
                                resetTitle={t('timer.shortcutNegReset')}
                                onStart={actions.startNeg}
                                onStop={actions.stopNeg}
                                onReset={actions.resetNeg}
                            />
                        </React.Fragment>
                    ) : (
                        <TimerBox
                            variant="display"
                            sideState={liveSides.single}
                            blinking={derived.blinking.single}
                            graceText={t('timer.graceHint')}
                            readonly={following}
                            readonlyText={following ? t('timer.display.following') : null}
                            hint={t('timer.hintSingle')}
                            startTitle={t('timer.shortcutSingleToggle')}
                            stopTitle={t('timer.shortcutSingleToggle')}
                            resetTitle={t('timer.shortcutSingleReset')}
                            onStart={actions.toggleSingle}
                            onStop={actions.toggleSingle}
                            onReset={actions.resetSingle}
                        />
                    )}
                </div>

                {derived.freeLocked ? (
                    <p className="dt-note dt-note--locked" role="status">{t('timer.free.locked')}</p>
                ) : null}
                {!following ? <p className="dt-note">{t('timer.hintStage')}</p> : null}
            </main>
        </div>
    );
}
