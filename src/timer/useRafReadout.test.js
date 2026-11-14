/**
 * D42 (v1.1): RAF readout pipeline — pure-layer tests. The hook itself is
 * a thin executor (bun test has no DOM, so no renderHook); the semantics
 * that matter live in these functions:
 *
 * - one rendering formula for host and followers (running reads endAt−now,
 *   frozen reads the frozen value, engine ints are the per-side fallback);
 * - frame-granular flips: crossing a second boundary between two reads
 *   changes exactly that side's digit;
 * - reference stability: unchanged views compare equal so the state write
 *   bails out and nothing re-renders.
 */
import { computeSideViews, readoutSeconds, sideViewsEqual } from './useRafReadout.js';

const SIDES_NOW = {
    single: { remaining: 90, running: false, phase: 'running', graceLeft: null, blinkOverride: false },
    aff: { remaining: 60, running: true, phase: 'running', graceLeft: null, blinkOverride: false },
    neg: { remaining: 30, running: false, phase: 'running', graceLeft: null, blinkOverride: false },
};

const ANCHORS = {
    aff: { running: true, endAt: 1_000_000 + 60_400, frozenMs: 0 },
    neg: { running: false, endAt: 0, frozenMs: 28_900 },
    // single has no anchor → engine fallback
};

test('readoutSeconds reads running anchors as endAt − now', () => {
    expect(readoutSeconds(ANCHORS.aff, 0, 1_000_000)).toBe(60);
});

test('readoutSeconds floors frozen anchors and never goes negative', () => {
    expect(readoutSeconds(ANCHORS.neg, 0, 1_000_000)).toBe(28);
    expect(readoutSeconds({ running: true, endAt: 1_000_000 - 300, frozenMs: 0 }, 0, 1_000_000)).toBe(0);
});

test('readoutSeconds falls back to the engine int for anchor-less sides', () => {
    expect(readoutSeconds(null, 90, 1_000_000)).toBe(90);
    expect(readoutSeconds(undefined, 90, 1_000_000)).toBe(90);
});

test('computeSideViews merges anchor seconds into the engine side views', () => {
    const views = computeSideViews(ANCHORS, SIDES_NOW, 1_000_000);
    expect(views.aff).toEqual({ ...SIDES_NOW.aff, remaining: 60 });
    expect(views.neg).toEqual({ ...SIDES_NOW.neg, remaining: 28 });
    expect(views.single).toEqual(SIDES_NOW.single); // engine fallback, identical view
});

test('crossing a second boundary flips exactly that side', () => {
    const before = computeSideViews(ANCHORS, SIDES_NOW, 1_000_000);
    const after = computeSideViews(ANCHORS, SIDES_NOW, 1_000_401);
    expect(after.aff.remaining).toBe(59);
    expect(after.neg).toEqual(before.neg); // frozen — same view
    expect(after.single).toEqual(before.single);
    expect(sideViewsEqual(before, after)).toBe(false);
});

test('sideViewsEqual keeps stable references publishable (no-op frames)', () => {
    const a = computeSideViews(ANCHORS, SIDES_NOW, 1_000_000);
    const b = computeSideViews(ANCHORS, SIDES_NOW, 1_000_100);
    expect(sideViewsEqual(a, b)).toBe(true);
    // 100ms later the running side is still inside the same second — the
    // hook returns the previous reference and React skips the re-render.
});

test('a phase flip is a visible change even at the same second', () => {
    const a = computeSideViews(ANCHORS, SIDES_NOW, 1_000_000);
    const lockedSides = { ...SIDES_NOW, neg: { ...SIDES_NOW.neg, phase: 'locked' } };
    const b = computeSideViews(ANCHORS, lockedSides, 1_000_000);
    expect(sideViewsEqual(a, b)).toBe(false);
});

test('missing sides compare unequal (never publish a partial book)', () => {
    const a = computeSideViews(ANCHORS, SIDES_NOW, 1_000_000);
    expect(sideViewsEqual(a, undefined)).toBe(false);
    expect(sideViewsEqual(a, { ...a, aff: undefined })).toBe(false);
});
