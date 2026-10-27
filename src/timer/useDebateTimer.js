import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TimerSessionService from '../services/TimerSessionService';
import MatchLogService from '../services/MatchLogService';
import { loadSoundPrefs, playAlert, warmupSounds } from '../services/soundPrefs';
import { primeTts, speakAnnouncement } from '../services/speech';
import { stageDisplayName } from '../utils/stageDisplayName';
import { useAuth } from '../context/AuthContext';
import useDebateConfig from './useDebateConfig.js';
import useTimerSessionSync from './useTimerSessionSync.js';
import {
    reducer,
    initialState,
    MODE_STRING,
    activeSide as activeSideOf,
    anyInGrace,
    hasClockActivity,
    isBlinking,
    isFreeLocked,
    isStageFullyEnded,
} from './engine.js';
import { buildSnapshot, adoptSnapshot, compensateInFlight } from './snapshotCodec.js';
import {
    beginStageCapture, bumpOverrun, buildMatchPayload,
    persistCapture, restoreCapture, clearPersistedCapture,
} from './matchCapture.js';
import { initiateDirectChannel, answerDirectChannel } from './rtcChannel.js';
import { anchorResetsForAction } from './clockAnchors.js';
import { createSnapshotQueue, snapshotFailureAction } from './snapshotReporting.js';

/**
 * Timer runtime assembly: wires the engine reducer to the wall clock,
 * sounds, match capture, auto-advance, and the control/display session
 * sync. Everything here is behavior; pages only render. Controller pages
 * call with no arguments, display pages with the share token.
 */
export default function useDebateTimer({ shareToken = null } = {}) {
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const isDisplay = Boolean(shareToken);

    // Host command/signal listeners ride the EXISTING config stream the
    // config hook opens — bound lazily so the stream is established once
    // (connection pool: 1 SSE per host tab, never 2).
    const hostCommandListenerRef = useRef(null);
    const hostSignalListenerRef = useRef(null);
    const configNamedEvents = useMemo(() => ({
        command: (cmd) => hostCommandListenerRef.current?.(cmd),
        signal: (frame) => hostSignalListenerRef.current?.(frame),
    }), []);
    const { config, status } = useDebateConfig(shareToken, isDisplay ? null : configNamedEvents);
    const [state, rawDispatch] = useReducer(reducer, undefined, initialState);


    const [captureCount, setCaptureCount] = useState(0);
    // Capture / clock domain refs (session-domain refs moved to useTimerSessionSync).
    const captureRef = useRef(null);
    const matchAutoSavedRef = useRef(false);
    const lastTickAtRef = useRef(null);
    // Latest-state mirror for event handlers, intervals, and SSE callbacks
    // that must not re-register on every tick.
    const stateRef = useRef(null);
    // ------------------------------------------------------------------
    // D38 (PageSpec §20): wall-clock truth layer. The engine tracks whole
    // seconds (its events/locks stay authoritative); these anchors carry the
    // exact millisecond clock derived from wall time, so snapshots and every
    // rendered digit share one phase on host and displays alike.
    // anchor: { running, endAt, frozenMs }
    // ------------------------------------------------------------------
    // anchors live in state (render reads) mirrored into a ref (event-time
    // writes) — react-compiler forbids reading refs during render.
    const [anchors, setAnchors] = useState({});
    const anchorsRef = useRef(anchors);
    const writeAnchor = (side, anchor) => {
        anchorsRef.current = { ...anchorsRef.current, [side]: anchor };
        setAnchors(anchorsRef.current);
    };
    const anchorMsOf = (book, side) => {
        const a = book[side];
        if (!a) {
            return null;
        }
        return a.running ? Math.max(0, a.endAt - Date.now()) : a.frozenMs;
    };
    const setRunningAnchor = (side, ms) => {
        writeAnchor(side, { running: true, endAt: Date.now() + Math.max(0, ms), frozenMs: 0 });
    };
    const setFrozenAnchor = (side, ms) => {
        writeAnchor(side, { running: false, endAt: 0, frozenMs: Math.max(0, ms) });
    };
    const freezeAnchor = (side) => {
        const a = anchorsRef.current[side];
        if (a?.running) {
            setFrozenAnchor(side, a.endAt - Date.now());
        }
    };

    const dispatch = useCallback((action) => {
        // Maintain precise anchors at the exact moments of user intent,
        // before the engine applies its whole-second view.
        const eng = stateRef.current?.state;
        if (eng) {
            Object.entries(anchorResetsForAction(eng, action)).forEach(([key, ms]) => {
                setFrozenAnchor(key, ms);
            });
            const side = action.side;
            const anchorNow = () => {
                const ms = anchorMsOf(anchorsRef.current, side) ?? (eng.sides[side]?.remaining ?? 0) * 1000;
                setRunningAnchor(side, ms);
            };
            switch (action.type) {
                case 'START':
                    anchorNow();
                    break;
                case 'STOP':
                    freezeAnchor(side);
                    break;
                case 'TOGGLE':
                    if (eng.sides[side]?.running) {
                        freezeAnchor(side);
                    } else {
                        anchorNow();
                    }
                    break;
                default:
                    break;
            }
        }
        rawDispatch(action);
    }, []);


    const orderedStages = useMemo(() => {
        const stages = config.stages;
        if (config.stageOrder.length > 0) {
            const ordered = config.stageOrder.filter((s) => Object.prototype.hasOwnProperty.call(stages, s));
            Object.keys(stages).forEach((s) => {
                if (!ordered.includes(s)) {
                    ordered.push(s);
                }
            });
            return ordered;
        }
        return Object.keys(stages);
    }, [config]);

    useEffect(() => {
        stateRef.current = { state, config, orderedStages };
    });

    // ------------------------------------------------------------------
    // Match capture: engine state → per-side actuals view.
    // ------------------------------------------------------------------
    const sidesNowForCapture = useCallback(() => {
        const s = stateRef.current?.state;
        if (!s) {
            return null;
        }
        const side = (key) => ({
            remaining: s.sides[key].remaining,
            graceLeft: s.sides[key].graceLeft,
            locked: s.sides[key].phase === 'locked',
        });
        return s.stageMode === 'single'
            ? { aff: side('single'), neg: null }
            : { aff: side('aff'), neg: side('neg') };
    }, []);

    // ------------------------------------------------------------------
    // Stage application
    // ------------------------------------------------------------------
    const applyStage = useCallback((stage, { skipCapture = false } = {}) => {
        const { config: cfg } = stateRef.current ?? {};
        if (!stage || !cfg || !Object.prototype.hasOwnProperty.call(cfg.stages, stage)) {
            return;
        }
        const mode = MODE_STRING[cfg.modes[stage]] ?? 'single';
        const durationSec = Number(cfg.stages[stage] ?? 0);
        const graceSec = Number(cfg.stageGrace[stage] ?? 0);
        dispatch({ type: 'APPLY_STAGE', stageId: stage, mode, durationSec, graceSec });
        if (!skipCapture) {
            captureRef.current = beginStageCapture(captureRef.current, {
                stageId: stage,
                label: stageDisplayName(t, stage, cfg.stageLabels, i18n.language),
                mode,
                plannedSeconds: durationSec,
                graceSeconds: graceSec,
                now: Date.now(),
                sidesNow: sidesNowForCapture(),
            });
            matchAutoSavedRef.current = false;
            persistCapture(captureRef.current, cfg.name);
        }
        setCaptureCount(captureRef.current?.entries.length ?? 0);
    }, [t, i18n, sidesNowForCapture]);

    const goToAdjacentStage = useCallback((direction) => {
        const current = stateRef.current;
        const stages = current.orderedStages;
        const index = stages.indexOf(current.state.stageId);
        if (index === -1) {
            return;
        }
        const next = index + direction;
        if (next < 0 || next >= stages.length) {
            return;
        }
        applyStage(stages[next]);
    }, [applyStage]);

    // ------------------------------------------------------------------
    // Clock: one interval per activity stretch, anchored to wall-clock time
    // (C-02-07 hardening). Each dispatch carries the real elapsed ms so a
    // throttled/backgrounded tab catches up to truth instead of drifting;
    // coming back visible re-anchors immediately.
    // ------------------------------------------------------------------
    // D38/D39 watcher: engine-driven flips (free handover, zero-lock) keep
    // anchors in step without a user dispatch, and any anchor↔engine
    // divergence beyond 1.5s re-anchors to the engine (structure authority).
    useEffect(() => {
        ['single', 'aff', 'neg'].forEach((side) => {
            const eng = state.sides[side];
            const a = anchorsRef.current[side];
            if (!a) {
                if (eng.running) {
                    setRunningAnchor(side, eng.remaining * 1000);
                } else {
                    setFrozenAnchor(side, eng.remaining * 1000);
                }
                return;
            }
            if (eng.running && !a.running) {
                setRunningAnchor(side, eng.remaining * 1000);
                return;
            }
            if (!eng.running && a.running) {
                freezeAnchor(side); // engine-driven stop or zero-lock
                return;
            }
            const ms = a.running ? a.endAt - Date.now() : a.frozenMs;
            if (Math.abs(ms - eng.remaining * 1000) > 1500) {
                if (eng.running) {
                    setRunningAnchor(side, eng.remaining * 1000);
                } else {
                    setFrozenAnchor(side, eng.remaining * 1000);
                }
            }
        });
    }, [state]);

    const activity = hasClockActivity(state);
    useEffect(() => {
        if (!activity) {
            lastTickAtRef.current = null;
            return undefined;
        }
        lastTickAtRef.current = Date.now();
        const onTick = () => {
            const now = Date.now();
            const elapsed = now - (lastTickAtRef.current ?? now);
            lastTickAtRef.current = now;
            dispatch({ type: 'TICK', elapsedMs: Math.max(0, elapsed) });
        };
        // D37 (PageSpec §20): heartbeat lives in a worker so a backgrounded
        // tab keeps real time (window timers throttle to ~1/min); 250ms
        // cadence + the engine's remainder carry make beats exact.
        let worker = null;
        let fallback = null;
        try {
            worker = new Worker(new URL('./tickWorker.js', import.meta.url), { type: 'module' });
            worker.onmessage = onTick;
            worker.postMessage('start');
        } catch {
            fallback = window.setInterval(onTick, 250);
        }
        return () => {
            if (worker) {
                worker.terminate();
            }
            if (fallback) {
                window.clearInterval(fallback);
            }
        };
    }, [activity]);

    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible' || !lastTickAtRef.current) {
                return;
            }
            const now = Date.now();
            const elapsed = now - lastTickAtRef.current;
            lastTickAtRef.current = now;
            if (elapsed > 1500) {
                dispatch({ type: 'TICK', elapsedMs: elapsed });
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    useEffect(() => {
        warmupSounds();
        // Voice announcements obey autoplay policy: if TTS is enabled on this
        // device, arm the one-shot gesture unlock right away.
        if (loadSoundPrefs().tts?.enabled) {
            primeTts();
        }
    }, []);

    // Engine events: play bells, speak announcements, count overruns. Voice
    // events in one batch merge into a single utterance ("time up, negative
    // has the floor"); cancel-then-speak inside speech.js keeps the newest
    // cue winning.
    useEffect(() => {
        if (state.events.length === 0) {
            return;
        }
        const ttsPrefs = loadSoundPrefs().tts;
        const sideLabel = (side) => {
            if (side !== 'aff' && side !== 'neg') {
                return '';
            }
            const cfg = stateRef.current?.config;
            return cfg?.teamNames?.[side] || t(side === 'aff' ? 'timer.affirmative' : 'timer.negative');
        };
        const voiceText = (event) => {
            const label = sideLabel(event.side);
            if (event.node === 'timeUp') {
                return label ? t('timer.tts.timeUpSide', { team: label }) : t('timer.tts.timeUp');
            }
            if (event.node === 'mustStop') {
                return label
                    ? t('timer.tts.mustStopSide', { team: label })
                    : t('timer.tts.mustStop');
            }
            if (event.node === 'handover') {
                return t('timer.tts.handover', { team: label });
            }
            return t('timer.tts.warn30');
        };
        const spoken = [];
        for (const event of state.events) {
            if (event.type === 'sound') {
                playAlert(event.node);
            } else if (event.type === 'overrun') {
                captureRef.current = bumpOverrun(captureRef.current, event.side, state.stageId);
                persistCapture(captureRef.current, stateRef.current?.config?.name);
            } else if (event.type === 'voice') {
                if (ttsPrefs?.enabled && ttsPrefs[event.node]) {
                    spoken.push(voiceText(event));
                }
            }
        }
        if (spoken.length > 0) {
            const joiner = i18n.language?.startsWith('zh') ? '，' : ', ';
            speakAnnouncement(spoken.join(joiner), i18n.language);
        }
        dispatch({ type: 'CONSUME_EVENTS' });
    }, [state.events, state.stageId, t, i18n]);

    // ------------------------------------------------------------------

    useEffect(() => {
        if (state.advance == null) {
            return undefined;
        }
        if (state.advance === 0) {
            goToAdjacentStage(1);
            return undefined;
        }
        const id = window.setTimeout(() => dispatch({ type: 'ADVANCE_TICK' }), 1000);
        return () => window.clearTimeout(id);
    }, [state.advance, goToAdjacentStage]);

    // ------------------------------------------------------------------
    // Match record save (manual button or automatic on session end).
    // ------------------------------------------------------------------
    const saveMatchRecord = useCallback(async (auto = false) => {
        if (auto && matchAutoSavedRef.current) {
            return;
        }
        const { config: cfg } = stateRef.current ?? {};
        const payload = buildMatchPayload(captureRef.current, {
            configName: cfg?.name,
            teamNames: cfg?.teamNames,
            now: Date.now(),
            sidesNow: sidesNowForCapture(),
        });
        if (!payload) {
            return;
        }
        const result = await MatchLogService.saveRecord(payload);
        if (result.success) {
            if (auto) {
                matchAutoSavedRef.current = true;
            } else {
                setSessionNotice(t('records.saved'));
            }
        } else if (!auto) {
            setSessionNotice(t('records.saveFailed'));
        }
    }, [t, sidesNowForCapture]);

    // ------------------------------------------------------------------

    // ---- Session / remote sync domain (split into useTimerSessionSync) ----
    const transitionKey = [
        state.stageId,
        state.sides.single.running,
        state.sides.aff.running,
        state.sides.neg.running,
        state.sides.single.phase === 'locked',
        state.sides.aff.phase === 'locked',
        state.sides.neg.phase === 'locked',
        state.sides.single.blinkOverride,
    ].join('|');
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const sync = useTimerSessionSync({
        shareToken, isDisplay, user, t, config, status,
        stateRef, anchorsRef, anchorMsOf,
        setRunningAnchor, setFrozenAnchor, dispatch,
        saveMatchRecord, lastTickAtRef,
        hostCommandListenerRef, hostSignalListenerRef,
        applyStage, transitionKey,
    });
    const {
        following, displayBanner, sessionState, sessionNotice, setSessionNotice,
        pairingCode, detectedSession, remoteMode, rtcState,
        handleStartSession, handleStopSession, startFollowing, takeoverSession,
        startRemoteMode, sendRemoteCommand, pairWithCode,
        probeForPairingDialog, handleCopyDisplayUrl,
    } = sync;

    // Config (re)load: reset the runtime to the first stage and start a
    // fresh capture — unless a buffered capture for the SAME template is
    // being restored after a page refresh (sessionStorage safety net).
    // While following a live session the HOST owns the runtime: config
    // re-deliveries (SSE 'change' broadcast, the 5s poll fallback after a
    // dropped stream) must not reset the adopted stage/clocks — the next
    // host snapshot keeps authority (follow-bug). `following` is read from
    // the render this effect fires in but deliberately NOT a dependency:
    // re-running on unfollow ('ended' freeze) would reset right where the
    // display is supposed to freeze in place.
    useEffect(() => {
        if (following) {
            return;
        }
        if (orderedStages.length === 0) {
            return;
        }
        const restored = isDisplay ? null : restoreCapture();
        if (restored && restored.configKey === config?.name) {
            captureRef.current = restored.capture;
            applyStage(orderedStages[0], { skipCapture: true });
        } else {
            clearPersistedCapture();
            captureRef.current = null;
            applyStage(orderedStages[0]);
        }
    // applyStage depends on t/i18n only for capture labels; re-running on
    // language change would wipe the match capture, so key on config only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    // Auto advance (C-01-07): arm when the stage is fully over, tick down,
    // then move on. Any manual input cancels (keyboard hook / engine).
    // ------------------------------------------------------------------
    useEffect(() => {
        const stages = stateRef.current?.orderedStages ?? [];
        const isLast = stages.indexOf(state.stageId) === stages.length - 1;
        const shouldArm = !following
            && !isLast
            && !anyInGrace(state)
            && isStageFullyEnded(state)
            && Boolean(config.stageAutoAdvance[state.stageId]);
        if (shouldArm && state.advance == null) {
            dispatch({ type: 'SET_ADVANCE', value: 3 });
        } else if (!shouldArm && state.advance != null) {
            dispatch({ type: 'SET_ADVANCE', value: null });
        }
    }, [following, state, config]);


    const actions = useMemo(() => ({
        startAff: () => dispatch({ type: 'START', side: 'aff' }),
        stopAff: () => dispatch({ type: 'STOP', side: 'aff' }),
        startNeg: () => dispatch({ type: 'START', side: 'neg' }),
        stopNeg: () => dispatch({ type: 'STOP', side: 'neg' }),
        toggleAff: () => dispatch({ type: stateRef.current.state.sides.aff.running ? 'STOP' : 'START', side: 'aff' }),
        toggleNeg: () => dispatch({ type: stateRef.current.state.sides.neg.running ? 'STOP' : 'START', side: 'neg' }),
        resetAff: () => dispatch({ type: 'RESET', side: 'aff' }),
        resetNeg: () => dispatch({ type: 'RESET', side: 'neg' }),
        toggleSingle: () => dispatch({ type: 'TOGGLE', side: 'single' }),
        resetSingle: () => dispatch({ type: 'RESET', side: 'single' }),
        prepZeroSingle: () => dispatch({ type: 'PREP_ZERO' }),
        soundCheck30: () => dispatch({ type: 'SOUND_CHECK', kind: 'warn30' }),
        soundCheckEnd: () => dispatch({ type: 'SOUND_CHECK', kind: 'end' }),
        cancelAdvance: () => dispatch({ type: 'SET_ADVANCE', value: null }),
        goToAdjacentStage,
        applyStage,
    }), [goToAdjacentStage, applyStage]);

    // D38: rendering sides — remaining comes from the truth anchors so host
    // and displays flip in the same instant; everything else stays engine.
    const liveSides = useMemo(() => {
        const map = {};
        ['single', 'aff', 'neg'].forEach((side) => {
            const ms = anchorMsOf(anchors, side);
            map[side] = ms == null
                ? state.sides[side]
                : { ...state.sides[side], remaining: Math.floor(ms / 1000) };
        });
        return map;
    }, [state, anchors]);

    const derived = useMemo(() => ({
        mode: state.stageMode,
        isDual: state.stageMode === 'double' || state.stageMode === 'free',
        isFree: state.stageMode === 'free',
        activeSide: activeSideOf(state),
        freeLocked: isFreeLocked(state),
        singleInGrace: state.sides.single.phase === 'grace',
        blinking: {
            single: isBlinking(state.sides.single),
            aff: isBlinking(state.sides.aff),
            neg: isBlinking(state.sides.neg),
        },
    }), [state]);

    return {
        // data
        config,
        status,
        state,
        liveSides,
        derived,
        orderedStages,
        following,
        displayBanner,
        sessionState,
        sessionNotice,
        setSessionNotice,
        captureCount,
        // C-02-06 console follow / R4 pairing-dialog discovery + silent resume
        detectedSession,
        probeForPairingDialog,
        startFollowing,
        takeoverSession,
        // C-02-07 dual-mode remote
        remoteMode,
        startRemoteMode,
        sendRemoteCommand,
        // C-02-08 P2P direct link
        rtcState,
        // Pairing
        pairingCode,
        pairWithCode,
        // actions
        actions,
        handleStartSession,
        handleStopSession,
        handleCopyDisplayUrl,
        saveMatchRecord,
    };
}
