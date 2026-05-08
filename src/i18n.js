import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import frCA from './locales/fr-CA.json';
import zhHans from './locales/zh-Hans.json';

const STORAGE_KEY = 'debateTimerLang';

function setDocumentLang(lng) {
    if (typeof document !== 'undefined') {
        document.documentElement.lang = lng;
    }
}

i18n.use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            'fr-CA': { translation: frCA },
            'zh-Hans': { translation: zhHans },
        },
        fallbackLng: 'en',
        supportedLngs: ['en', 'fr-CA', 'zh-Hans'],
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator'],
            caches: ['localStorage'],
            lookupLocalStorage: STORAGE_KEY,
        },
    })
    .then(() => {
        setDocumentLang(i18n.language);
    });

i18n.on('languageChanged', (lng) => {
    setDocumentLang(lng);
});

export default i18n;
export { STORAGE_KEY };
