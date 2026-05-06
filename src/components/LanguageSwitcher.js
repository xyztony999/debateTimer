import React from 'react';
import { useTranslation } from 'react-i18next';

const OPTIONS = [
    { value: 'en', label: 'English' },
    { value: 'fr-CA', label: 'Français (Canada)' },
    { value: 'zh-Hans', label: '简体中文' },
];

function resolveUiLanguage(i18n) {
    const raw = i18n.resolvedLanguage || i18n.language || 'en';
    if (raw.startsWith('zh')) return 'zh-Hans';
    if (raw.startsWith('fr')) return 'fr-CA';
    return 'en';
}

export default function LanguageSwitcher({ className = '' }) {
    const { i18n, t } = useTranslation();

    return (
        <label className={className ? `lang-switcher ${className}` : 'lang-switcher'}>
            <span className="lang-switcher-label">{t('timer.language')}</span>
            <select
                className="lang-switcher-select"
                value={resolveUiLanguage(i18n)}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                aria-label={t('timer.language')}
            >
                {OPTIONS.map(({ value, label }) => (
                    <option key={value} value={value}>
                        {label}
                    </option>
                ))}
            </select>
        </label>
    );
}
