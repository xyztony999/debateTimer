import React, {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

const FeedbackContext = createContext({
    notify: () => {},
    confirm: async () => false,
    alert: async () => {},
});

const DEFAULT_SNACKBAR = {
    open: false,
    message: '',
    severity: 'info',
    autoHideDuration: 4000,
};

const DEFAULT_CONFIRM = {
    open: false,
    title: '',
    message: '',
    confirmLabel: '',
    cancelLabel: '',
    confirmColor: 'primary',
};

const DEFAULT_ALERT = {
    open: false,
    title: '',
    message: '',
};

export function FeedbackProvider({ children }) {
    const { t } = useTranslation();
    const [snackbar, setSnackbar] = useState(DEFAULT_SNACKBAR);
    const [confirmState, setConfirmState] = useState(DEFAULT_CONFIRM);
    const [alertState, setAlertState] = useState(DEFAULT_ALERT);
    const confirmResolverRef = useRef(null);
    const alertResolverRef = useRef(null);

    const notify = useCallback((message, options = {}) => {
        setSnackbar({
            open: true,
            message,
            severity: options.severity || 'info',
            autoHideDuration: options.autoHideDuration ?? 4000,
        });
    }, []);

    const handleSnackbarClose = useCallback((_event, reason) => {
        if (reason === 'clickaway') {
            return;
        }
        setSnackbar((prev) => ({ ...prev, open: false }));
    }, []);

    const confirm = useCallback((options) => {
        const message = typeof options === 'string' ? options : options.message;
        const title = typeof options === 'string' ? '' : (options.title || '');
        const confirmLabel = typeof options === 'string' ? '' : (options.confirmLabel || '');
        const cancelLabel = typeof options === 'string' ? '' : (options.cancelLabel || '');
        const confirmColor = typeof options === 'string'
            ? 'primary'
            : (options.confirmColor || 'primary');

        return new Promise((resolve) => {
            if (confirmResolverRef.current) {
                confirmResolverRef.current(false);
            }
            confirmResolverRef.current = resolve;
            setConfirmState({
                open: true,
                title,
                message,
                confirmLabel,
                cancelLabel,
                confirmColor,
            });
        });
    }, []);

    const resolveConfirm = useCallback((accepted) => {
        setConfirmState((prev) => ({ ...prev, open: false }));
        if (confirmResolverRef.current) {
            confirmResolverRef.current(accepted);
            confirmResolverRef.current = null;
        }
    }, []);

    const alert = useCallback((options) => {
        const message = typeof options === 'string' ? options : options.message;
        const title = typeof options === 'string' ? '' : (options.title || '');

        return new Promise((resolve) => {
            if (alertResolverRef.current) {
                alertResolverRef.current();
            }
            alertResolverRef.current = resolve;
            setAlertState({
                open: true,
                title,
                message,
            });
        });
    }, []);

    const resolveAlert = useCallback(() => {
        setAlertState((prev) => ({ ...prev, open: false }));
        if (alertResolverRef.current) {
            alertResolverRef.current();
            alertResolverRef.current = null;
        }
    }, []);

    const value = useMemo(() => ({
        notify,
        confirm,
        alert,
    }), [notify, confirm, alert]);

    return (
        <FeedbackContext.Provider value={value}>
            {children}

            <Snackbar
                open={snackbar.open}
                autoHideDuration={snackbar.autoHideDuration}
                onClose={handleSnackbarClose}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            >
                <Alert
                    onClose={handleSnackbarClose}
                    severity={snackbar.severity}
                    variant="filled"
                    elevation={6}
                    sx={{ width: '100%' }}
                >
                    {snackbar.message}
                </Alert>
            </Snackbar>

            <Dialog
                open={confirmState.open}
                onClose={() => resolveConfirm(false)}
                aria-labelledby="app-confirm-title"
                aria-describedby="app-confirm-description"
            >
                {confirmState.title ? (
                    <DialogTitle id="app-confirm-title">
                        {confirmState.title}
                    </DialogTitle>
                ) : null}
                <DialogContent>
                    <DialogContentText id="app-confirm-description">
                        {confirmState.message}
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => resolveConfirm(false)} color="inherit">
                        {confirmState.cancelLabel || t('common.cancel')}
                    </Button>
                    <Button
                        onClick={() => resolveConfirm(true)}
                        color={confirmState.confirmColor}
                        variant="contained"
                        autoFocus
                    >
                        {confirmState.confirmLabel || t('common.confirm')}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={alertState.open}
                onClose={resolveAlert}
                aria-labelledby="app-alert-title"
                aria-describedby="app-alert-description"
            >
                {alertState.title ? (
                    <DialogTitle id="app-alert-title">
                        {alertState.title}
                    </DialogTitle>
                ) : null}
                <DialogContent>
                    <DialogContentText id="app-alert-description">
                        {alertState.message}
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={resolveAlert} variant="contained" autoFocus>
                        {t('common.ok')}
                    </Button>
                </DialogActions>
            </Dialog>
        </FeedbackContext.Provider>
    );
}

export function useFeedback() {
    return useContext(FeedbackContext);
}
