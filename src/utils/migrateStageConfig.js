import { LEGACY_STAGE_KEY_MAP } from '../config/stageRegistry';

/**
 * Remaps legacy Chinese stage keys to stable IDs. Custom user-defined labels are unchanged.
 * @returns {{ debateStages: object, timerSettings: object, stageOrder: string[], migrated: boolean }}
 */
export function migrateStageConfig({ debateStages, timerSettings, stageOrder }) {
    if (!debateStages || typeof debateStages !== 'object') {
        return { debateStages: {}, timerSettings: {}, stageOrder: [], migrated: false };
    }

    const hasLegacyKey = Object.keys(debateStages).some((k) => LEGACY_STAGE_KEY_MAP[k]);
    if (!hasLegacyKey) {
        const order =
            stageOrder && stageOrder.length > 0 ? [...stageOrder] : Object.keys(debateStages);
        return {
            debateStages: { ...debateStages },
            timerSettings: timerSettings ? { ...timerSettings } : {},
            stageOrder: order,
            migrated: false,
        };
    }

    const mapKey = (k) => LEGACY_STAGE_KEY_MAP[k] || k;
    const newDebateStages = {};
    const newTimerSettings = {};

    for (const key of Object.keys(debateStages)) {
        const nk = mapKey(key);
        newDebateStages[nk] = debateStages[key];
    }

    if (timerSettings) {
        for (const key of Object.keys(timerSettings)) {
            const nk = mapKey(key);
            newTimerSettings[nk] = timerSettings[key];
        }
    }

    const seen = new Set();
    let newOrder =
        stageOrder && stageOrder.length > 0
            ? stageOrder.map(mapKey).filter((k) => {
                  if (!newDebateStages[k] || seen.has(k)) return false;
                  seen.add(k);
                  return true;
              })
            : [];

    for (const k of Object.keys(newDebateStages)) {
        if (!seen.has(k)) {
            newOrder.push(k);
            seen.add(k);
        }
    }

    return {
        debateStages: newDebateStages,
        timerSettings: newTimerSettings,
        stageOrder: newOrder,
        migrated: true,
    };
}
