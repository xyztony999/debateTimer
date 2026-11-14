import { useEffect, useRef, useState } from 'react';

/**
 * D42 (v1.1): frame-loop readout. The wall-clock anchors are the
 * millisecond truth; this hook reads them on every animation frame (never
 * during render — react-compiler forbids render-phase ref access, so the
 * anchor/side inputs are mirrored into refs inside an effect and the loop
 * writes state) and publishes the rendered side views only when something
 * displayed actually changes. Digit boundaries flip at frame granularity
 * (~16ms) instead of waiting for the next engine tick dispatch.
 *
 * The published map keeps stable references across unchanged ticks, so
 * memoized clocks — and the pages' prebuilt element maps — skip
 * reconciliation entirely until a visible second or phase flips.
 */

const SIDES = ['single', 'aff', 'neg'];

/**
 * The single rendering formula shared by the host console and every
 * follower (FR-C01-01-01, NFR-C01-01): running clocks read `endAt − now`
 * from the anchor, frozen clocks read the frozen value, and the engine's
 * whole-second int is the fallback for sides without an anchor yet.
 */
export function readoutSeconds(anchor, fallbackSec, now) {
    if (!anchor) {
        return fallbackSec;
    }
    const ms = anchor.running ? Math.max(0, anchor.endAt - now) : anchor.frozenMs;
    return Math.max(0, Math.floor(Math.max(0, ms) / 1000));
}

/** Engine side views with the rendering seconds swapped in from the anchors. */
export function computeSideViews(anchors, sides, now = Date.now()) {
    const views = {};
    SIDES.forEach((side) => {
        const base = sides?.[side] ?? {
            remaining: 0, running: false, phase: 'running', graceLeft: null, blinkOverride: false,
        };
        views[side] = { ...base, remaining: readoutSeconds(anchors?.[side], base.remaining, now) };
    });
    return views;
}

/** True when every displayed field of every side matches — publish nothing. */
export function sideViewsEqual(a, b) {
    return SIDES.every((side) => {
        const x = a?.[side];
        const y = b?.[side];
        if (!x || !y) {
            return x === y;
        }
        return x === y || (
            x.remaining === y.remaining
            && x.running === y.running
            && x.phase === y.phase
            && x.graceLeft === y.graceLeft
            && x.blinkOverride === y.blinkOverride
        );
    });
}

export default function useRafReadout(anchors, sides) {
    const [views, setViews] = useState(() => computeSideViews(anchors, sides));
    const anchorsRef = useRef(anchors);
    const sidesRef = useRef(sides);
    useEffect(() => {
        anchorsRef.current = anchors;
        sidesRef.current = sides;
    });

    useEffect(() => {
        const publish = () => {
            setViews((prev) => {
                const next = computeSideViews(anchorsRef.current, sidesRef.current, Date.now());
                // Returning the previous reference bails out of the render
                // entirely — unchanged frames cost nothing.
                return sideViewsEqual(prev, next) ? prev : next;
            });
        };
        if (typeof requestAnimationFrame === 'function') {
            let raf = 0;
            const loop = () => {
                publish();
                raf = requestAnimationFrame(loop);
            };
            raf = requestAnimationFrame(loop);
            return () => cancelAnimationFrame(raf);
        }
        // Environments without rAF (test runners, exotic embeds): a coarse
        // fallback keeps the digits moving; frame alignment degrades gracefully.
        const id = window.setInterval(publish, 250);
        return () => window.clearInterval(id);
    }, []);

    return views;
}
