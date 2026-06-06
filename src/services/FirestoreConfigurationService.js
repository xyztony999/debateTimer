import { db } from './FireBaseConfig';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';
import {
    SCHEMA_VERSION,
    buildConfigurationPayload,
    parseLoadedConfiguration,
    getDefaultSeedPayload,
} from './configurationShared';
import { DEFAULT_CONFIGURATION_NAME } from '../config/configConstants';

class FirestoreConfigurationService {
    constructor() {
        this.configurationsCollection = 'configurations';
    }

    async saveConfiguration(name, debateStages, timerSettings, stageOrder = null, stageLabels = {}) {
        try {
            const configData = {
                ...buildConfigurationPayload(name, debateStages, timerSettings, stageOrder, stageLabels),
                updatedAt: Date.now(),
            };

            const configRef = doc(db, this.configurationsCollection, name);
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

    async loadConfiguration(name) {
        try {
            const configRef = doc(db, this.configurationsCollection, name);
            const snapshot = await getDoc(configRef);

            if (snapshot.exists()) {
                return {
                    success: true,
                    data: parseLoadedConfiguration(snapshot.data()),
                };
            }
            return { success: false, message: `Configuration "${name}" not found` };
        } catch (error) {
            console.error('Error loading configuration:', error);
            return { success: false, message: `Error loading configuration: ${error.message}` };
        }
    }

    async getConfigurations() {
        try {
            const configurationsRef = collection(db, this.configurationsCollection);
            const snapshot = await getDocs(configurationsRef);

            if (!snapshot.empty) {
                const configList = snapshot.docs.map((d) => {
                    const data = d.data();
                    return { name: d.id, createdAt: data.createdAt, updatedAt: data.updatedAt };
                });
                return { success: true, data: configList };
            }
            return { success: true, data: [] };
        } catch (error) {
            console.error('Error getting configurations:', error);
            return { success: false, message: `Error getting configurations: ${error.message}` };
        }
    }

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

    onConfigurationsChange(callback) {
        const configurationsRef = collection(db, this.configurationsCollection);
        return onSnapshot(configurationsRef, (snapshot) => {
            if (!snapshot.empty) {
                const configList = snapshot.docs.map((d) => {
                    const data = d.data();
                    return { name: d.id, createdAt: data.createdAt, updatedAt: data.updatedAt };
                });
                callback(configList);
            } else {
                callback([]);
            }
        });
    }

    async initializeDefaultConfigurations() {
        try {
            const defaultConfig = await this.loadConfiguration(DEFAULT_CONFIGURATION_NAME);
            if (!defaultConfig.success) {
                const seed = getDefaultSeedPayload();
                await this.saveConfiguration(
                    seed.name,
                    seed.debateStages,
                    seed.timerSettings,
                    seed.stageOrder,
                    seed.stageLabels,
                );
                console.log('Default configuration initialized (v2)');
            }
        } catch (error) {
            console.error('Error initializing default configurations:', error);
        }
    }
}

export default new FirestoreConfigurationService();
