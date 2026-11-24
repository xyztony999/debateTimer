import React from 'react';
import { useTranslation } from 'react-i18next';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { formatNoticeDate } from '../../utils/dateTime';

/**
 * The privacy notice as the server sends it: version and effective date,
 * operator, introduction, then every section with its items.
 *
 * Everything is rendered as React text nodes. The notice is never inserted as
 * HTML, so a mistake or an injection in the wording cannot become markup.
 * Shared by the sign-in page dialog and the gate page.
 */
export default function PrivacyNoticeBody({ notice }) {
    const { t } = useTranslation();
    const sections = Array.isArray(notice?.sections) ? notice.sections : [];
    // Still a placeholder until the release date is filled in: not shown.
    const effectiveDate = formatNoticeDate(notice?.effectiveDate, notice?.lng);

    return (
        <Stack spacing={2.5}>
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                {effectiveDate
                    ? t('auth.privacyVersion', { version: notice?.version, date: effectiveDate })
                    : t('auth.privacyVersionOnly', { version: notice?.version })}
            </Typography>
            {notice?.operator?.name ? (
                <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    {t('auth.privacyOperator', { name: notice.operator.name })}
                </Typography>
            ) : null}
            {notice?.intro ? (
                <Typography variant="body2" sx={{ lineHeight: 1.75 }}>
                    {notice.intro}
                </Typography>
            ) : null}
            {sections.map((section) => (
                <Stack key={section.heading} spacing={0.75}>
                    <Typography variant="subtitle2" component="h3" sx={{ fontWeight: 600 }}>
                        {section.heading}
                    </Typography>
                    {section.items.map((item) => (
                        <Typography
                            key={item}
                            variant="body2"
                            component="p"
                            sx={{ lineHeight: 1.75, m: 0 }}
                        >
                            {item}
                        </Typography>
                    ))}
                </Stack>
            ))}
        </Stack>
    );
}
