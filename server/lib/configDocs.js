const CONFIG_FIELDS = [
    'schemaVersion',
    'debateStages',
    'timerSettings',
    'stageOrder',
    'stageLabels',
];

export function pickConfigFields(body = {}) {
    const payload = {};
    for (const field of CONFIG_FIELDS) {
        if (body[field] !== undefined) {
            payload[field] = body[field];
        }
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
