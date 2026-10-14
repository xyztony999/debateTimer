import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import TimerSessionService from '../services/TimerSessionService';
import MatchLogService from '../services/MatchLogService';
import { playAlert, warmupSounds } from '../services/soundPrefs';
import { stageDisplayName } from '../utils/stageDisplayName';
import { useAuth } from '../context/AuthContext';
import useDebateConfig from './useDebateConfig.js';
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
import { buildSnapshot, adoptSnapshot } from './snapshotCodec.js';
import { beginStageCapture, bumpOverrun, buildMatchPayload } from './matchCapture.js';
import { initiateDirectChannel, answerDirectChannel } from './rtcChannel.js';

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

    const { config, status } = useDebateConfig(shareToken);
    const [state, dispatch] = useReducer(reducer, undefined, initialState);

    // --- Control session (operator) / follow state (display) ---
    const [sessionState, setSessionState] = useState('idle'); // idle | starting | active | weak
    const [sessionNotice, setSessionNotice] = useState(null);
    const [following, setFollowing] = useState(false);
    const [displayBanner, setDisplayBanner] = useState(null); // following | weak | ended
    const [captureCount, setCaptureCount] = useState(0);
    // --- C-02-06 console follow: discovered session prompt + follow token ---
    const [pendingSession, setPendingSession] = useState(false);
    const [followToken, setFollowToken] = useState(null);
    // --- C-02-07 dual-mode remote: thin client sending commands to a host ---
    const [remoteMode, setRemoteMode] = useState(false);

    const sessionRef = useRef(null); // { shareToken, displayUrl, failures }
    const seqRef = useRef(0);
    const followingRef = useRef(false);
    const lastStateAtRef = useRef(0);
    const bannerTimerRef = useRef(null);
    const captureRef = useRef(null);
    const matchAutoSavedRef = useRef(false);
    const pendingDismissedRef = useRef(false);
    const followTokenRef = useRef(null);
    const remoteModeRef = useRef(false);
    const lastCommandSeqRef = useRef(0);
    const lastTickAtRef = useRef(null);
    // --- C-02-08 P2P direct link (remote ↔ host on the same LAN) ---
    const [rtcState, setRtcState] = useState('off'); // off | connecting | open
    const rtcChannelRef = useRef(null);   // remote-side initiator controller
    const hostChannelRef = useRef(null);  // host-side answerer controller
    const signalListenerRef = useRef(null); // display-stream signal demux → rtc
    const localCommandSeqRef = useRef(0); // direct-link seq space starts at 1e9

    // Latest-state mirror for event handlers, intervals, and SSE callbacks
    // that must not re-register on every tick.
    const stateRef = useRef(null);
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
        followingRef.current = following;
        remoteModeRef.current = remoteMode;
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
    const applyStage = useCallback((stage) => {
        const { config: cfg } = stateRef.current ?? {};
        if (!stage || !cfg || !Object.prototype.hasOwnProperty.call(cfg.stages, stage)) {
            return;
        }
        const mode = MODE_STRING[cfg.modes[stage]] ?? 'single';
        const durationSec = Number(cfg.stages[stage] ?? 0);
        const graceSec = Number(cfg.stageGrace[stage] ?? 0);
        dispatch({ type: 'APPLY_STAGE', stageId: stage, mode, durationSec, graceSec });
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
        setCaptureCount(captureRef.current.entries.length);
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

    // Config (re)load: reset the runtime to the first stage and start a
    // fresh capture — mirrors the old applyLoadedData.
    useEffect(() => {
        if (orderedStages.length === 0) {
            return;
        }
        captureRef.current = null;
        setCaptureCount(0);
        applyStage(orderedStages[0]);
    // applyStage depends on t/i18n only for capture labels; re-running on
    // language change would wipe the match capture, so key on config only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config]);

    // ------------------------------------------------------------------
    // Clock: one interval per activity stretch, anchored to wall-clock time
    // (C-02-07 hardening). Each dispatch carries the real elapsed ms so a
    // throttled/backgrounded tab catches up to truth instead of drifting;
    // coming back visible re-anchors immediately.
    // ------------------------------------------------------------------
    const activity = hasClockActivity(state);
    useEffect(() => {
        if (!activity) {
            lastTickAtRef.current = null;
            return undefined;
        }
        lastTickAtRef.current = Date.now();
        const id = window.setInterval(() => {
            const now = Date.now();
            const elapsed = now - (lastTickAtRef.current ?? now);
            lastTickAtRef.current = now;
            dispatch({ type: 'TICK', elapsedMs: Math.max(0, elapsed) });
        }, 1000);
        return () => window.clearInterval(id);
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
    }, []);

    // Engine events: play bells, count overruns.
    useEffect(() => {
        if (state.events.length === 0) {
            return;
        }
        for (const event of state.events) {
            if (event.type === 'sound') {
                playAlert(event.node);
            } else if (event.type === 'overrun') {
                captureRef.current = bumpOverrun(captureRef.current, event.side, state.stageId);
            }
        }
        dispatch({ type: 'CONSUME_EVENTS' });
    }, [state.events, state.stageId]);

    // ------------------------------------------------------------------
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
    // Session sync (controller reports, display adopts).
    // ------------------------------------------------------------------
    const adoptFromSnapshot = useCallback((snapshot) => {
        const adopted = adoptSnapshot(snapshot);
        if (!adopted) {
            return;
        }
        // Dual-source (SSE + direct link): drop stale frames. Snapshot seq is
        // always >= 1 on the wire; the 0 guard keeps pre-v2 fallback frames.
        if (adopted.seq > 0 && adopted.seq <= seqRef.current) {
            return;
        }
        seqRef.current = Math.max(seqRef.current, adopted.seq);
        const { config: cfg } = stateRef.current ?? {};
        dispatch({
            type: 'ADOPT',
            patch: {
                stageId: adopted.stageId,
                stageMode: adopted.stageMode,
                durationSec: Number(cfg?.stages?.[adopted.stageId] ?? 0),
                graceSec: Number(cfg?.stageGrace?.[adopted.stageId] ?? 0),
                sides: adopted.sides,
            },
        });
    }, []);

    const reportSnapshot = useCallback(async () => {
        const session = sessionRef.current;
        if (!session) {
            return;
        }
        const { state: s, config: cfg } = stateRef.current;
        const snapshot = buildSnapshot(s, (seqRef.current += 1));
        const result = await TimerSessionService.reportSnapshot(cfg.name, snapshot);
        // Direct-link remote gets the same snapshot without the server hop.
        hostChannelRef.current?.send({ snapshot });
        if (!sessionRef.current) {
            return; // session was stopped while the request was in flight
        }
        if (result.success) {
            session.failures = 0;
            setSessionState('active');
            return;
        }
        session.failures = (session.failures || 0) + 1;
        if (session.failures >= 2) {
            setSessionState('weak');
        }
        if ([400, 403, 404].includes(result.status)) {
            // Session is gone (expired, superseded, or access denied).
            sessionRef.current = null;
            setSessionState('idle');
            setSessionNotice(t('timer.session.ended'));
            saveMatchRecord(true);
        }
    }, [t, saveMatchRecord]);

    const handleStartSession = useCallback(async () => {
        if (sessionRef.current || sessionState === 'starting') {
            return;
        }
        // A follower cannot start its own session on top of the live one.
        if (followTokenRef.current) {
            return;
        }
        if (!user) {
            setSessionNotice(t('timer.session.enableShareFirst'));
            return;
        }
        if (!config.shareEnabled) {
            setSessionNotice(t('timer.session.enableShareFirst'));
            return;
        }
        setSessionState('starting');
        const result = await TimerSessionService.startSession(config.name);
        if (!result.success) {
            setSessionState('idle');
            setSessionNotice(result.message);
            return;
        }
        sessionRef.current = {
            shareToken: result.data.shareToken,
            displayUrl: result.data.displayUrl,
            failures: 0,
        };
        seqRef.current = result.data.snapshot?.seq ?? 0;
        setSessionState('active');
        reportSnapshot();
    }, [user, config, sessionState, reportSnapshot, t]);

    const handleStopSession = useCallback(async () => {
        const wasActive = Boolean(sessionRef.current);
        sessionRef.current = null;
        setSessionState('idle');
        if (wasActive) {
            const result = await TimerSessionService.stopSession(stateRef.current.config.name);
            if (!result.success) {
                setSessionNotice(result.message);
            }
            // Auto-save the match record when the session ends (PRD FR-B2).
            saveMatchRecord(true);
        }
    }, [saveMatchRecord]);

    // After a page refresh (or template switch), probe for a live session
    // owned by this user (another device remote-controlling). Found → ask
    // the page whether to follow or take over (C-02-06); no silent resume.
    const probeForLiveSession = useCallback(async () => {
        if (pendingDismissedRef.current || followTokenRef.current) {
            return;
        }
        const info = stateRef.current?.config;
        if (!info?.shareEnabled || !info.shareToken || sessionRef.current) {
            return;
        }
        const result = await TimerSessionService.loadDisplayState(info.shareToken);
        if (result.success && result.data.active) {
            setPendingSession(true);
        }
    }, []);

    // Follow: this page mirrors the live session read-only (display-side
    // snapshot adoption + SSE), keeping its own console/remote layout.
    const startFollowing = useCallback(() => {
        const info = stateRef.current?.config;
        if (!info?.shareToken) {
            return;
        }
        setPendingSession(false);
        followTokenRef.current = info.shareToken;
        setFollowToken(info.shareToken);
    }, []);

    // C-02-07 remote mode: same snapshot subscription as following, but this
    // page's buttons send commands to the host instead of driving the engine.
    // C-02-08: entering also tries the P2P direct link (same-LAN only); the
    // server path remains the fallback for commands and state while the
    // channel is not open.
    const startRemoteMode = useCallback(() => {
        const info = stateRef.current?.config;
        if (!info?.shareToken) {
            return;
        }
        setPendingSession(false);
        remoteModeRef.current = true;
        setRemoteMode(true);
        followTokenRef.current = info.shareToken;
        setFollowToken(info.shareToken);
        setRtcState('connecting');
        rtcChannelRef.current?.close();
        rtcChannelRef.current = initiateDirectChannel({
            sendSignal: (body) => {
                TimerSessionService.sendSignal(info.name ?? '', body);
            },
            onSignal: (listener) => {
                signalListenerRef.current = listener;
                return () => {
                    if (signalListenerRef.current === listener) {
                        signalListenerRef.current = null;
                    }
                };
            },
            onMessage: (msg) => {
                if (msg?.snapshot) {
                    adoptFromSnapshot(msg.snapshot);
                }
            },
            onState: (state) => {
                setRtcState(state === 'open' ? 'open' : 'off');
                if (state !== 'open') {
                    rtcChannelRef.current = null;
                }
            },
        });
    }, [adoptFromSnapshot]);

    const closeRemoteChannel = useCallback(() => {
        rtcChannelRef.current?.close();
        rtcChannelRef.current = null;
        setRtcState('off');
    }, []);

    // Remote button → host. The host's next snapshot flowing back is the ack.
    const sendRemoteCommand = useCallback(async (command) => {
        if (!remoteModeRef.current) {
            return;
        }
        // P2P first: ~5ms on the same LAN. Local seq space starts at 1e9 so
        // the host's dedup sees one monotonic space across both sources.
        if (rtcChannelRef.current?.isOpen) {
            rtcChannelRef.current.send({
                ...command,
                commandSeq: 1_000_000_000 + (localCommandSeqRef.current += 1),
                at: Date.now(),
            });
            return;
        }
        const cfg = stateRef.current?.config;
        if (!cfg?.name) {
            return;
        }
        const result = await TimerSessionService.sendCommand(cfg.name, command);
        if (!result.success && [400, 403, 404].includes(result.status)) {
            // Session is gone — fall back to local timing on this device.
            closeRemoteChannel();
            remoteModeRef.current = false;
            setRemoteMode(false);
            followTokenRef.current = null;
            setFollowToken(null);
            setSessionNotice(t('timer.session.remoteLost'));
        }
    // closeRemoteChannel is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [t]);

    // Host-side command execution (shared by the SSE relay and the P2P
    // direct link). Seq-deduped; direct-link seqs start at 1e9 so both
    // sources share one monotonic space. Local actions and commands
    // interleave through the same reducer — no extra locking.
    const applyHostCommand = useCallback((cmd) => {
        if (!cmd || typeof cmd.commandSeq !== 'number'
            || cmd.commandSeq <= lastCommandSeqRef.current) {
            return;
        }
        lastCommandSeqRef.current = cmd.commandSeq;
        const s = stateRef.current?.state;
        if (cmd.type === 'applyStage') {
            applyStage(cmd.stageId);
            return;
        }
        if (cmd.type === 'soundCheck') {
            // Bell test plays on the host (venue speakers).
            dispatch({ type: 'SOUND_CHECK', kind: cmd.kind });
            return;
        }
        const side = cmd.side;
        const verb = cmd.type === 'toggle'
            ? (s?.sides[side]?.running ? 'STOP' : 'START')
            : cmd.type.toUpperCase();
        if (['START', 'STOP', 'RESET', 'TOGGLE'].includes(verb)
            && ['single', 'aff', 'neg'].includes(side)) {
            if (verb === 'TOGGLE') {
                dispatch({ type: 'TOGGLE', side });
            } else {
                dispatch({ type: verb, side });
            }
        }
    // applyStage is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Host side: while this page runs an active session, execute remote
    // commands arriving on the display stream, and answer the P2P direct
    // link's signaling automatically (C-02-08).
    useEffect(() => {
        if (isDisplay || (sessionState !== 'active' && sessionState !== 'weak')) {
            return undefined;
        }
        const token = sessionRef.current?.shareToken
            ?? stateRef.current?.config?.shareToken;
        if (!token) {
            return undefined;
        }
        lastCommandSeqRef.current = 0;

        // P2P answerer: commands arrive on the DataChannel with ~5ms latency.
        hostChannelRef.current?.close();
        hostChannelRef.current = answerDirectChannel({
            sendSignal: (body) => {
                TimerSessionService.sendSignal(stateRef.current?.config?.name ?? '', body);
            },
            onSignal: (listener) => {
                signalListenerRef.current = listener;
                return () => {
                    if (signalListenerRef.current === listener) {
                        signalListenerRef.current = null;
                    }
                };
            },
            onMessage: (msg) => {
                if (msg && msg.type) {
                    applyHostCommand(msg);
                }
            },
            onState: () => {
                // The host stays authoritative either way — no UI delta.
            },
        });

        const unsubscribe = TimerSessionService.onDisplayState(token, {
            // Only commands/signals: the host is authoritative — its own
            // snapshot echoes on this stream must not be adopted.
            onCommand: applyHostCommand,
            onSignal: (frame) => signalListenerRef.current?.(frame),
        });
        return () => {
            unsubscribe();
            hostChannelRef.current?.close();
            hostChannelRef.current = null;
            signalListenerRef.current = null;
        };
    // applyHostCommand/applyStage are stable; lifecycle drives re-subscription.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionState, isDisplay]);

    // Take over: adopt the current snapshot and resume reporting from this
    // page. The previous controller loses on the next heartbeat (stale seq
    // → session-ended) and falls back to standalone. Must drop the follow
    // subscription first, or the old controller's SSE stream keeps
    // overwriting this page's freshly-taken-over state.
    const takeoverSession = useCallback(async () => {
        const info = stateRef.current?.config;
        if (!info?.shareToken) {
            return;
        }
        const result = await TimerSessionService.loadDisplayState(info.shareToken);
        setPendingSession(false);
        if (!result.success || !result.data.active) {
            return;
        }
        followTokenRef.current = null;
        setFollowToken(null);
        setFollowing(false);
        remoteModeRef.current = false;
        setRemoteMode(false);
        rtcChannelRef.current?.close();
        rtcChannelRef.current = null;
        setRtcState('off');
        adoptFromSnapshot(result.data.snapshot);
        sessionRef.current = {
            shareToken: info.shareToken,
            displayUrl: `/display/${info.shareToken}`,
            failures: 0,
        };
        setSessionState('active');
    }, [adoptFromSnapshot]);

    const dismissPendingSession = useCallback(() => {
        pendingDismissedRef.current = true;
        setPendingSession(false);
    }, []);

    useEffect(() => {
        if (isDisplay || Object.keys(config.stages).length === 0) {
            return;
        }
        probeForLiveSession();
    }, [config, isDisplay, probeForLiveSession]);

    const handleCopyDisplayUrl = useCallback(async () => {
        const path = sessionRef.current?.displayUrl
            ?? (config.shareToken ? `/display/${config.shareToken}` : null);
        if (!path) {
            return;
        }
        const url = `${window.location.origin}${path}`;
        try {
            await navigator.clipboard.writeText(url);
            setSessionNotice(t('timer.session.copied'));
        } catch {
            setSessionNotice(url);
        }
    }, [config, t]);

    // Report on every discrete state transition (start/stop/reset/stage
    // switch); per-second drift is carried by the heartbeat snapshots.
    const transitionKey = [
        state.stageId,
        state.sides.single.running,
        state.sides.aff.running,
        state.sides.neg.running,
        state.sides.single.phase === 'locked',
        state.sides.aff.phase === 'locked',
        state.sides.neg.phase === 'locked',
    ].join('|');
    useEffect(() => {
        if (isDisplay || !sessionRef.current) {
            return;
        }
        reportSnapshot();
    // reportSnapshot is stable (stateRef-based); key on the transition only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [transitionKey]);

    // Heartbeat: keeps the session alive server-side and re-syncs times.
    useEffect(() => {
        if (isDisplay || (sessionState !== 'active' && sessionState !== 'weak')) {
            return undefined;
        }
        const id = window.setInterval(() => {
            reportSnapshot();
        }, 2000);
        return () => window.clearInterval(id);
    }, [sessionState, reportSnapshot, isDisplay]);

    // Auto-dismiss the transient snackbar / banner notices.
    useEffect(() => {
        if (!sessionNotice) {
            return undefined;
        }
        const id = window.setTimeout(() => setSessionNotice(null), 4000);
        return () => window.clearTimeout(id);
    }, [sessionNotice]);

    // Weak-signal detection on the display: no snapshot for 5s while following.
    useEffect(() => {
        if (!isDisplay || !following) {
            return undefined;
        }
        lastStateAtRef.current = Date.now();
        const id = window.setInterval(() => {
            if (Date.now() - lastStateAtRef.current > 5000) {
                setDisplayBanner((prev) => (prev === 'following' ? 'weak' : prev));
            }
        }, 1000);
        return () => window.clearInterval(id);
    }, [isDisplay, following]);

    useEffect(() => () => {
        if (bannerTimerRef.current) {
            window.clearTimeout(bannerTimerRef.current);
        }
        rtcChannelRef.current?.close();
        hostChannelRef.current?.close();
    }, []);

    // Display follow: adopt the running session (if any) and keep
    // re-adopting controller snapshots over SSE. On console pages the
    // follow token arrives via C-02-06 (user chose "跟随").
    const activeFollowToken = shareToken || followToken;
    useEffect(() => {
        if (!activeFollowToken || status !== 'ok') {
            return undefined;
        }
        let stateUnsubscribe;
        let cancelled = false;

        (async () => {
            const stateResult = await TimerSessionService.loadDisplayState(activeFollowToken);
            if (cancelled) {
                return;
            }
            if (stateResult.success && stateResult.data.active) {
                lastStateAtRef.current = Date.now();
                adoptFromSnapshot(stateResult.data.snapshot);
                setFollowing(true);
                setDisplayBanner('following');
            }
            stateUnsubscribe = TimerSessionService.onDisplayState(activeFollowToken, {
                onState: (snapshot) => {
                    lastStateAtRef.current = Date.now();
                    setFollowing(true);
                    setDisplayBanner('following');
                    adoptFromSnapshot(snapshot);
                },
                onSignal: (frame) => signalListenerRef.current?.(frame),
                onSession: (event) => {
                    if (event.type === 'started') {
                        setFollowing(true);
                        setDisplayBanner('following');
                        return;
                    }
                    if (event.type === 'ended' || event.type === 'expired') {
                        const wasRemote = remoteModeRef.current;
                        if (wasRemote) {
                            rtcChannelRef.current?.close();
                            rtcChannelRef.current = null;
                            setRtcState('off');
                        }
                        setFollowing(false);
                        if (!wasRemote) {
                            // Display/follow: freeze the mirrored clocks.
                            // Remote mode falls back to LOCAL timing instead —
                            // keep the engine running on this device.
                            dispatch({ type: 'STOP_ALL' });
                        }
                        remoteModeRef.current = false;
                        setRemoteMode(false);
                        setDisplayBanner('ended');
                        if (!isDisplay) {
                            setSessionNotice(wasRemote
                                ? t('timer.session.remoteLost')
                                : t('timer.session.ended'));
                        }
                        if (bannerTimerRef.current) {
                            window.clearTimeout(bannerTimerRef.current);
                        }
                        bannerTimerRef.current = window.setTimeout(() => {
                            setDisplayBanner(null);
                        }, 8000);
                    }
                },
                onOpen: async () => {
                    const sync = await TimerSessionService.loadDisplayState(activeFollowToken);
                    if (!sync.success) {
                        return;
                    }
                    if (sync.data.active) {
                        lastStateAtRef.current = Date.now();
                        setFollowing(true);
                        adoptFromSnapshot(sync.data.snapshot);
                    } else if (followingRef.current) {
                        setFollowing(false);
                        dispatch({ type: 'STOP_ALL' });
                        setDisplayBanner('ended');
                    }
                },
            });
        })();

        return () => {
            cancelled = true;
            if (stateUnsubscribe) {
                stateUnsubscribe();
            }
        };
    }, [activeFollowToken, status, adoptFromSnapshot, isDisplay, t]);

    // ------------------------------------------------------------------
    // Per-side actions for buttons and shortcuts.
    // ------------------------------------------------------------------
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
        derived,
        orderedStages,
        following,
        displayBanner,
        sessionState,
        sessionNotice,
        setSessionNotice,
        captureCount,
        // C-02-06 console follow: discovery prompt + follow/takeover
        pendingSession,
        startFollowing,
        takeoverSession,
        dismissPendingSession,
        // C-02-07 dual-mode remote
        remoteMode,
        startRemoteMode,
        sendRemoteCommand,
        // C-02-08 P2P direct link
        rtcState,
        // actions
        actions,
        handleStartSession,
        handleStopSession,
        handleCopyDisplayUrl,
        saveMatchRecord,
    };
}
