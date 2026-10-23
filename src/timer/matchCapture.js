/**
 * Match record capture (S-03): stage actuals accumulate locally while the
 * match runs and are POSTed once per save. Pure functions over a capture
 * document shaped { startedAt, entries[] }; the assembling hook owns the
 * current instance in a ref.
 */

/**
 * Actual speaking seconds for one stage entry.
 * `sidesNow` = { aff: { remaining, graceLeft, locked }, neg: {...}|null } —
 * the caller maps the engine's single clock onto `aff` for single-mode
 * stages and passes null for `neg`.
 */
function usedFor(entry, remaining, graceLeft, locked) {
    const graceLeftNow = graceLeft != null ? graceLeft : (locked ? 0 : entry.graceSeconds);
    return Math.max(0, entry.plannedSeconds - remaining) + (entry.graceSeconds - graceLeftNow);
}

export function computeActuals(entry, sidesNow) {
    const aff = sidesNow?.aff ?? { remaining: 0, graceLeft: null, locked: false };
    return {
        actualAffSeconds: usedFor(entry, aff.remaining, aff.graceLeft, aff.locked),
        actualNegSeconds: sidesNow?.neg
            ? usedFor(entry, sidesNow.neg.remaining, sidesNow.neg.graceLeft, sidesNow.neg.locked)
            : 0,
    };
}

export function closeCurrentEntry(entry, sidesNow, closedAt) {
    if (!entry || entry.exitedAt != null) {
        return entry;
    }
    return { ...entry, ...computeActuals(entry, sidesNow), exitedAt: closedAt };
}

/**
 * Close the previous entry (if any) at its actual usage and open a new one.
 * `mode` is the wire string ('single' | 'double' | 'free').
 */
export function beginStageCapture(previous, { stageId, label, mode, plannedSeconds, graceSeconds, now, sidesNow }) {
    const entries = [...(previous?.entries ?? [])];
    if (entries.length > 0) {
        entries[entries.length - 1] = closeCurrentEntry(entries[entries.length - 1], sidesNow, now);
    }
    entries.push({
        stageId,
        label,
        mode,
        plannedSeconds,
        graceSeconds,
        actualAffSeconds: 0,
        actualNegSeconds: 0,
        overrunAff: 0,
        overrunNeg: 0,
        enteredAt: now,
        exitedAt: null,
    });
    return { startedAt: previous?.startedAt ?? now, entries };
}

/** Count an overrun bell for the current stage entry (if it's still open). */
export function bumpOverrun(capture, side, stageId) {
    if (!capture || capture.entries.length === 0) {
        return capture;
    }
    const lastIndex = capture.entries.length - 1;
    const entry = capture.entries[lastIndex];
    if (entry.stageId !== stageId || entry.exitedAt != null) {
        return capture;
    }
    const key = `overrun${side}`;
    const entries = [...capture.entries];
    entries[lastIndex] = { ...entry, [key]: (entry[key] || 0) + 1 };
    return { ...capture, entries };
}

/**
 * Build the POST payload, closing every open entry at its actual usage.
 * Returns null when nothing was captured.
 */
export function buildMatchPayload(capture, { configName, teamNames, now, sidesNow }) {
    if (!capture || capture.entries.length === 0) {
        return null;
    }
    const stages = capture.entries.map((entry) => closeCurrentEntry(entry, sidesNow, now));
    const names = teamNames || {};
    return {
        configName,
        ...(names.aff || names.neg ? { teamNames: { ...names } } : {}),
        startedAt: capture.startedAt,
        endedAt: now,
        stages,
    };
}

// --- Refresh safety net (PRD match-records §10 follow-up) -------------------
// Stage actuals live in a ref; a page refresh used to wipe them. The buffer
// is mirrored into sessionStorage so the timer page can resume capture.

const CAPTURE_STORAGE_KEY = 'timer.matchCapture.v1';

/** Persist the buffer tagged with the owning template (configKey). */
export function persistCapture(capture, configKey) {
    try {
        if (!capture || capture.entries.length === 0) {
            window.sessionStorage.removeItem(CAPTURE_STORAGE_KEY);
            return;
        }
        window.sessionStorage.setItem(CAPTURE_STORAGE_KEY, JSON.stringify({ configKey, capture }));
    } catch {
        // Storage unavailable (private mode / quota): in-memory capture only.
    }
}

/** Returns { configKey, capture } or null (also when storage is unavailable). */
export function restoreCapture() {
    try {
        const raw = window.sessionStorage.getItem(CAPTURE_STORAGE_KEY);
        if (!raw) {
            return null;
        }
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.capture?.entries) || parsed.capture.entries.length === 0) {
            return null;
        }
        return { configKey: parsed.configKey || '', capture: parsed.capture };
    } catch {
        return null;
    }
}

export function clearPersistedCapture() {
    try {
        window.sessionStorage.removeItem(CAPTURE_STORAGE_KEY);
    } catch {
        // Ignore.
    }
}
