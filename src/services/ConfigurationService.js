import { db } from './FireBaseConfig';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import debateStagesDefaults from '../resources/debateTimeSettings.json';
import timerSettingsDefaults from '../resources/debateTimerSettings.json';
import { DEFAULT_STAGE_ORDER } from '../config/stageRegistry';
import { migrateStageConfig } from '../utils/migrateStageConfig';
import { DEFAULT_CONFIGURATION_NAME } from '../config/configConstants';

const SCHEMA_VERSION = 2;

class ConfigurationService {
    constructor() {
        this.configurationsCollection = 'configurations';
    }

    /**
     * Save a configuration to Firestore.
     * @param {string} name
     * @param {Object} debateStages   { [stageId]: seconds }
     * @param {Object} timerSettings  { [stageId]: 'single' | 'double' }
     * @param {string[]} [stageOrder]
     * @param {Object} [stageLabels]  { [customStageId]: { 'zh-Hans': '', 'en': '', 'fr-CA': '' } }
     */
    async saveConfiguration(name, debateStages, timerSettings, stageOrder = null, stageLabels = {}) {
        try {
            const configData = {
                schemaVersion: SCHEMA_VERSION,
                name,
                debateStages,
                timerSettings,
                stageOrder: stageOrder || Object.keys(debateStages),
                stageLabels: stageLabels || {},
                updatedAt: Date.now(),
            };

            const configRef = doc(db, this.configurationsCollection, name);
            // Preserve original createdAt if the document already exists
            const existing = await getDoc(configRef);
            if (existing.exists() && existing.data().createdAt) {
                configData.createdAt = existing.data().createdAt;
            } else {
                configData.createdAt = Date.now();
            }

            await setDoc(configRef, configData);
            console.log(`Configuration "${name}" saved (v${SCHEMA_VERSION})`);
            return { success: true, message: `Configuration "${name}" saved successfully` };
        } catch (error) {
            console.error('Error saving configuration:', error);
            return { success: false, message: `Error saving configuration: ${error.message}` };
        }
    }

    /** Load a configuration from Firestore, migrating legacy Chinese keys on the fly. */
    async loadConfiguration(name) {
        try {
            const configRef = doc(db, this.configurationsCollection, name);
            const snapshot = await getDoc(configRef);

            if (snapshot.exists()) {
                const configData = snapshot.data();
                const migrated = migrateStageConfig({
                    debateStages: configData.debateStages || {},
                    timerSettings: configData.timerSettings || {},
                    stageOrder: configData.stageOrder,
                });
                return {
                    success: true,
                    data: {
                        debateStages: migrated.debateStages,
                        timerSettings: migrated.timerSettings,
                        stageOrder: migrated.stageOrder,
                        // stageLabels is already language-key based; pass through as-is
                        stageLabels: configData.stageLabels || {},
                        schemaVersion: configData.schemaVersion || 1,
                    },
                };
            } else {
                return { success: false, message: `Configuration "${name}" not found` };
            }
        } catch (error) {
            console.error('Error loading configuration:', error);
            return { success: false, message: `Error loading configuration: ${error.message}` };
        }
    }

    /** List all available configuration documents. */
    async getConfigurations() {
        try {
            const configurationsRef = collection(db, this.configurationsCollection);
            const snapshot = await getDocs(configurationsRef);

            if (!snapshot.empty) {
                const configList = snapshot.docs.map(d => {
                    const data = d.data();
                    return { name: d.id, createdAt: data.createdAt, updatedAt: data.updatedAt };
                });
                return { success: true, data: configList };
            } else {
                return { success: true, data: [] };
            }
        } catch (error) {
            console.error('Error getting configurations:', error);
            return { success: false, message: `Error getting configurations: ${error.message}` };
        }
    }

    /** Delete a configuration document. */
    async deleteConfiguration(name) {
        try {
            const configRef = doc(db, this.configurationsCollection, name);
            await deleteDoc(configRef);
            console.log(`Configuration "${name}" deleted`);
            return { success: true, message: `Configuration "${name}" deleted successfully` };
        } catch (error) {
            console.error('Error deleting configuration:', error);
            return { success: false, message: `Error deleting configuration: ${error.message}` };
        }
    }

    /** Real-time listener for any configuration changes. */
    onConfigurationsChange(callback) {
        const configurationsRef = collection(db, this.configurationsCollection);
        return onSnapshot(configurationsRef, (snapshot) => {
            if (!snapshot.empty) {
                const configList = snapshot.docs.map(d => {
                    const data = d.data();
                    return { name: d.id, createdAt: data.createdAt, updatedAt: data.updatedAt };
                });
                callback(configList);
            } else {
                callback([]);
            }
        });
    }

    /** Seed the default configuration if it doesn't exist yet. */
    async initializeDefaultConfigurations() {
        try {
            const defaultConfig = await this.loadConfiguration(DEFAULT_CONFIGURATION_NAME);
            if (!defaultConfig.success) {
                await this.saveConfiguration(
                    DEFAULT_CONFIGURATION_NAME,
                    debateStagesDefaults,
                    timerSettingsDefaults,
                    DEFAULT_STAGE_ORDER,
                    {}
                );
                console.log('Default configuration initialized (v2)');
            }
        } catch (error) {
            console.error('Error initializing default configurations:', error);
        }
    }
}

export default new ConfigurationService();
