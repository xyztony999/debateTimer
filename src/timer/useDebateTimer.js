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
import { buildSnapshot, adoptSnapshot, compensateInFlight } from './snapshotCodec.js';
import { beginStageCapture, bumpOverrun, buildMatchPayload } from './matchCapture.js';
import { initiateDirectChannel, answerDirectChannel } from './rtcChannel.js';
import { anchorResetsForAction } from './clockAnchors.js';
import { createSnapshotQueue, snapshotFailureAction } from './snapshotReporting.js';

/**
 * Timer runtime assembly: wires the engine reducer to the wall clock,
 * sounds, match capture, auto-advance, and the control/display session
 * sync. Everything here is behavior; pages only render. Controller pages
 * call with no arguments, display pages with the share token.
 */
// R4 role memories: tokens this device opened (host) or attached to
// (remote). Written on start/pair, cleared on end/loss — module-level
// because they are stateless localStorage accessors.
const selfHostMemory = {
    read: () => { try { return JSON.parse(localStorage.getItem('timer.session.selfHost') || 'null'); } catch { return null; } },
    write: (v) => { try { localStorage.setItem('timer.session.selfHost', JSON.stringify(v)); } catch { /* ignore */ } },
    clear: () => { try { localStorage.removeItem('timer.session.selfHost'); } catch { /* ignore */ } },
};
const lastRemoteMemory = {
    read: () => { try { return JSON.parse(localStorage.getItem('timer.session.lastRemote') || 'null'); } catch { return null; } },
    write: (v) => { try { localStorage.setItem('timer.session.lastRemote', JSON.stringify(v)); } catch { /* ignore */ } },
    clear: () => { try { localStorage.removeItem('timer.session.lastRemote'); } catch { /* ignore */ } },
};

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


    // --- Control session (operator) / follow state (display) ---
    const [sessionState, setSessionState] = useState('idle'); // idle | starting | active | weak
    const [pairingCode, setPairingCode] = useState(null);
    const [sessionNotice, setSessionNotice] = useState(null);
    const [following, setFollowing] = useState(false);
    const [displayBanner, setDisplayBanner] = useState(null); // following | weak | ended
    const [captureCount, setCaptureCount] = useState(0);
    // --- C-02-06 console follow / pairing: discovery state + follow token ---
    // R4: no auto popup — detection result surfaces inside the pairing
    // dialog; resumes happen silently via the role memories below.
    const [detectedSession, setDetectedSession] = useState(null);
    const [followToken, setFollowToken] = useState(null);
    // --- C-02-07 dual-mode remote: thin client sending commands to a host ---
    const [remoteMode, setRemoteMode] = useState(false);

    const sessionRef = useRef(null); // { shareToken, displayUrl, failures }
    const seqRef = useRef(0);
    const snapshotQueueRef = useRef(createSnapshotQueue());
    // D23 (PageSpec §16): session generation guard — a changed sessionId
    // means the server restarted the seq space, so the dedup must reset.
    const sessionIdRef = useRef(null);
    // D26 (PageSpec §17): session self-heal state — in-flight guard, backoff
    // timestamp, failure backoff, and late-bound mutual refs
    // (reportSnapshot ↔ recoverSession are mutually recursive and render-time
    // ref writes are forbidden).
    const recoveringRef = useRef(false);
    const startingRef = useRef(false); // D31: sync double-click guard for start
    const recoveryFailuresRef = useRef(0);
    // D33: host clock offset vs the API server (EMA over report RTTs).
    const hostClockOffsetRef = useRef(null);
    // D34: consumer clock offset vs the API server (EMA over SSE frames).
    const consumerClockSkewRef = useRef(null);
    const lastRecoveryAtRef = useRef(0);
    const recoverSessionRef = useRef(null);
    const reportSnapshotRef = useRef(null);
    const followingRef = useRef(false);
    const lastStateAtRef = useRef(0);
    const bannerTimerRef = useRef(null);
    const captureRef = useRef(null);
    const matchAutoSavedRef = useRef(false);

    const followTokenRef = useRef(null);
    const remoteModeRef = useRef(false);
    const remoteTargetRef = useRef(null); // paired host { name, shareToken } override
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
        // D23 (PageSpec §16): detect a new session generation before the seq
        // dedup — without this, every post-restart snapshot reads as stale
        // and the display stays frozen on the previous session's stage.
        // Direct-link frames carry no sessionId and pass through untouched.
        const sessionId = snapshot?.sessionId;
        if (sessionId && sessionIdRef.current && sessionId !== sessionIdRef.current) {
            seqRef.current = 0;
        }
        if (sessionId) {
            sessionIdRef.current = sessionId;
        }
        // D34 (PageSpec §19): sample (local − server) clock skew off every
        // stamped frame; robust EMA — samples far from the running estimate
        // (network spikes) are discarded so they cannot drag it.
        const sentAt = Number(snapshot?.serverTime);
        if (Number.isFinite(sentAt)) {
            const sample = Date.now() - sentAt;
            const prev = consumerClockSkewRef.current;
            consumerClockSkewRef.current = !Number.isFinite(prev) || Math.abs(sample - prev) <= 1500
                ? (Number.isFinite(prev) ? prev * 0.9 + sample * 0.1 : sample)
                : prev;
        }
        // D35 (PageSpec §19): smooth adopt — compare on the compensated
        // millisecond wire (adoptSnapshot floors to seconds, which would make
        // any tolerance meaningless): when structure is unchanged and every
        // active side is within 200ms, keep the local tick; re-adopting every
        // second would visibly pull the clock back by whatever the residual
        // compensation error is. seq still advances on skip — a skipped frame
        // must not resurrect the dedup window for stale dual-source frames.
        const { state: cur } = stateRef.current ?? {};
        const comp = compensateInFlight(snapshot, Date.now(), consumerClockSkewRef.current);
        // D38: anchor the truth layer to the compensated wire milliseconds —
        // the sub-second phase the host sent survives into local rendering.
        if (comp && comp.stageId) {
            const single = comp.stageMode === 'single';
            const affMs = Number(comp.remainingAffMs);
            const negMs = Number(comp.remainingNegMs);
            if (Number.isFinite(affMs)) {
                if (comp.runningAff) {
                    setRunningAnchor('aff', affMs);
                    if (single) {
                        setRunningAnchor('single', affMs);
                    }
                } else {
                    setFrozenAnchor('aff', affMs);
                    if (single) {
                        setFrozenAnchor('single', affMs);
                    }
                }
            }
            if (!single && Number.isFinite(negMs)) {
                if (comp.runningNeg) {
                    setRunningAnchor('neg', negMs);
                } else {
                    setFrozenAnchor('neg', negMs);
                }
            }
        }
        const candidate = adoptSnapshot(comp);
        if (cur && candidate && cur.stageId === candidate.stageId
            && cur.stageMode === candidate.stageMode) {
            const wireClose = (wireRunning, wirePhase, wireMs, local) => {
                if (wireRunning !== local.running || wirePhase !== local.phase) {
                    return false;
                }
                if (wirePhase === 'grace' && Math.abs(wireMs - (local.graceLeft ?? 0) * 1000) >= 1000) {
                    return false; // grace counts whole seconds — allow 1s slack
                }
                return Math.abs(wireMs - local.remaining * 1000) < 200;
            };
            const single = cur.stageMode === 'single';
            const closeEnough = single
                ? wireClose(comp.runningAff, comp.phaseAff, comp.remainingAffMs, cur.sides.aff)
                : wireClose(comp.runningAff, comp.phaseAff, comp.remainingAffMs, cur.sides.aff)
                    && wireClose(comp.runningNeg, comp.phaseNeg, comp.remainingNegMs, cur.sides.neg);
            if (closeEnough && candidate.seq > 0) {
                seqRef.current = Math.max(seqRef.current, candidate.seq);
                return; // shows the same thing — keep ticking locally
            }
        }
        const adopted = candidate;
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

    const reportSnapshot = useCallback(() => {
        const session = sessionRef.current;
        if (!session) {
            return;
        }
        return snapshotQueueRef.current.enqueue(async () => {
            if (sessionRef.current !== session) {
                return;
            }
            const { state: s, config: cfg } = stateRef.current;
            // D38: wire the anchor truth (ms + sub-second phase), engine ints as
            // fallback for sides without an anchor yet.
            const singleMode = s.stageMode === 'single';
            const liveAff = anchorMsOf(anchorsRef.current, singleMode ? 'single' : 'aff');
            const liveNeg = anchorMsOf(anchorsRef.current, singleMode ? 'single' : 'neg');
            const liveMs = (liveAff != null || liveNeg != null)
                ? {
                    affMs: liveAff ?? s.sides[singleMode ? 'single' : 'aff'].remaining * 1000,
                    negMs: liveNeg ?? s.sides[singleMode ? 'single' : 'neg'].remaining * 1000,
                }
                : null;
            const snapshot = buildSnapshot(s, (seqRef.current += 1), liveMs);
            // D29 (PageSpec §18): claim sovereignty — the server arbitrates this
            // id against the live session on the token and 409s us off if
            // another console recreated the session underneath us.
            if (session.sessionId) {
                snapshot.sessionId = session.sessionId;
            }
            const sentAtLocal = Date.now();
            // D33 (PageSpec §19): tell the server when (in ITS clock) these
            // values were captured, so it can burn off the uplink leg.
            if (Number.isFinite(hostClockOffsetRef.current)) {
                snapshot.captureServerAt = sentAtLocal + hostClockOffsetRef.current;
            }
            // Direct-link remote gets the same snapshot without the server hop.
            hostChannelRef.current?.send({ snapshot });
            const result = await TimerSessionService.reportSnapshot(cfg.name, snapshot);
            if (sessionRef.current !== session) {
                return; // old responses cannot change a stopped or replacement session
            }
            if (result.success) {
                session.failures = 0;
                setSessionState('active');
                // D33: NTP-lite sample — offset = serverTime − (t0 + RTT/2);
                // EMA-smoothed, samples on laggy round trips discarded.
                const serverTime = Number(result.data?.serverTime);
                if (Number.isFinite(serverTime)) {
                    const rtt = Date.now() - sentAtLocal;
                    if (rtt > 0 && rtt <= 2000) {
                        const sample = serverTime - (sentAtLocal + rtt / 2);
                        const prev = hostClockOffsetRef.current;
                        hostClockOffsetRef.current = Number.isFinite(prev)
                            ? prev * 0.9 + sample * 0.1
                            : sample;
                    }
                }
                return;
            }
            const failureAction = snapshotFailureAction(result);
            if (failureAction === 'ignore') {
                return;
            }
            session.failures = (session.failures || 0) + 1;
            if (session.failures >= 2) {
                setSessionState('weak');
            }
            if (failureAction === 'yield') {
                // D30 (PageSpec §18): another console holds the seat on this
                // token — yield for good: no self-heal, no match record (the
                // winner owns the save), just a clear notice.
                sessionRef.current = null;
                setSessionState('idle');
                setPairingCode(null);
                setSessionNotice(t('timer.session.takenByOther'));
                return;
            }
            if (failureAction === 'recover') {
                await recoverSessionRef.current?.(session);
                return;
            }
            if (failureAction === 'end') {
                sessionRef.current = null;
                setSessionState('idle');
                setSessionNotice(t('timer.session.ended'));
                saveMatchRecord(true);
            }
            if (failureAction === 'retry' && result.status === 400 && session.failures === 1) {
                console.warn('Timer snapshot rejected:', result.message);
            }
        });
    }, [t, saveMatchRecord]);

    const recoverSession = useCallback(async (deadSession) => {
        const now = Date.now();
        const backoffMs = Math.min(5000 * (2 ** Math.min(recoveryFailuresRef.current, 3)), 30000);
        if (sessionRef.current !== deadSession || recoveringRef.current
            || now - lastRecoveryAtRef.current < backoffMs) {
            return;
        }
        recoveringRef.current = true;
        lastRecoveryAtRef.current = now;
        try {
            const cfg = stateRef.current?.config;
            if (!cfg?.shareEnabled) {
                sessionRef.current = null;
                setSessionState('idle');
                setPairingCode(null);
                setSessionNotice(t('timer.session.ended'));
                saveMatchRecord(true);
                return;
            }
            const result = await TimerSessionService.startSession(cfg.name);
            if (sessionRef.current !== deadSession) {
                return;
            }
            if (!result.success) {
                if ([403, 404].includes(result.status)) {
                    sessionRef.current = null;
                    setSessionState('idle');
                    setSessionNotice(t('timer.session.ended'));
                    saveMatchRecord(true);
                    return;
                }
                throw new Error(result.message || 'start failed');
            }
            sessionRef.current = {
                shareToken: result.data.shareToken,
                sessionId: result.data.sessionId ?? null, // D29: sovereignty claim
                displayUrl: result.data.displayUrl,
                failures: 0,
            };
            selfHostMemory.write({
                configName: cfg.name,
                shareToken: result.data.shareToken,
                pairingCode: result.data.pairingCode ?? null,
            });
            setPairingCode(result.data.pairingCode ?? null);
            seqRef.current = result.data.snapshot?.seq ?? 0;
            setSessionState('active');
            recoveryFailuresRef.current = 0;
            setSessionNotice(t('timer.session.reconnected'));
            reportSnapshotRef.current?.();
        } catch {
            if (sessionRef.current !== deadSession) {
                return;
            }
            // Keep the heartbeat alive through a network outage; the next
            // missing-session response retries recovery after the backoff.
            recoveryFailuresRef.current += 1;
            setSessionState('weak');
        } finally {
            recoveringRef.current = false;
        }
    }, [t, saveMatchRecord]);

    // Late-bound refs: reportSnapshot ↔ recoverSession are mutually recursive.
    useEffect(() => {
        reportSnapshotRef.current = reportSnapshot;
        recoverSessionRef.current = recoverSession;
    }, [reportSnapshot, recoverSession]);

    const handleStartSession = useCallback(async () => {
        if (sessionRef.current || sessionState === 'starting' || startingRef.current) {
            return; // D31: ref guard closes the double-click window (two
            // creates supersede each other and the loser grinds 400s).
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
        startingRef.current = true;
        setSessionState('starting');
        try {
        const result = await TimerSessionService.startSession(config.name);
        if (!result.success) {
            setSessionState('idle');
            setSessionNotice(result.message);
            return;
        }
        sessionRef.current = {
            shareToken: result.data.shareToken,
            sessionId: result.data.sessionId ?? null, // D29: sovereignty claim
            displayUrl: result.data.displayUrl,
            failures: 0,
        };
        selfHostMemory.write({
            configName: stateRef.current?.config?.name,
            shareToken: result.data.shareToken,
            pairingCode: result.data.pairingCode ?? null,
        });
        setPairingCode(result.data.pairingCode ?? null);
        seqRef.current = result.data.snapshot?.seq ?? 0;
        recoveryFailuresRef.current = 0; // fresh session, reset recovery backoff
        setSessionState('active');
        reportSnapshot();
        } finally {
            startingRef.current = false;
        }
    }, [user, config, sessionState, reportSnapshot, t]);

    const handleStopSession = useCallback(async () => {
        const wasActive = Boolean(sessionRef.current);
        sessionRef.current = null;
        setSessionState('idle');
        setPairingCode(null);
        recoveryFailuresRef.current = 0; // explicit stop resets recovery backoff
        selfHostMemory.clear();
        if (wasActive) {
            const result = await TimerSessionService.stopSession(stateRef.current.config.name);
            if (!result.success) {
                setSessionNotice(result.message);
            }
            // Auto-save the match record when the session ends (PRD FR-B2).
            saveMatchRecord(true);
        }
    }, [saveMatchRecord]);

    // Follow: this page mirrors the live session read-only (display-side
    // snapshot adoption + SSE), keeping its own console/remote layout.
    const startFollowing = useCallback(() => {
        const info = stateRef.current?.config;
        if (!info?.shareToken) {
            return;
        }
        setDetectedSession(null);
        followTokenRef.current = info.shareToken;
        setFollowToken(info.shareToken);
    }, []);

    // C-02-07 remote mode: same snapshot subscription as following, but this
    // page's buttons send commands to the host instead of driving the engine.
    // C-02-08: entering also tries the P2P direct link (same-LAN only); the
    // server path remains the fallback for commands and state while the
    // channel is not open.
    const startRemoteMode = useCallback((external) => {
        // Paired attach: the host's config may differ from this page's config —
        // subscribe and command against the paired token/name instead.
        const info = external?.shareToken
            ? { shareToken: external.shareToken, name: external.configName ?? '' }
            : stateRef.current?.config;
        if (!info?.shareToken) {
            return;
        }
        setDetectedSession(null);
        remoteModeRef.current = true;
        setRemoteMode(true);
        if (external?.shareToken) {
            remoteTargetRef.current = { name: external.configName ?? '', shareToken: external.shareToken };
            lastRemoteMemory.write({ configName: external.configName ?? '', shareToken: external.shareToken });
        }
        followTokenRef.current = info.shareToken;
        setFollowToken(info.shareToken);
        setRtcState('connecting');
        rtcChannelRef.current?.close();
        rtcChannelRef.current = initiateDirectChannel({
            sendSignal: (body) => {
                const name = remoteTargetRef.current?.name ?? stateRef.current?.config?.name ?? '';
                TimerSessionService.sendSignal(name, body);
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
        remoteTargetRef.current = null;
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
        const target = remoteTargetRef.current ?? stateRef.current?.config;
        if (!target?.name) {
            return;
        }
        const result = await TimerSessionService.sendCommand(target.name, command);
        if (!result.success && [400, 403, 404].includes(result.status)) {
            // Session is gone — fall back to local timing on this device.
            lastRemoteMemory.clear();
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

        // Register on the config-stream listeners (no new connection — see
        // the configNamedEvents comment above).
        hostCommandListenerRef.current = applyHostCommand;
        hostSignalListenerRef.current = (frame) => signalListenerRef.current?.(frame);
        return () => {
            hostCommandListenerRef.current = null;
            hostSignalListenerRef.current = null;
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
        setDetectedSession(null);
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
            sessionId: result.data.snapshot?.sessionId ?? null, // D29
            displayUrl: `/display/${info.shareToken}`,
            failures: 0,
        };
        setSessionState('active');
    }, [adoptFromSnapshot]);

    // Pair by the 4-digit code shown on the host; on success jump straight
    // into remote mode bound to the host's (possibly different) config.
    const pairWithCode = useCallback(async (code) => {
        const result = await TimerSessionService.pair(code);
        if (!result.success) {
            return result;
        }
        const { configName, shareToken } = result.data;
        lastRemoteMemory.write({ configName, shareToken });
        startRemoteMode({ configName, shareToken });
        return result;
    }, [startRemoteMode]);

    // R4 silent-resume chain (replaces the auto popup): the session THIS
    // device opened resumes reporting; the session this device remote-
    // controlled resumes remote mode. Anything else stays untouched —
    // attach via the pairing dialog.
    const resumeFromMemories = useCallback(async () => {
        if (sessionRef.current || followTokenRef.current) {
            return;
        }
        // 1) My own host session → silently resume reporting (reclaim).
        const self = selfHostMemory.read();
        if (self?.shareToken) {
            const mine = await TimerSessionService.loadDisplayState(self.shareToken);
            if (mine.success && mine.data.active) {
                adoptFromSnapshot(mine.data.snapshot);
                sessionRef.current = {
                    shareToken: self.shareToken,
                    sessionId: mine.data.snapshot?.sessionId ?? null, // D29
                    displayUrl: `/display/${self.shareToken}`,
                    failures: 0,
                };
                setPairingCode(self.pairingCode ?? null);
                setSessionState('active');
                return;
            }
            selfHostMemory.clear();
        }
        // 2) The session I remoted → silently resume remote mode.
        const last = lastRemoteMemory.read();
        if (last?.shareToken) {
            const theirs = await TimerSessionService.loadDisplayState(last.shareToken);
            if (theirs.success && theirs.data.active) {
                startRemoteMode({ configName: last.configName, shareToken: last.shareToken });
                return;
            }
            lastRemoteMemory.clear();
        }
    }, [adoptFromSnapshot, startRemoteMode]);

    // Pairing-dialog discovery probe: refreshes detectedSession for the
    // "检测到会话 → 直接连接" block (page calls this when the dialog opens).
    const probeForPairingDialog = useCallback(async () => {
        if (followTokenRef.current || sessionRef.current) {
            setDetectedSession(null);
            return;
        }
        const info = stateRef.current?.config;
        if (!info?.shareEnabled || !info.shareToken) {
            setDetectedSession(null);
            return;
        }
        const result = await TimerSessionService.loadDisplayState(info.shareToken);
        setDetectedSession(result.success && result.data.active
            ? { configName: info.name, shareToken: info.shareToken }
            : null);
    }, []);




    useEffect(() => {
        if (isDisplay || Object.keys(config.stages).length === 0) {
            return;
        }
        resumeFromMemories();
    }, [config, isDisplay, resumeFromMemories]);

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
        state.sides.single.blinkOverride,
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
        }, 1000); // D22: 1s cadence halves the adopt pull-back amplitude
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
                        seqRef.current = 0; // D23: new generation, fresh dedup
                        setFollowing(true);
                        setDisplayBanner('following');
                        return;
                    }
                    if (event.type === 'ended' || event.type === 'expired') {
                        const wasRemote = remoteModeRef.current;
                        if (wasRemote) {
                            lastRemoteMemory.clear();
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
