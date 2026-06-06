/** Maps legacy Chinese JSON keys to stable preset stage IDs. */
const LEGACY_STAGE_KEY_MAP = {
    测试声音: 'sound_check',
    正方一辩发言: 'aff_c1',
    反方四辩盘问正方一辩: 'neg_x_aff_c1',
    反方一辩发言: 'neg_c1',
    正方四辩盘问反方一辩: 'aff_x_neg_c1',
    正方二辩作驳论: 'aff_rebuttal_2',
    反方二辩作驳论: 'neg_rebuttal_2',
    正方二辩对辩反方二辩: 'crossfire_2v2',
    正方三辩盘问: 'aff_poii',
    反方三辩盘问: 'neg_poii',
    正方三辩质询小结: 'aff_poii_sum',
    反方三辩质询小结: 'neg_poii_sum',
    战术暂停: 'tactical_pause',
    自由辩论: 'free_debate',
    反方四辩总结陈词: 'neg_closing',
    正方四辩总结陈词: 'aff_closing',
};

export function migrateStageConfig({ debateStages, timerSettings, stageOrder }) {
    if (!debateStages || typeof debateStages !== 'object') {
        return { debateStages: {}, timerSettings: {}, stageOrder: [], migrated: false };
    }

    const hasLegacyKey = Object.keys(debateStages).some((k) => LEGACY_STAGE_KEY_MAP[k]);
    if (!hasLegacyKey) {
        const order = stageOrder && stageOrder.length > 0 ? [...stageOrder] : Object.keys(debateStages);
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
        newDebateStages[mapKey(key)] = debateStages[key];
    }

    if (timerSettings) {
        for (const key of Object.keys(timerSettings)) {
            newTimerSettings[mapKey(key)] = timerSettings[key];
        }
    }

    const seen = new Set();
    let newOrder = stageOrder && stageOrder.length > 0
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
