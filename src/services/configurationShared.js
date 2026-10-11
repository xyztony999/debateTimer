import debateStagesDefaults from '../resources/debateTimeSettings.json';
import timerSettingsDefaults from '../resources/debateTimerSettings.json';
import { DEFAULT_STAGE_ORDER } from '../config/stageRegistry';
import { migrateStageConfig } from '../utils/migrateStageConfig';
import { DEFAULT_CONFIGURATION_NAME } from '../config/configConstants';

export const SCHEMA_VERSION = 2;

export function buildConfigurationPayload(name, debateStages, timerSettings, stageOrder = null, stageLabels = {}, extras = {}) {
    const payload = {
        schemaVersion: SCHEMA_VERSION,
        name,
        debateStages,
        timerSettings,
        stageOrder: stageOrder || Object.keys(debateStages),
        stageLabels: stageLabels || {},
    };
    // Optional stage-enhancement fields (schema v3): grace seconds, auto
    // advance flags, team display names. Omitted keys keep server defaults.
    const { stageGrace, stageAutoAdvance, teamNames } = extras;
    if (stageGrace && Object.keys(stageGrace).length > 0) {
        payload.stageGrace = stageGrace;
    }
    if (stageAutoAdvance && Object.keys(stageAutoAdvance).length > 0) {
        payload.stageAutoAdvance = stageAutoAdvance;
    }
    if (teamNames && (teamNames.aff || teamNames.neg)) {
        payload.teamNames = {
            ...(teamNames.aff ? { aff: teamNames.aff } : {}),
            ...(teamNames.neg ? { neg: teamNames.neg } : {}),
        };
    }
    return payload;
}

export function parseLoadedConfiguration(configData) {
    const migrated = migrateStageConfig({
        debateStages: configData.debateStages || {},
        timerSettings: configData.timerSettings || {},
        stageOrder: configData.stageOrder,
    });
    return {
        debateStages: migrated.debateStages,
        timerSettings: migrated.timerSettings,
        stageOrder: migrated.stageOrder,
        stageLabels: configData.stageLabels || {},
        stageGrace: configData.stageGrace || {},
        stageAutoAdvance: configData.stageAutoAdvance || {},
        teamNames: configData.teamNames || {},
        schemaVersion: configData.schemaVersion || 1,
    };
}

export function getDefaultSeedPayload() {
    return buildConfigurationPayload(
        DEFAULT_CONFIGURATION_NAME,
        debateStagesDefaults,
        timerSettingsDefaults,
        DEFAULT_STAGE_ORDER,
        {},
    );
}
