/**
 * @param {import('i18next').TFunction} t
 * @param {string} stageId
 */
export function stageDisplayName(t, stageId) {
    return t(`stages.${stageId}`, { defaultValue: stageId });
}
