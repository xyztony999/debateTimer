import React, { useEffect } from 'react';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';
import { useColorMode } from '../context/ColorModeContext';

/**
 * Shared atmosphere + card for login and status pages.
 * Deep navy glows, not the default MUI grey slab.
 */
export default function AuthShell({ children, maxWidth = 440 }) {
    const { t } = useTranslation();
    const { darkMode, toggleDarkMode } = useColorMode();

    useEffect(() => {
        document.body.classList.add('settings-body');
        return () => {
            document.body.classList.remove('settings-body');
        };
    }, []);

    return (
        <Box
            sx={{
                minHeight: '100vh',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                px: { xs: 2, sm: 3 },
                py: { xs: 3, sm: 5 },
                bgcolor: darkMode ? '#0c1218' : '#e8eef4',
                backgroundImage: darkMode
                    ? 'radial-gradient(ellipse 90% 55% at 8% -8%, rgba(66, 165, 245, 0.22), transparent 52%), radial-gradient(ellipse 55% 45% at 108% 108%, rgba(30, 58, 95, 0.7), transparent 48%)'
                    : 'radial-gradient(ellipse 90% 55% at 0% 0%, rgba(30, 58, 95, 0.12), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(74, 111, 165, 0.16), transparent 50%)',
            }}
        >
            <Box
                aria-hidden
                sx={{
                    position: 'absolute',
                    width: { xs: 280, sm: 440 },
                    height: { xs: 280, sm: 440 },
                    borderRadius: '50%',
                    border: '1px solid',
                    borderColor: darkMode ? 'rgba(144, 202, 249, 0.1)' : 'rgba(30, 58, 95, 0.1)',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                }}
            />
            <Box
                aria-hidden
                sx={{
                    position: 'absolute',
                    width: { xs: 380, sm: 620 },
                    height: { xs: 380, sm: 620 },
                    borderRadius: '50%',
                    border: '1px solid',
                    borderColor: darkMode ? 'rgba(144, 202, 249, 0.05)' : 'rgba(30, 58, 95, 0.06)',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'none',
                }}
            />

            <Card
                sx={{
                    position: 'relative',
                    width: '100%',
                    maxWidth,
                    borderRadius: '20px',
                    overflow: 'hidden',
                    border: '1px solid',
                    borderColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(30, 58, 95, 0.08)',
                    boxShadow: darkMode
                        ? '0 24px 56px rgba(0, 0, 0, 0.5)'
                        : '0 24px 56px rgba(30, 58, 95, 0.12)',
                    bgcolor: 'background.paper',
                }}
            >
                <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
                    <Box
                        sx={{
                            mb: 3,
                            width: '100%',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 1,
                        }}
                    >
                        <Typography
                            variant="subtitle2"
                            color="text.secondary"
                            sx={{ fontWeight: 500, letterSpacing: '0.02em' }}
                        >
                            {t('timer.title')}
                        </Typography>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                            <LanguageSwitcher variant="mui" size="small" tone="onPaper" />
                            <Tooltip title={darkMode ? t('timer.darkLight') : t('timer.darkDark')}>
                                <IconButton
                                    onClick={toggleDarkMode}
                                    aria-label={darkMode ? t('timer.darkLight') : t('timer.darkDark')}
                                    size="small"
                                >
                                    {darkMode ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
                                </IconButton>
                            </Tooltip>
                        </Box>
                    </Box>
                    {children}
                </CardContent>
            </Card>
        </Box>
    );
}
