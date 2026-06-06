import firestoreConfigurationService from './FirestoreConfigurationService';
import httpConfigurationService from './HttpConfigurationService';

function resolveBackend() {
    const configured = import.meta.env.VITE_CONFIG_BACKEND;
    if (configured === 'firebase') {
        return 'firebase';
    }
    if (configured === 'http') {
        return 'http';
    }
    if (import.meta.env.VITE_API_BASE_URL !== undefined) {
        return 'http';
    }
    return 'firebase';
}

const backend = resolveBackend();
const configurationService = backend === 'http'
    ? httpConfigurationService
    : firestoreConfigurationService;

if (import.meta.env.DEV) {
    console.info(`Configuration backend: ${backend}`);
}

export default configurationService;
