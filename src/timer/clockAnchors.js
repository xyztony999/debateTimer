import { reducer } from './engine.js';

// Explicit time changes must also reset the millisecond display clock,
// including changes smaller than the drift watcher's 1.5-second tolerance.
export function anchorResetsForAction(state, action) {
    let sides;
    switch (action.type) {
        case 'APPLY_STAGE':
            sides = ['single', 'aff', 'neg'];
            break;
        case 'RESET':
            sides = [action.side];
            break;
        case 'PREP_ZERO':
        case 'SOUND_CHECK':
            sides = ['single'];
            break;
        default:
            return {};
    }
    const next = reducer(state, action);
    return Object.fromEntries(sides.map((side) => [side, next.sides[side].remaining * 1000]));
}
