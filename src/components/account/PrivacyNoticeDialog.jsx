import React from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import LanguageSwitcher from '../LanguageSwitcher';
import PrivacyNoticeBody from './PrivacyNoticeBody';
import { NOTICE_STATUS } from './usePrivacyNotice';

/**
 * Privacy notice dialog of the sign-in page. Loading and failure are both
 * visible states with a way forward (a retry); only a notice that loaded is
 * shown. The text is requested per interface language, so the language can be
 * switched right here — the dialog is modal and would cover the card header's
 * own switch. Loaded on demand by LoginPage, so it is not part of the page's
 * first chunk.
 */
export default function PrivacyNoticeDialog({ open, onClose, status, notice, onRetry }) {
    const { t } = useTranslation();

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            scroll="paper"
            aria-labelledby="privacy-notice-title"
        >
            <DialogTitle id="privacy-notice-title">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, pr: 5 }}>
                    <Box component="span" sx={{ minWidth: 0 }}>
                        {status === NOTICE_STATUS.READY && notice?.title ? notice.title : t('auth.privacyNoticeLink')}
                    </Box>
                    <LanguageSwitcher variant="mui" size="small" tone="onPaper" />
                </Box>
            </DialogTitle>
            <DialogContent sx={{ maxHeight: '70vh' }}>
                {status === NOTICE_STATUS.READY && notice ? (
                    <PrivacyNoticeBody notice={notice} />
                ) : status === NOTICE_STATUS.ERROR ? (
                    <Stack spacing={1.5}>
                        <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.6 }}>
                            {t('auth.privacyLoadFailed')}
                        </Typography>
                        <Button variant="outlined" size="small" onClick={onRetry} sx={{ alignSelf: 'flex-start' }}>
                            {t('auth.privacyRetry')}
                        </Button>
                    </Stack>
                ) : (
                    <Typography variant="body2" color="text.secondary">
                        {t('auth.privacyLoading')}
                    </Typography>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('auth.privacyClose')}</Button>
            </DialogActions>
        </Dialog>
    );
}
