export const STAGE_MODES = new Set(['single', 'double', 'free']);
const MAX_STAGES = 64;
const MAX_RECORD_BYTES = 64 * 1024;

function invalid(message) {
    const error = new Error(message);
    error.status = 400;
    return error;
}

function readInt(value, { min, max, field }) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < min || num > max) {
        throw invalid(`${field} must be an integer ${min}-${max}`);
    }
    return num;
}

function readString(value, { field, max }) {
    if (typeof value !== 'string' || value.length < 1 || value.length > max) {
        throw invalid(`${field} must be a string of 1-${max} characters`);
    }
    return value;
}

function readTimestamp(value, field) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 0) {
        throw invalid(`${field} must be an epoch-ms integer`);
    }
    return num;
}

/**
 * Validates a submitted match record body, derives the server-side summary,
 * and enforces the stage-count / payload limits. Returns the document to
 * insert (append-only; no update path exists by design).
 */
export function buildMatchRecord(body, ownerId) {
    if (!body || typeof body !== 'object') {
        throw invalid('Match record body is required');
    }
    const configName = readString(body.configName, { field: 'configName', max: 100 });
    const startedAt = readTimestamp(body.startedAt, 'startedAt');
    const endedAt = readTimestamp(body.endedAt, 'endedAt');
    if (endedAt < startedAt) {
        throw invalid('endedAt must be >= startedAt');
    }
    const now = Date.now();
    if (endedAt > now + 60_000) {
        throw invalid('endedAt cannot be in the future');
    }

    let teamNames;
    if (body.teamNames !== undefined) {
        if (!body.teamNames || typeof body.teamNames !== 'object' || Array.isArray(body.teamNames)) {
            throw invalid('teamNames must be an object with aff/neg names');
        }
        teamNames = {};
        for (const side of ['aff', 'neg']) {
            const raw = body.teamNames[side];
            if (raw === undefined || raw === null || raw === '') {
                continue;
            }
            if (typeof raw !== 'string' || raw.length > 20) {
                throw invalid(`teamNames.${side} must be a string of at most 20 characters`);
            }
            teamNames[side] = raw;
        }
    }

    if (!Array.isArray(body.stages)) {
        throw invalid('stages must be an array');
    }
    let truncated = false;
    let stages = body.stages;
    if (stages.length > MAX_STAGES) {
        stages = stages.slice(0, MAX_STAGES);
        truncated = true;
    }

    let totalPlannedSeconds = 0;
    let totalActualSeconds = 0;
    let overrunCount = 0;
    const normalizedStages = stages.map((stage, index) => {
        if (!stage || typeof stage !== 'object') {
            throw invalid(`stages[${index}] must be an object`);
        }
        const mode = stage.mode;
        if (!STAGE_MODES.has(mode)) {
            throw invalid(`stages[${index}].mode is invalid`);
        }
        const item = {
            stageId: readString(stage.stageId, { field: `stages[${index}].stageId`, max: 64 }),
            label: readString(stage.label, { field: `stages[${index}].label`, max: 100 }),
            mode,
            plannedSeconds: readInt(stage.plannedSeconds, { min: 1, max: 3600, field: `stages[${index}].plannedSeconds` }),
            graceSeconds: readInt(stage.graceSeconds ?? 0, { min: 0, max: 300, field: `stages[${index}].graceSeconds` }),
            actualAffSeconds: readInt(stage.actualAffSeconds ?? 0, { min: 0, max: 86_400, field: `stages[${index}].actualAffSeconds` }),
            actualNegSeconds: readInt(stage.actualNegSeconds ?? 0, { min: 0, max: 86_400, field: `stages[${index}].actualNegSeconds` }),
            overrunAff: readInt(stage.overrunAff ?? 0, { min: 0, max: 99, field: `stages[${index}].overrunAff` }),
            overrunNeg: readInt(stage.overrunNeg ?? 0, { min: 0, max: 99, field: `stages[${index}].overrunNeg` }),
            enteredAt: readTimestamp(stage.enteredAt, `stages[${index}].enteredAt`),
            exitedAt: stage.exitedAt == null ? null : readTimestamp(stage.exitedAt, `stages[${index}].exitedAt`),
        };
        if (item.exitedAt != null && item.exitedAt < item.enteredAt) {
            throw invalid(`stages[${index}].exitedAt must be >= enteredAt`);
        }
        totalPlannedSeconds += item.plannedSeconds;
        totalActualSeconds += item.actualAffSeconds + item.actualNegSeconds;
        overrunCount += item.overrunAff + item.overrunNeg;
        return item;
    });

    const doc = {
        ownerId,
        configName,
        ...(teamNames ? { teamNames } : {}),
        startedAt,
        endedAt,
        savedAt: now,
        stages: normalizedStages,
        summary: {
            totalPlannedSeconds,
            totalActualSeconds,
            overrunCount,
        },
        ...(truncated ? { truncated: true } : {}),
    };

    if (JSON.stringify(doc).length > MAX_RECORD_BYTES) {
        throw invalid('Match record payload too large (>64KB)');
    }
    return doc;
}

export function toListItem(doc) {
    return {
        id: String(doc._id),
        configName: doc.configName,
        teamNames: doc.teamNames || {},
        startedAt: doc.startedAt,
        endedAt: doc.endedAt,
        savedAt: doc.savedAt,
        stageCount: (doc.stages || []).length,
        overrunCount: doc.summary?.overrunCount ?? 0,
        ...(doc.truncated ? { truncated: true } : {}),
    };
}

export function toDetail(doc) {
    return {
        id: String(doc._id),
        ownerId: String(doc.ownerId),
        configName: doc.configName,
        teamNames: doc.teamNames || {},
        startedAt: doc.startedAt,
        endedAt: doc.endedAt,
        savedAt: doc.savedAt,
        stages: doc.stages || [],
        summary: doc.summary || { totalPlannedSeconds: 0, totalActualSeconds: 0, overrunCount: 0 },
        ...(doc.truncated ? { truncated: true } : {}),
    };
}

export function exportFilename(doc, format) {
    const stamp = new Date(doc.startedAt || doc.savedAt);
    const pad = (n) => String(n).padStart(2, '0');
    const name = `match-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}-${doc.configName}`;
    const safe = name.replace(/[^\w.-]+/g, '_').slice(0, 80);
    return `${safe}.${format}`;
}
