import { useEffect } from 'react';

function isTypingTarget(target) {
    if (!target || !(target instanceof Element)) {
        return false;
    }
    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

/**
 * Timer keyboard map (operator + standalone display):
 *   dual modes — A/L toggle sides, Shift+Q/O reset sides
 *   single     — Space toggles, Shift+R resets (sound_check: zeroes)
 *   always     — ←/→ switch stages
 * Any manual keypress cancels a pending auto advance. Bound only while
 * `enabled` (false while a control session drives this screen — BR-5).
 */
export default function useTimerKeyboardShortcuts({ enabled, isDual, handlers }) {
    const {
        onAnyInput,
        onPrevStage,
        onNextStage,
        toggleAff,
        resetAff,
        toggleNeg,
        resetNeg,
        toggleSingle,
        resetSingle,
        prepZeroSingle,
    } = handlers;

    useEffect(() => {
        if (!enabled) {
            return undefined;
        }

        const handleKeyPress = (event) => {
            if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) {
                return;
            }

            // Any manual input cancels a pending auto advance.
            onAnyInput();

            const key = event.key;
            const withShift = event.shiftKey;

            if (!withShift && key === 'ArrowLeft') {
                event.preventDefault();
                onPrevStage();
                return;
            }
            if (!withShift && key === 'ArrowRight') {
                event.preventDefault();
                onNextStage();
                return;
            }

            if (isDual) {
                if (!withShift && (key === 'a' || key === 'A')) {
                    event.preventDefault();
                    toggleAff();
                } else if (withShift && (key === 'q' || key === 'Q')) {
                    event.preventDefault();
                    resetAff();
                } else if (!withShift && (key === 'l' || key === 'L')) {
                    event.preventDefault();
                    toggleNeg();
                } else if (withShift && (key === 'o' || key === 'O')) {
                    event.preventDefault();
                    resetNeg();
                }
                return;
            }

            if (!withShift && (key === ' ' || key === 'Spacebar')) {
                event.preventDefault();
                toggleSingle();
            } else if (withShift && (key === 'r' || key === 'R')) {
                event.preventDefault();
                resetSingle();
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => {
            window.removeEventListener('keydown', handleKeyPress);
        };
    }, [
        enabled,
        isDual,
        onAnyInput,
        onPrevStage,
        onNextStage,
        toggleAff,
        resetAff,
        toggleNeg,
        resetNeg,
        toggleSingle,
        resetSingle,
    ]);
}
