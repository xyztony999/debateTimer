const CONFIG_FIELDS = [
    'schemaVersion',
    'debateStages',
    'timerSettings',
    'stageOrder',
    'stageLabels',
];

// Accepted timerSettings values; legacy numeric 0/1 map to single/double.
const TIMER_SETTING_VALUES = {
    single: 'single',
    double: 'double',
    free: 'free',
    0: 'single',
    1: 'double',
};

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

export function pickConfigFields(body = {}) {
    const payload = {};
    for (const field of CONFIG_FIELDS) {
        if (body[field] !== undefined) {
            payload[field] = body[field];
        }
    }
    payload.timerSettings = normalizeTimerSettings(payload.timerSettings);
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
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        shareEnabled: Boolean(doc.shareEnabled),
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
    };
}

export function isShareVisible(doc) {
    return Boolean(doc?.shareEnabled && doc?.shareToken);
}
