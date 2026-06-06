import { migrateStageConfig } from './migrateStageConfig.js';

const COLLECTION_NAME = 'configurations';

function toMillis(value) {
    if (value == null) {
        return undefined;
    }
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? undefined : parsed;
    }
    if (typeof value === 'object') {
        if (typeof value.toMillis === 'function') {
            return value.toMillis();
        }
        if (typeof value._seconds === 'number') {
            return value._seconds * 1000 + Math.floor((value._nanoseconds || 0) / 1e6);
        }
        if (typeof value.seconds === 'number') {
            return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
        }
    }
    return undefined;
}

function decodeTypedValue(value) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) {
        return value;
    }

    if ('stringValue' in value) return value.stringValue;
    if ('integerValue' in value) return Number(value.integerValue);
    if ('doubleValue' in value) return value.doubleValue;
    if ('booleanValue' in value) return value.booleanValue;
    if ('nullValue' in value) return null;
    if ('timestampValue' in value) return Date.parse(value.timestampValue);
    if ('mapValue' in value) {
        const fields = value.mapValue?.fields || {};
        return decodeTypedMap(fields);
    }
    if ('arrayValue' in value) {
        return (value.arrayValue?.values || []).map(decodeTypedValue);
    }

    return value;
}

function decodeTypedMap(fields) {
    const result = {};
    for (const [key, fieldValue] of Object.entries(fields || {})) {
        result[key] = decodeTypedValue(fieldValue);
    }
    return result;
}

function decodeDocument(doc) {
    if (doc?.fields && typeof doc.fields === 'object') {
        return decodeTypedMap(doc.fields);
    }
    return doc;
}

function extractDocumentName(doc, fallbackIndex = 0) {
    const rawName = doc?._id ?? doc?.id ?? doc?.name ?? doc?.documentId;
    if (typeof rawName === 'string' && rawName.includes('/')) {
        const parts = rawName.split('/');
        return decodeURIComponent(parts[parts.length - 1]);
    }
    if (typeof rawName === 'string' && rawName.length > 0) {
        return rawName;
    }
    return `config_${fallbackIndex + 1}`;
}

function normalizeDocument(name, rawData) {
    const data = decodeDocument(rawData);
    const migrated = migrateStageConfig({
        debateStages: data.debateStages || {},
        timerSettings: data.timerSettings || {},
        stageOrder: data.stageOrder,
    });

    const now = Date.now();
    return {
        _id: name,
        schemaVersion: data.schemaVersion ?? 2,
        name: data.name ?? name,
        debateStages: migrated.debateStages,
        timerSettings: migrated.timerSettings,
        stageOrder: migrated.stageOrder,
        stageLabels: data.stageLabels || {},
        createdAt: toMillis(data.createdAt) ?? now,
        updatedAt: toMillis(data.updatedAt) ?? now,
    };
}

function parseDocumentEntry(name, rawData, index) {
    if (rawData == null || typeof rawData !== 'object' || Array.isArray(rawData)) {
        throw new Error(`Invalid document "${name}" at index ${index}`);
    }
    const docName = typeof name === 'string' && name.length > 0
        ? name
        : extractDocumentName(rawData, index);
    return normalizeDocument(docName, rawData);
}

export function parseConfigExport(raw) {
    if (Array.isArray(raw)) {
        return raw.map((item, index) => parseDocumentEntry(extractDocumentName(item, index), item, index));
    }

    if (raw && typeof raw === 'object') {
        if (Array.isArray(raw[COLLECTION_NAME])) {
            return raw[COLLECTION_NAME].map((item, index) => (
                parseDocumentEntry(extractDocumentName(item, index), item, index)
            ));
        }

        if (raw[COLLECTION_NAME] && typeof raw[COLLECTION_NAME] === 'object') {
            return Object.entries(raw[COLLECTION_NAME]).map(([name, data], index) => (
                parseDocumentEntry(name, data, index)
            ));
        }

        const entries = Object.entries(raw);
        const looksLikeDocumentMap = entries.every(([, value]) => (
            value && typeof value === 'object' && (
                value.debateStages
                || value.timerSettings
                || value.stageOrder
                || value.fields
            )
        ));

        if (looksLikeDocumentMap) {
            return entries.map(([name, data], index) => parseDocumentEntry(name, data, index));
        }
    }

    throw new Error('Unsupported configuration export format');
}

export function parseConfigExportFile(content) {
    const trimmed = content.trim();
    if (!trimmed) {
        return [];
    }

    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        return parseConfigExport(JSON.parse(trimmed));
    }

    const docs = [];
    const lines = trimmed.split(/\r?\n/).filter(Boolean);
    lines.forEach((line, index) => {
        const parsed = JSON.parse(line);
        if (parsed?.name && parsed?.fields) {
            docs.push(parseDocumentEntry(extractDocumentName(parsed, index), parsed, index));
            return;
        }
        if (parsed?._id || parsed?.debateStages || parsed?.timerSettings) {
            docs.push(parseDocumentEntry(extractDocumentName(parsed, index), parsed, index));
            return;
        }
        docs.push(...parseConfigExport(parsed));
    });
    return docs;
}
