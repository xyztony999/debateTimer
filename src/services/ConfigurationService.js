import { db } from './FireBaseConfig';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import debateStagesDefaults from '../resources/debateTimeSettings.json';
import timerSettingsDefaults from '../resources/debateTimerSettings.json';
import { DEFAULT_STAGE_ORDER } from '../config/stageRegistry';
import { migrateStageConfig } from '../utils/migrateStageConfig';
import { DEFAULT_CONFIGURATION_NAME } from '../config/configConstants';

class ConfigurationService {
    constructor() {
        this.configurationsCollection = 'configurations';
    }

    // Save a configuration to Firestore
    async saveConfiguration(name, debateStages, timerSettings, stageOrder = null) {
        try {
            const configData = {
                name,
                debateStages,
                timerSettings,
                stageOrder: stageOrder || Object.keys(debateStages),
                createdAt: Date.now(),
                updatedAt: Date.now()
            };

            // Use the configuration name as the document ID
            const configRef = doc(db, this.configurationsCollection, name);
            await setDoc(configRef, configData);

            console.log(`Configuration "${name}" saved successfully`);
            return { success: true, message: `Configuration "${name}" saved successfully` };
        } catch (error) {
            console.error('Error saving configuration:', error);
            return { success: false, message: `Error saving configuration: ${error.message}` };
        }
    }

    // Load a specific configuration from Firestore
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

    // Get all available configurations
    async getConfigurations() {
        try {
            const configurationsRef = collection(db, this.configurationsCollection);
            const snapshot = await getDocs(configurationsRef);

            if (!snapshot.empty) {
                const configList = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        name: doc.id,
                        createdAt: data.createdAt,
                        updatedAt: data.updatedAt
                    };
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

    // Delete a configuration
    async deleteConfiguration(name) {
        try {
            const configRef = doc(db, this.configurationsCollection, name);
            await deleteDoc(configRef);

            console.log(`Configuration "${name}" deleted successfully`);
            return { success: true, message: `Configuration "${name}" deleted successfully` };
        } catch (error) {
            console.error('Error deleting configuration:', error);
            return { success: false, message: `Error deleting configuration: ${error.message}` };
        }
    }

    // Listen for real-time updates to configurations
    onConfigurationsChange(callback) {
        const configurationsRef = collection(db, this.configurationsCollection);
        return onSnapshot(configurationsRef, (snapshot) => {
            if (!snapshot.empty) {
                const configList = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        name: doc.id,
                        createdAt: data.createdAt,
                        updatedAt: data.updatedAt
                    };
                });
                callback(configList);
            } else {
                callback([]);
            }
        });
    }

    // Save default configurations if they don't exist
    async initializeDefaultConfigurations() {
        try {
            const defaultConfig = await this.loadConfiguration(DEFAULT_CONFIGURATION_NAME);

            if (!defaultConfig.success) {
                await this.saveConfiguration(
                    DEFAULT_CONFIGURATION_NAME,
                    debateStagesDefaults,
                    timerSettingsDefaults,
                    DEFAULT_STAGE_ORDER
                );
                console.log('Default configuration initialized');
            }
        } catch (error) {
            console.error('Error initializing default configurations:', error);
        }
    }
}

export default new ConfigurationService();