/** Primary debate configuration ID (unchanged for backward compatibility). */
export const DEFAULT_CONFIGURATION_NAME = '默认配置';

/** localStorage key for the last selected configuration template. */
export const SELECTED_CONFIGURATION_KEY = 'selectedConfigurationName';

export function getStoredConfigurationName() {
    try {
        const stored = localStorage.getItem(SELECTED_CONFIGURATION_KEY);
        return stored?.trim() || DEFAULT_CONFIGURATION_NAME;
    } catch {
        return DEFAULT_CONFIGURATION_NAME;
    }
}

export function setStoredConfigurationName(name) {
    try {
        localStorage.setItem(SELECTED_CONFIGURATION_KEY, name);
    } catch {
        // Ignore quota / private-mode failures.
    }
}
