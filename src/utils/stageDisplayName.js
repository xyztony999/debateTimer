/** Fallback order when the exact language label is missing for a custom stage. */
const LABEL_FALLBACK = ['en', 'zh-Hans', 'fr-CA'];

/**
 * Resolve the display name for a stage.
 *
 * - Preset stages  → i18n (`stages.<id>`)
 * - Custom stages  → `stageLabels[id][language]` with fallback chain
 *
 * @param {import('i18next').TFunction} t
 * @param {string} stageId
 * @param {Record<string, Record<string, string>>} [stageLabels]
 * @param {string} [language]  current i18n language (e.g. 'en', 'fr-CA', 'zh-Hans')
 */
export function stageDisplayName(t, stageId, stageLabels = {}, language = 'en') {
    if (stageLabels && stageLabels[stageId]) {
        const labels = stageLabels[stageId];
        // Try the current language, then fallback chain, then the stage ID itself
        if (labels[language]) return labels[language];
        for (const lang of LABEL_FALLBACK) {
            if (labels[lang]) return labels[lang];
        }
    }
    // Preset stages resolved via i18n; unknown IDs fall back to the ID string
    return t(`stages.${stageId}`, { defaultValue: stageId });
}
