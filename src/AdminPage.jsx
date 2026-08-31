import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Alert from '@mui/material/Alert';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import Container from '@mui/material/Container';
import FormControl from '@mui/material/FormControl';
import IconButton from '@mui/material/IconButton';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LanguageSwitcher from './components/LanguageSwitcher';
import { useAuth } from './context/AuthContext';
import { useColorMode } from './context/ColorModeContext';
import { useFeedback } from './context/FeedbackContext';
import {
    createUser,
    deleteConfigurationById,
    deleteUser,
    listAllConfigurations,
    listUsers,
    updateUser,
} from './services/adminService';

export default function AdminPage() {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { user, logout } = useAuth();
    const { darkMode, toggleDarkMode } = useColorMode();
    const { confirm } = useFeedback();

    const [users, setUsers] = useState([]);
    const [configs, setConfigs] = useState([]);
    const [error, setError] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [newRole, setNewRole] = useState('user');

    const refresh = useCallback(async () => {
        const [usersResult, configsResult] = await Promise.all([
            listUsers(),
            listAllConfigurations(),
        ]);
        if (!usersResult.success) {
            setError(usersResult.message);
            return;
        }
        if (!configsResult.success) {
            setError(configsResult.message);
            return;
        }
        setError('');
        setUsers(usersResult.data);
        setConfigs(configsResult.data);
    }, []);

    useEffect(() => {
        document.body.classList.add('settings-body');
        refresh();
        return () => {
            document.body.classList.remove('settings-body');
        };
    }, [refresh]);

    const handleCreate = async (event) => {
        event.preventDefault();
        const result = await createUser({
            username: newUsername.trim(),
            password: newPassword,
            role: newRole,
        });
        if (!result.success) {
            setError(result.message);
            return;
        }
        setNewUsername('');
        setNewPassword('');
        setNewRole('user');
        await refresh();
    };

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', pb: 6 }}>
            <AppBar
                position="sticky"
                elevation={0}
                color={darkMode ? 'default' : 'primary'}
                sx={{
                    borderBottom: 1,
                    borderColor: 'divider',
                    ...(darkMode
                        ? { bgcolor: 'background.paper', color: 'text.primary', backgroundImage: 'none' }
                        : {}),
                }}
            >
                <Toolbar sx={{ gap: 1, flexWrap: 'wrap' }}>
                    <Tooltip title={t('settings.backToTimer')}>
                        <IconButton color="inherit" onClick={() => navigate('/')} aria-label={t('settings.backToTimer')}>
                            <ArrowBackIcon />
                        </IconButton>
                    </Tooltip>
                    <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 500 }}>
                        {t('admin.title')}
                    </Typography>
                    <LanguageSwitcher variant="mui" size="small" />
                    <Tooltip title={darkMode ? t('timer.darkLight') : t('timer.darkDark')}>
                        <IconButton color="inherit" onClick={toggleDarkMode}>
                            {darkMode ? <LightModeOutlinedIcon /> : <DarkModeOutlinedIcon />}
                        </IconButton>
                    </Tooltip>
                    <Button color="inherit" onClick={async () => { await logout(); navigate('/login'); }}>
                        {t('auth.logout')}
                    </Button>
                </Toolbar>
            </AppBar>

            <Container maxWidth="lg" sx={{ pt: 3 }}>
                <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
                    {t('admin.subtitle')}
                </Typography>
                {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}

                <Stack spacing={3}>
                    <Card>
                        <CardHeader title={t('admin.usersTitle')} subheader={t('admin.usersDesc')} />
                        <CardContent>
                            <Stack
                                component="form"
                                onSubmit={handleCreate}
                                direction={{ xs: 'column', md: 'row' }}
                                spacing={2}
                                sx={{ mb: 3 }}
                            >
                                <TextField
                                    size="small"
                                    required
                                    label={t('auth.username')}
                                    value={newUsername}
                                    onChange={(e) => setNewUsername(e.target.value)}
                                />
                                <TextField
                                    size="small"
                                    required
                                    type="password"
                                    label={t('auth.password')}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                />
                                <FormControl size="small" sx={{ minWidth: 140 }}>
                                    <InputLabel id="new-role-label">{t('admin.role')}</InputLabel>
                                    <Select
                                        labelId="new-role-label"
                                        label={t('admin.role')}
                                        value={newRole}
                                        onChange={(e) => setNewRole(e.target.value)}
                                    >
                                        <MenuItem value="user">{t('admin.roleUser')}</MenuItem>
                                        <MenuItem value="admin">{t('admin.roleAdmin')}</MenuItem>
                                    </Select>
                                </FormControl>
                                <Button type="submit" variant="contained">{t('admin.createUser')}</Button>
                            </Stack>

                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('auth.username')}</TableCell>
                                        <TableCell>{t('admin.role')}</TableCell>
                                        <TableCell>{t('admin.status')}</TableCell>
                                        <TableCell align="right">{t('admin.actions')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {users.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell>{row.username}</TableCell>
                                            <TableCell>
                                                <Chip size="small" label={row.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')} />
                                            </TableCell>
                                            <TableCell>
                                                {row.disabled ? t('admin.disabled') : t('admin.active')}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                    <Button
                                                        size="small"
                                                        disabled={row.id === user?.id}
                                                        onClick={async () => {
                                                            const result = await updateUser(row.id, { disabled: !row.disabled });
                                                            if (!result.success) setError(result.message);
                                                            else await refresh();
                                                        }}
                                                    >
                                                        {row.disabled ? t('admin.enable') : t('admin.disable')}
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        disabled={row.id === user?.id && row.role === 'admin'}
                                                        onClick={async () => {
                                                            const result = await updateUser(row.id, {
                                                                role: row.role === 'admin' ? 'user' : 'admin',
                                                            });
                                                            if (!result.success) setError(result.message);
                                                            else await refresh();
                                                        }}
                                                    >
                                                        {row.role === 'admin' ? t('admin.makeUser') : t('admin.makeAdmin')}
                                                    </Button>
                                                    <Button
                                                        size="small"
                                                        color="error"
                                                        disabled={row.id === user?.id}
                                                        onClick={async () => {
                                                            const accepted = await confirm({
                                                                title: t('settings.confirmTitle'),
                                                                message: t('admin.confirmDeleteUser', { name: row.username }),
                                                                confirmLabel: t('common.delete'),
                                                                confirmColor: 'error',
                                                            });
                                                            if (!accepted) {
                                                                return;
                                                            }
                                                            const result = await deleteUser(row.id);
                                                            if (!result.success) setError(result.message);
                                                            else await refresh();
                                                        }}
                                                    >
                                                        {t('admin.delete')}
                                                    </Button>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader title={t('admin.templatesTitle')} subheader={t('admin.templatesDesc')} />
                        <CardContent>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t('settings.templateCurrent')}</TableCell>
                                        <TableCell>{t('admin.owner')}</TableCell>
                                        <TableCell>{t('share.status')}</TableCell>
                                        <TableCell align="right">{t('admin.actions')}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {configs.map((row) => (
                                        <TableRow key={row.id}>
                                            <TableCell>{row.name}</TableCell>
                                            <TableCell>{row.ownerUsername || row.ownerId}</TableCell>
                                            <TableCell>
                                                {row.shareEnabled ? t('share.enabled') : t('share.disabled')}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={1} justifyContent="flex-end">
                                                    <Button
                                                        size="small"
                                                        onClick={() => navigate(`/settings?ownerId=${encodeURIComponent(row.ownerId)}`)}
                                                    >
                                                        {t('admin.editTemplate')}
                                                    </Button>
                                                    {row.shareToken ? (
                                                        <Button
                                                            size="small"
                                                            onClick={() => {
                                                                const opened = window.open(
                                                                    `/display/${row.shareToken}`,
                                                                    '_blank',
                                                                    'noopener,noreferrer',
                                                                );
                                                                if (opened) {
                                                                    opened.opener = null;
                                                                }
                                                            }}
                                                        >
                                                            {t('share.openDisplay')}
                                                        </Button>
                                                    ) : null}
                                                    <Button
                                                        size="small"
                                                        color="error"
                                                        onClick={async () => {
                                                            const accepted = await confirm({
                                                                title: t('settings.confirmTitle'),
                                                                message: t('admin.confirmDeleteTemplate', { name: row.name }),
                                                                confirmLabel: t('common.delete'),
                                                                confirmColor: 'error',
                                                            });
                                                            if (!accepted) {
                                                                return;
                                                            }
                                                            const result = await deleteConfigurationById(row.id);
                                                            if (!result.success) setError(result.message);
                                                            else await refresh();
                                                        }}
                                                    >
                                                        {t('admin.delete')}
                                                    </Button>
                                                </Stack>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </Stack>
            </Container>
        </Box>
    );
}
