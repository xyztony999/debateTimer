import debateStagesDefaults from '../resources/debateTimeSettings.json';
import timerSettingsDefaults from '../resources/debateTimerSettings.json';
import { DEFAULT_STAGE_ORDER } from '../config/stageRegistry';
import { migrateStageConfig } from '../utils/migrateStageConfig';
import { DEFAULT_CONFIGURATION_NAME } from '../config/configConstants';

export const SCHEMA_VERSION = 2;

export function buildConfigurationPayload(name, debateStages, timerSettings, stageOrder = null, stageLabels = {}) {
    return {
        schemaVersion: SCHEMA_VERSION,
        name,
        debateStages,
        timerSettings,
        stageOrder: stageOrder || Object.keys(debateStages),
        stageLabels: stageLabels || {},
    };
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
