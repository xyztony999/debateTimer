import React from 'react';
import { useTranslation } from 'react-i18next';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';

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

export default function LanguageSwitcher({
    className = '',
    variant = 'default',
    size = 'small',
    tone = 'onDark',
}) {
    const { i18n, t } = useTranslation();
    const value = resolveUiLanguage(i18n);

    if (variant === 'mui') {
        const onPaper = tone === 'onPaper';
        return (
            <Select
                className={className}
                size={size}
                value={value}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                aria-label={t('timer.language')}
                sx={{
                    minWidth: 110,
                    color: onPaper ? 'text.primary' : 'inherit',
                    '.MuiOutlinedInput-notchedOutline': {
                        borderColor: (theme) => {
                            if (onPaper) {
                                return theme.palette.mode === 'dark'
                                    ? 'rgba(255,255,255,0.22)'
                                    : 'rgba(30, 58, 95, 0.22)';
                            }
                            return theme.palette.mode === 'dark'
                                ? 'rgba(255,255,255,0.28)'
                                : 'rgba(255,255,255,0.4)';
                        },
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: (theme) => {
                            if (onPaper) {
                                return theme.palette.mode === 'dark'
                                    ? 'rgba(255,255,255,0.45)'
                                    : 'rgba(30, 58, 95, 0.4)';
                            }
                            return theme.palette.mode === 'dark'
                                ? 'rgba(255,255,255,0.55)'
                                : 'rgba(255,255,255,0.7)';
                        },
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: onPaper ? 'primary.main' : 'inherit',
                    },
                    '.MuiSvgIcon-root': { color: onPaper ? 'text.secondary' : 'inherit' },
                    '.MuiSelect-select': { py: 1 },
                }}
            >
                {OPTIONS.map(({ value: opt, label }) => (
                    <MenuItem key={opt} value={opt}>{label}</MenuItem>
                ))}
            </Select>
        );
    }

    const rootClass = ['lang-switcher', className].filter(Boolean).join(' ');

    return (
        <div className={rootClass}>
            <span className="lang-switcher-icon" aria-hidden>
                🌐
            </span>
            <span className="sr-only">{t('timer.language')}</span>
            <select
                className="lang-switcher-select"
                value={value}
                onChange={(e) => i18n.changeLanguage(e.target.value)}
                aria-label={t('timer.language')}
                title={t('timer.language')}
            >
                {OPTIONS.map(({ value: opt, label }) => (
                    <option key={opt} value={opt}>
                        {label}
                    </option>
                ))}
            </select>
        </div>
    );
}
