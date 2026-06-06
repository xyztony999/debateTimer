/** Maps legacy Chinese JSON keys to stable preset stage IDs. */
export const LEGACY_STAGE_KEY_MAP = {
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

/** Default debate order for preset tournaments (IDs). */
export const DEFAULT_STAGE_ORDER = [
    'sound_check',
    'aff_c1',
    'neg_x_aff_c1',
    'neg_c1',
    'aff_x_neg_c1',
    'aff_rebuttal_2',
    'neg_rebuttal_2',
    'crossfire_2v2',
    'aff_poii',
    'neg_poii',
    'aff_poii_sum',
    'neg_poii_sum',
    'tactical_pause',
    'free_debate',
    'neg_closing',
    'aff_closing',
];

export const PRESET_STAGE_IDS = new Set(DEFAULT_STAGE_ORDER);
