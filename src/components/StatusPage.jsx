import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import AuthShell from './AuthShell';
import { useAuth } from '../context/AuthContext';

/**
 * Friendly full-page status for unknown routes and unavailable display links.
 * @param {{ variant?: 'notFound' | 'display' }} props
 */
export default function StatusPage({ variant = 'notFound' }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const isDisplay = variant === 'display';
    const Icon = isDisplay ? LinkOffIcon : SearchOffIcon;
    const title = isDisplay ? t('errors.displayTitle') : t('errors.notFoundTitle');
    const message = isDisplay ? t('errors.displayBody') : t('errors.notFoundBody');
    const homePath = user ? '/' : '/login';
    const homeLabel = user ? t('errors.goHome') : t('errors.goLogin');

    return (
        <AuthShell maxWidth={460}>
            <Stack
                spacing={2.75}
                sx={{
                    textAlign: 'center',
                    width: '100%',
                    alignItems: 'center',
                }}
            >
                <Box
                    aria-hidden
                    sx={{
                        width: 88,
                        height: 88,
                        mx: 'auto',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 0,
                        flexShrink: 0,
                        bgcolor: (theme) => theme.palette.mode === 'dark'
                            ? 'rgba(144, 202, 249, 0.1)'
                            : 'rgba(30, 58, 95, 0.08)',
                        border: '1px solid',
                        borderColor: (theme) => theme.palette.mode === 'dark'
                            ? 'rgba(144, 202, 249, 0.22)'
                            : 'rgba(30, 58, 95, 0.16)',
                    }}
                >
                    <Icon
                        sx={{
                            fontSize: 36,
                            color: 'primary.main',
                            display: 'block',
                        }}
                    />
                </Box>
                <Stack
                    spacing={1}
                    sx={{
                        width: '100%',
                        alignItems: 'center',
                    }}
                >
                    <Typography
                        component="p"
                        color="primary"
                        sx={{
                            m: 0,
                            fontSize: isDisplay
                                ? { xs: '1.2rem', sm: '1.45rem' }
                                : { xs: '1.75rem', sm: '2.15rem' },
                            fontWeight: 800,
                            letterSpacing: isDisplay ? '0.12em' : '0.08em',
                            lineHeight: 1.2,
                            textTransform: 'uppercase',
                            // letter-spacing adds extra space after the last character
                            marginRight: isDisplay ? '-0.12em' : '-0.08em',
                        }}
                    >
                        {isDisplay ? t('errors.displayEyebrow') : t('errors.notFoundEyebrow')}
                    </Typography>
                    <Typography variant="h4" component="h1" sx={{ fontWeight: 600 }}>
                        {title}
                    </Typography>
                    <Typography
                        variant="body1"
                        color="text.secondary"
                        sx={{ lineHeight: 1.65, maxWidth: 360, mx: 'auto' }}
                    >
                        {message}
                    </Typography>
                </Stack>
                <Button
                    variant="contained"
                    size="large"
                    fullWidth
                    onClick={() => navigate(homePath)}
                    sx={{ mt: 0.5, py: 1.25 }}
                >
                    {homeLabel}
                </Button>
            </Stack>
        </AuthShell>
    );
}
