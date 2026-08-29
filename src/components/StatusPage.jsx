import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LanguageSwitcher from './LanguageSwitcher';
import { useAuth } from '../context/AuthContext';
import { useColorMode } from '../context/ColorModeContext';

/**
 * Friendly full-page status for unknown routes and unavailable display links.
 * @param {{ variant?: 'notFound' | 'display' }} props
 */
export default function StatusPage({ variant = 'notFound' }) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { darkMode, toggleDarkMode } = useColorMode();
    const isDisplay = variant === 'display';

    useEffect(() => {
        document.body.classList.add('settings-body');
        return () => {
            document.body.classList.remove('settings-body');
        };
    }, []);

    const title = isDisplay ? t('errors.displayTitle') : t('errors.notFoundTitle');
    const message = isDisplay ? t('errors.displayBody') : t('errors.notFoundBody');
    const homePath = user ? '/' : '/login';
    const homeLabel = user ? t('errors.goHome') : t('errors.goLogin');

    return (
        <Box
            sx={{
                minHeight: '100vh',
                bgcolor: 'background.default',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                p: 2,
            }}
        >
            <Card sx={{ width: '100%', maxWidth: 460 }}>
                <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2.5}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="h5" component="h1">
                                {title}
                            </Typography>
                            <Stack direction="row" spacing={0.5} alignItems="center">
                                <LanguageSwitcher variant="mui" size="small" />
                                <Tooltip title={darkMode ? t('timer.darkLight') : t('timer.darkDark')}>
                                    <IconButton
                                        onClick={toggleDarkMode}
                                        aria-label={darkMode ? t('timer.darkLight') : t('timer.darkDark')}
                                    >
                                        {darkMode ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
                                    </IconButton>
                                </Tooltip>
                            </Stack>
                        </Stack>
                        <Typography variant="body2" color="text.secondary">
                            {message}
                        </Typography>
                        <Button
                            variant="contained"
                            size="large"
                            onClick={() => navigate(homePath)}
                        >
                            {homeLabel}
                        </Button>
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
}
