const CONFIG_FIELDS = [
    'schemaVersion',
    'debateStages',
    'timerSettings',
    'stageOrder',
    'stageLabels',
    'stageGrace',
    'stageAutoAdvance',
    'teamNames',
    'stagePid',
    'pidOptions',
];

// PID presentation (schema v4): icon ids are registry strings on the client;
// the server validates format only ('auto' allowed as the default sentinel).
const PID_ICON_ID_RE = /^[a-z0-9_]{1,32}$/;
const PID_STATION_TYPES = new Set(['auto', 'interchange', 'normal']);
const PID_LINE_COLORS = new Set([
    '#1e3a5f', '#c62828', '#2e7d32', '#ef6c00', '#6a1b9a', '#00695c', '#455a64',
]);

// Accepted timerSettings values; legacy numeric 0/1 map to single/double.
const TIMER_SETTING_VALUES = {
    single: 'single',
    double: 'double',
    free: 'free',
    0: 'single',
    1: 'double',
};

const MAX_GRACE_SECONDS = 300;
const MAX_TEAM_NAME_LENGTH = 20;

export function normalizeTimerSettings(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        const error = new Error('timerSettings must be an object of stage modes');
        error.status = 400;
        throw error;
    }
    const normalized = {};
    for (const [stage, mode] of Object.entries(value)) {
        const mapped = TIMER_SETTING_VALUES[mode];
        if (!mapped) {
            const error = new Error(`Invalid timer mode "${mode}" for stage "${stage}" (expected single/double/free)`);
            error.status = 400;
            throw error;
        }
        normalized[stage] = mapped;
    }
    return normalized;
}

function normalizeStageFlags(value, stages, { kind, validator, message }) {
    if (value === undefined) {
        return {};
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        const error = new Error(`${kind} must be an object keyed by stage`);
        error.status = 400;
        throw error;
    }
    const normalized = {};
    for (const [stage, raw] of Object.entries(value)) {
        if (!Object.prototype.hasOwnProperty.call(stages, stage)) {
            const error = new Error(`${kind} references unknown stage "${stage}"`);
            error.status = 400;
            throw error;
        }
        const parsed = validator(raw);
        if (parsed === null) {
            const error = new Error(`${kind} for stage "${stage}": ${message}`);
            error.status = 400;
            throw error;
        }
        normalized[stage] = parsed;
    }
    return normalized;
}

function normalizeTeamNames(value) {
    if (value === undefined) {
        return undefined;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        const error = new Error('teamNames must be an object with aff/neg names');
        error.status = 400;
        throw error;
    }
    const normalized = {};
    for (const side of ['aff', 'neg']) {
        const raw = value[side];
        if (raw === undefined || raw === null || raw === '') {
            continue;
        }
        if (typeof raw !== 'string' || raw.length > MAX_TEAM_NAME_LENGTH) {
            const error = new Error(`teamNames.${side} must be a string of at most ${MAX_TEAM_NAME_LENGTH} characters`);
            error.status = 400;
            throw error;
        }
        normalized[side] = raw;
    }
    return normalized;
}

function normalizePidOptions(value) {
    if (value === undefined) {
        return undefined;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        const error = new Error('pidOptions must be an object');
        error.status = 400;
        throw error;
    }
    const normalized = {};
    if (value.marker !== undefined && value.marker !== null && value.marker !== '') {
        if (typeof value.marker !== 'string' || !PID_ICON_ID_RE.test(value.marker)) {
            const error = new Error('pidOptions.marker must be an icon id ([a-z0-9_], ≤32)');
            error.status = 400;
            throw error;
        }
        normalized.marker = value.marker;
    }
    if (value.lineColor !== undefined && value.lineColor !== null && value.lineColor !== '') {
        if (typeof value.lineColor !== 'string' || !PID_LINE_COLORS.has(value.lineColor)) {
            const error = new Error('pidOptions.lineColor is not in the palette whitelist');
            error.status = 400;
            throw error;
        }
        normalized.lineColor = value.lineColor;
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function normalizeStagePid(value, stages) {
    if (value === undefined) {
        return {};
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        const error = new Error('stagePid must be an object keyed by stage');
        error.status = 400;
        throw error;
    }
    const normalized = {};
    for (const [stage, raw] of Object.entries(value)) {
        if (!Object.prototype.hasOwnProperty.call(stages, stage)) {
            const error = new Error(`stagePid references unknown stage "${stage}"`);
            error.status = 400;
            throw error;
        }
        if (!raw || typeof raw !== 'object') {
            const error = new Error(`stagePid.${stage} must be an object`);
            error.status = 400;
            throw error;
        }
        const entry = {};
        if (raw.icon !== undefined && raw.icon !== null && raw.icon !== '' && raw.icon !== 'auto') {
            if (typeof raw.icon !== 'string' || !PID_ICON_ID_RE.test(raw.icon)) {
                const error = new Error(`stagePid.${stage}.icon must be an icon id ([a-z0-9_], ≤32)`);
                error.status = 400;
                throw error;
            }
            entry.icon = raw.icon;
        }
        if (raw.station !== undefined && raw.station !== null && raw.station !== '' && raw.station !== 'auto') {
            if (!PID_STATION_TYPES.has(raw.station)) {
                const error = new Error(`stagePid.${stage}.station must be auto/interchange/normal`);
                error.status = 400;
                throw error;
            }
            entry.station = raw.station;
        }
        if (Object.keys(entry).length > 0) {
            normalized[stage] = entry;
        }
    }
    return normalized;
}

export function pickConfigFields(body = {}) {
    const payload = {};
    for (const field of CONFIG_FIELDS) {
        if (body[field] !== undefined) {
            payload[field] = body[field];
        }
    }
    payload.timerSettings = normalizeTimerSettings(payload.timerSettings);
    const stages = payload.debateStages && typeof payload.debateStages === 'object'
        ? payload.debateStages
        : {};
    payload.stageGrace = normalizeStageFlags(payload.stageGrace, stages, {
        kind: 'stageGrace',
        validator: (raw) => {
            const num = Number(raw);
            return Number.isInteger(num) && num >= 0 && num <= MAX_GRACE_SECONDS ? num : null;
        },
        message: `expected integer 0-${MAX_GRACE_SECONDS}`,
    });
    payload.stageAutoAdvance = normalizeStageFlags(payload.stageAutoAdvance, stages, {
        kind: 'stageAutoAdvance',
        validator: (raw) => (raw === true || raw === false ? raw : null),
        message: 'expected boolean',
    });
    payload.stagePid = normalizeStagePid(payload.stagePid, stages);
    const pidOptions = normalizePidOptions(payload.pidOptions);
    if (pidOptions) {
        payload.pidOptions = pidOptions;
    } else {
        delete payload.pidOptions;
    }
    const teamNames = normalizeTeamNames(payload.teamNames);
    if (teamNames) {
        payload.teamNames = teamNames;
    } else {
        delete payload.teamNames;
    }
    payload.stageLabels = payload.stageLabels || {};
    return payload;
}

export function toConfigResponse(doc, { includeShareToken = false } = {}) {
    return {
        name: doc.name,
        schemaVersion: doc.schemaVersion,
        debateStages: doc.debateStages,
        timerSettings: doc.timerSettings,
        stageOrder: doc.stageOrder,
        stageLabels: doc.stageLabels || {},
        stageGrace: doc.stageGrace || {},
        stageAutoAdvance: doc.stageAutoAdvance || {},
        stagePid: doc.stagePid || {},
        ...(doc.pidOptions ? { pidOptions: doc.pidOptions } : {}),
        ...(doc.teamNames ? { teamNames: doc.teamNames } : {}),
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        shareEnabled: Boolean(doc.shareEnabled),
        isPublic: Boolean(doc.isPublic),
        ...(doc.creditName ? { creditName: doc.creditName } : {}),
        ...(includeShareToken && doc.shareEnabled && doc.shareToken
            ? { shareToken: doc.shareToken }
            : {}),
        ownerId: doc.ownerId ? String(doc.ownerId) : undefined,
    };
}

export function toListItem(doc) {
    return {
        name: doc.name,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        shareEnabled: Boolean(doc.shareEnabled),
    };
}

export function toAdminListItem(doc, ownerUsername) {
    return {
        id: String(doc._id),
        name: doc.name,
        ownerId: String(doc.ownerId),
        ownerUsername: ownerUsername || '',
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        shareEnabled: Boolean(doc.shareEnabled),
        shareToken: doc.shareEnabled ? doc.shareToken : null,
        isPublic: Boolean(doc.isPublic),
    };
}

export function toDisplayResponse(doc) {
    return {
        name: doc.name,
        schemaVersion: doc.schemaVersion,
        debateStages: doc.debateStages,
        timerSettings: doc.timerSettings,
        stageOrder: doc.stageOrder,
        stageLabels: doc.stageLabels || {},
        stageGrace: doc.stageGrace || {},
        stageAutoAdvance: doc.stageAutoAdvance || {},
        stagePid: doc.stagePid || {},
        ...(doc.pidOptions ? { pidOptions: doc.pidOptions } : {}),
        ...(doc.teamNames ? { teamNames: doc.teamNames } : {}),
    };
}

export function isShareVisible(doc) {
    return Boolean(doc?.shareEnabled && doc?.shareToken);
}
