import React from 'react';
import { useTranslation } from 'react-i18next';

/** Short labels so the control stays one compact row in the nav bar. */
const OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'fr-CA', label: 'Français' },
    { value: 'zh-Hans', label: '中文' },
];

function resolveUiLanguage(i18n) {
    const raw = i18n.resolvedLanguage || i18n.language || 'en';
    if (raw.startsWith('zh')) return 'zh-Hans';
    if (raw.startsWith('fr')) return 'fr-CA';
    return 'en';
}

export default function LanguageSwitcher({ className = '' }) {
    const { i18n, t } = useTranslation();

    const rootClass = ['lang-switcher', className].filter(Boolean).join(' ');

    return (
        <div className={rootClass}>
            <span className="lang-switcher-icon" aria-hidden>
                🌐
            </span>
            <span className="sr-only">{t('timer.language')}</span>
            <select
                className="lang-switcher-select"
                value={resolveUiLanguage(i18n)}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                aria-label={t('timer.language')}
                title={t('timer.language')}
            >
                {OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                        {label}
                    </option>
                ))}
            </select>
        </div>
    );
}
