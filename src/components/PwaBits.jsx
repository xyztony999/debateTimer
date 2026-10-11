import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** True while the browser reports no network connection. */
export function useOffline() {
    const [offline, setOffline] = useState(
        typeof navigator !== 'undefined' ? !navigator.onLine : false,
    );
    useEffect(() => {
        const goOffline = () => setOffline(true);
        const goOnline = () => setOffline(false);
        window.addEventListener('offline', goOffline);
        window.addEventListener('online', goOnline);
        return () => {
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('online', goOnline);
        };
    }, []);
    return offline;
}

/** Global thin banner shown while offline: the timer shell keeps working. */
export function OfflineBanner() {
    const { t } = useTranslation();
    const offline = useOffline();
    if (!offline) {
        return null;
    }
    return (
        <div className="offline-banner" role="status">
            {t('pwa.offline')}
        </div>
    );
}

/** Install entry shown when the browser fires beforeinstallprompt. */
export function InstallButton({ className = 'nav-btn' }) {
    const { t } = useTranslation();
    const [prompt, setPrompt] = useState(null);

    useEffect(() => {
        const handler = (event) => {
            event.preventDefault();
            setPrompt(event);
        };
        window.addEventListener('beforeinstallprompt', handler);
        return () => {
            window.removeEventListener('beforeinstallprompt', handler);
        };
    }, []);

    if (!prompt) {
        return null;
    }
    return (
        <button
            type="button"
            className={className}
            onClick={async () => {
                prompt.prompt();
                await prompt.userChoice;
                setPrompt(null);
            }}
            title={t('pwa.installHint')}
        >
            📲 {t('pwa.install')}
        </button>
    );
}
