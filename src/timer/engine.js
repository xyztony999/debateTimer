/**
 * Debate timer engine: a pure reducer that owns every per-side clock.
 *
 * One side state replaces what used to be three hand-mirrored useState
 * triplets (single / aff / neg). Sound cues and overrun bumps are emitted
 * as `events` on the state; the assembling hook consumes and clears them,
 * which keeps the reducer side-effect free.
 *
 * Side phase model (phases are exclusive):
 *   running → (time up, grace > 0) → grace → locked
 *   running → (time up, no grace)  → locked
 */

export const PHASE_RUNNING = 'running';
export const PHASE_GRACE = 'grace';
export const PHASE_LOCKED = 'locked';

// TimerSetting numeric modes (single=0/double=1/free=2) → wire string.
export const MODE_STRING = { 0: 'single', 1: 'double', 2: 'free' };

export const SIDES = ['single', 'aff', 'neg'];

const BLINK_WINDOW_HIGH = 30;
const BLINK_WINDOW_LOW = 27;

function makeSide(remaining = 0) {
    return {
        remaining,
        running: false,
        phase: PHASE_RUNNING,
        graceLeft: null, // seconds left while in grace; null outside grace
        blinkOverride: false, // sound-check "preview the 30s blink" flag
    };
}

export function initialState() {
    return {
        stageId: '',
        stageMode: 'single',
        durationSec: 0,
        graceSec: 0,
        sides: {
            single: makeSide(),
            aff: makeSide(),
            neg: makeSide(),
        },
        advance: null, // auto-advance countdown seconds; null = not pending
        freeAutoSwitch: false, // free-debate auto handover armed
        events: [],
    };
}

function resetSides(durationSec) {
    return {
        single: makeSide(durationSec),
        aff: makeSide(durationSec),
        neg: makeSide(durationSec),
    };
}

function patchSide(state, side, patch) {
    return { ...state.sides, [side]: { ...state.sides[side], ...patch } };
}

function withEvents(state, events) {
    return events.length > 0 ? { ...state, events: [...state.events, ...events] } : state;
}

function soundEvent(node) {
    return { type: 'sound', node };
}

function overrunEvent(side) {
    // Side is capitalized to match the capture entry keys (overrunAff/Neg).
    return { type: 'overrun', side: side === 'neg' ? 'Neg' : 'Aff' };
}

function isFree(state) {
    return state.stageMode === 'free';
}

function otherSide(side) {
    return side === 'aff' ? 'neg' : 'aff';
}

/**
 * Time ran out on `side`: stop it, maybe hand the floor over (free debate),
 * then either open the grace window or lock straight away.
 */
function handleTimeUp(state, side, events) {
    let sides = patchSide(state, side, { running: false });
    if (isFree(state) && state.freeAutoSwitch) {
        const other = state.sides[otherSide(side)];
        if (other.remaining > 0 && other.phase === PHASE_RUNNING && !other.running) {
            sides = patchSide({ ...state, sides }, otherSide(side), { running: true });
        }
    }
    if (state.graceSec > 0) {
        sides = patchSide({ ...state, sides }, side, { phase: PHASE_GRACE, graceLeft: state.graceSec });
        events.push(soundEvent('timeUp'));
    } else {
        sides = patchSide({ ...state, sides }, side, { phase: PHASE_LOCKED });
        events.push(soundEvent('mustStop'), overrunEvent(side));
    }
    return { ...state, sides };
}

/** One clock beat (1s): decrement running clocks, then grace countdowns. */
function clockTick(state) {
    const events = [];
    let sides = state.sides;
    let changed = false;
    // Sides already in grace when the beat started; sides that enter grace
    // during this beat wait for the next one (the old countdown effects
    // started their interval only after the phase flip).
    const graceAtStart = new Set(
        SIDES.filter((key) => state.sides[key].phase === PHASE_GRACE),
    );

    for (const side of SIDES) {
        const s = sides[side];
        if (s.running && s.phase === PHASE_RUNNING && s.remaining > 0) {
            const remaining = s.remaining - 1;
            changed = true;
            sides = { ...sides, [side]: { ...s, remaining } };
            if (remaining === BLINK_WINDOW_HIGH) {
                events.push(soundEvent('warn30'));
            }
            if (remaining === 0) {
                sides = handleTimeUp({ ...state, sides }, side, events).sides;
            }
        }
    }

    for (const side of SIDES) {
        if (!graceAtStart.has(side)) {
            continue;
        }
        const s = sides[side];
        if (s.graceLeft != null && s.graceLeft > 0) {
            const graceLeft = s.graceLeft - 1;
            changed = true;
            if (graceLeft === 0) {
                sides = {
                    ...sides,
                    [side]: { ...s, phase: PHASE_LOCKED, graceLeft: null },
                };
                events.push(soundEvent('mustStop'), overrunEvent(side));
            } else {
                sides = { ...sides, [side]: { ...s, graceLeft } };
            }
        }
    }

    if (!changed) {
        return state;
    }
    return withEvents({ ...state, sides }, events);
}

/** Free-debate handover: stopping `side` explicitly yields the floor. */
function freeHandover(state, side) {
    if (!isFree(state) || !state.freeAutoSwitch) {
        return state.sides;
    }
    const otherKey = otherSide(side);
    const other = state.sides[otherKey];
    if (other.remaining > 0 && other.phase === PHASE_RUNNING && !other.running) {
        return { ...state.sides, [otherKey]: { ...other, running: true } };
    }
    return state.sides;
}

/**
 * Pressing play on a finished clock re-rings the bell instead of running:
 * locked → must-stop again; mid-grace → the grace window restarts.
 * (Mirrors the old countdown effects, minus the transient running flicker.)
 */
function startTransition(state, side, events) {
    const s = state.sides[side];
    if (s.phase === PHASE_LOCKED) {
        events.push(soundEvent('mustStop'), overrunEvent(side));
        return state;
    }
    if (s.phase === PHASE_GRACE) {
        events.push(soundEvent('timeUp'));
        return {
            ...state,
            sides: patchSide(state, side, { running: false, graceLeft: state.graceSec }),
            freeAutoSwitch: true,
        };
    }
    return {
        ...state,
        sides: patchSide(state, side, { running: true, blinkOverride: false }),
        freeAutoSwitch: true,
    };
}

export function reducer(state, action) {
    switch (action.type) {
        case 'APPLY_STAGE': {
            const { stageId, mode, durationSec, graceSec } = action;
            return {
                ...state,
                stageId,
                stageMode: mode,
                durationSec,
                graceSec,
                sides: resetSides(durationSec),
                advance: null,
                freeAutoSwitch: false,
                events: [],
            };
        }

        case 'START': {
            const events = [];
            const next = startTransition(state, action.side, events);
            return withEvents(
                next.advance != null ? { ...next, advance: null } : next,
                events,
            );
        }

        case 'STOP': {
            const { side } = action;
            const stopped = patchSide(state, side, { running: false });
            return { ...state, sides: freeHandover({ ...state, sides: stopped }, side), advance: null };
        }

        case 'TOGGLE': {
            const { side } = action;
            const s = state.sides[side];
            if (s.running) {
                return {
                    ...state,
                    sides: patchSide(state, side, { running: false }),
                    advance: null,
                };
            }
            const events = [];
            const next = startTransition(state, side, events);
            return withEvents(
                next.advance != null ? { ...next, advance: null } : next,
                events,
            );
        }

        case 'RESET': {
            const { side } = action;
            return {
                ...state,
                sides: patchSide(state, side, {
                    remaining: state.durationSec,
                    running: false,
                    phase: PHASE_RUNNING,
                    graceLeft: null,
                    blinkOverride: false,
                }),
                advance: null,
                freeAutoSwitch: false,
            };
        }

        case 'TICK':
            return clockTick(state);

        case 'SET_ADVANCE':
            return { ...state, advance: action.value };

        case 'ADVANCE_TICK':
            if (state.advance == null || state.advance <= 0) {
                return state;
            }
            return { ...state, advance: state.advance - 1 };

        case 'ADOPT': {
            const { patch } = action;
            return {
                ...state,
                stageId: patch.stageId,
                stageMode: patch.stageMode,
                durationSec: patch.durationSec ?? state.durationSec,
                graceSec: patch.graceSec ?? state.graceSec,
                sides: patch.sides,
                advance: null,
                events: [],
            };
        }

        case 'SOUND_CHECK': {
            if (action.kind === 'warn30') {
                return withEvents(
                    {
                        ...state,
                        sides: patchSide(state, 'single', {
                            remaining: BLINK_WINDOW_HIGH,
                            running: false,
                            phase: PHASE_RUNNING,
                            graceLeft: null,
                            blinkOverride: true,
                        }),
                    },
                    [soundEvent('warn30')],
                );
            }
            return withEvents(
                {
                    ...state,
                    sides: patchSide(state, 'single', {
                        remaining: 0,
                        running: false,
                        phase: PHASE_LOCKED,
                        graceLeft: null,
                        blinkOverride: false,
                    }),
                },
                [soundEvent('mustStop')],
            );
        }

        // Sound-check reset (Shift+R): zero the clock without locking it.
        case 'PREP_ZERO':
            return {
                ...state,
                sides: patchSide(state, 'single', {
                    remaining: 0,
                    running: false,
                    phase: PHASE_RUNNING,
                    graceLeft: null,
                    blinkOverride: false,
                }),
            };

        case 'STOP_ALL':
            return {
                ...state,
                sides: {
                    single: { ...state.sides.single, running: false },
                    aff: { ...state.sides.aff, running: false },
                    neg: { ...state.sides.neg, running: false },
                },
            };

        case 'CONSUME_EVENTS':
            return state.events.length > 0 ? { ...state, events: [] } : state;

        default:
            return state;
    }
}

// ---------------------------------------------------------------------------
// Selectors (derive, don't store)
// ---------------------------------------------------------------------------

/** 30s warning blink: active while the running clock is within 27–30s. */
export function isBlinking(side) {
    return (
        side.blinkOverride
        || (side.running
            && side.phase === PHASE_RUNNING
            && side.remaining <= BLINK_WINDOW_HIGH
            && side.remaining >= BLINK_WINDOW_LOW)
    );
}

export function isFreeLocked(state) {
    return state.stageMode === 'free'
        && state.sides.aff.phase === PHASE_LOCKED
        && state.sides.neg.phase === PHASE_LOCKED;
}

export function activeSide(state) {
    if (state.stageMode !== 'free') {
        return 'none';
    }
    if (state.sides.aff.running) {
        return 'aff';
    }
    return state.sides.neg.running ? 'neg' : 'none';
}

/** True while any clock or grace countdown can still tick. */
export function hasClockActivity(state) {
    return SIDES.some((key) => {
        const s = state.sides[key];
        return (s.running && s.phase === PHASE_RUNNING && s.remaining > 0)
            || (s.phase === PHASE_GRACE && s.graceLeft != null && s.graceLeft > 0);
    });
}

/** The stage is fully over (auto-advance precondition). */
export function isStageFullyEnded(state) {
    const dual = state.stageMode === 'double' || state.stageMode === 'free';
    if (dual) {
        return state.sides.aff.phase === PHASE_LOCKED && state.sides.neg.phase === PHASE_LOCKED;
    }
    return state.sides.single.phase === PHASE_LOCKED;
}

/** Any side still inside its grace window. */
export function anyInGrace(state) {
    return SIDES.some((key) => state.sides[key].phase === PHASE_GRACE);
}

export function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainderSeconds = seconds % 60;
    return `${minutes < 10 ? '0' : ''}${minutes}:${remainderSeconds < 10 ? '0' : ''}${remainderSeconds}`;
}
