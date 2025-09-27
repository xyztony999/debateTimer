import { db } from './FireBaseConfig';
import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, onSnapshot } from 'firebase/firestore';

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
                return {
                    success: true,
                    data: {
                        debateStages: configData.debateStages,
                        timerSettings: configData.timerSettings,
                        stageOrder: configData.stageOrder
                    }
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
            // Check if default configuration exists
            const defaultConfig = await this.loadConfiguration('默认配置');

            if (!defaultConfig.success) {
                // Load default configurations from JSON files
                const defaultDebateStages = {
                    "测试声音": 31,
                    "正方一辩发言": 210,
                    "反方四辩盘问正方一辩": 90,
                    "反方一辩发言": 210,
                    "正方四辩盘问反方一辩": 90,
                    "正方二辩作驳论": 120,
                    "反方二辩作驳论": 120,
                    "正方二辩对辩反方二辩": 90,
                    "正方三辩盘问": 120,
                    "反方三辩盘问": 120,
                    "正方三辩质询小结": 90,
                    "反方三辩质询小结": 90,
                    "战术暂停": 120,
                    "自由辩论": 240,
                    "反方四辩总结陈词": 210,
                    "正方四辩总结陈词": 210
                };

                const defaultTimerSettings = {
                    "测试声音": "single",
                    "正方一辩发言": "single",
                    "反方四辩盘问正方一辩": "single",
                    "反方一辩发言": "single",
                    "正方四辩盘问反方一辩": "single",
                    "正方二辩作驳论": "single",
                    "反方二辩作驳论": "single",
                    "正方二辩对辩反方二辩": "double",
                    "正方三辩盘问": "single",
                    "反方三辩盘问": "single",
                    "正方三辩质询小结": "single",
                    "反方三辩质询小结": "single",
                    "战术暂停": "single",
                    "自由辩论": "double",
                    "反方四辩总结陈词": "single",
                    "正方四辩总结陈词": "single"
                };

                const defaultStageOrder = [
                    "测试声音",
                    "正方一辩发言",
                    "反方四辩盘问正方一辩",
                    "反方一辩发言",
                    "正方四辩盘问反方一辩",
                    "正方二辩作驳论",
                    "反方二辩作驳论",
                    "正方二辩对辩反方二辩",
                    "正方三辩盘问",
                    "反方三辩盘问",
                    "正方三辩质询小结",
                    "反方三辩质询小结",
                    "战术暂停",
                    "自由辩论",
                    "反方四辩总结陈词",
                    "正方四辩总结陈词"
                ];

                await this.saveConfiguration('默认配置', defaultDebateStages, defaultTimerSettings, defaultStageOrder);
                console.log('Default configuration initialized');
            }
        } catch (error) {
            console.error('Error initializing default configurations:', error);
        }
    }
}

export default new ConfigurationService();