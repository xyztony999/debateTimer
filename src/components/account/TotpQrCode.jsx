import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Typography from '@mui/material/Typography';

// Displayed size of the code (CSS px), fixed by the PageSpec.
const QR_SIZE = 200;
// Quiet zone around the code, in modules (the QR standard asks for four).
const QUIET_MODULES = 4;

/**
 * QR code for the otpauth:// link, drawn as a plain <img> whose source is a
 * data URL generated in the browser.
 *
 * The generator is imported here, dynamically, so it is only downloaded on a
 * device that is actually binding an authenticator. Nothing is written as
 * SVG/HTML markup: the library hands back pixels, which go into `img.src`.
 * When it fails (library did not load, data rejected) the two fallbacks of
 * the step — the link and the manual key — still work, so this says so
 * instead of leaving an empty box.
 *
 * The white tile is fixed on purpose: a code stays black-on-white in dark
 * mode too, because authenticator apps expect exactly that.
 */
export default function TotpQrCode({ value }) {
    const { t } = useTranslation();
    const [source, setSource] = useState(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        let cancelled = false;
        setSource(null);
        setFailed(false);

        (async () => {
            try {
                const { default: qrcode } = await import('qrcode-generator');
                const qr = qrcode(0, 'M'); // 0 = smallest version that fits
                qr.addData(value);
                qr.make();
                // One cell per module, sized so the image has at least as many
                // device pixels as the 200 CSS px it is shown at (never
                // blurred by upscaling; a slight downscale keeps crisp edges).
                const devicePx = QR_SIZE * (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
                const cellSize = Math.max(
                    4,
                    Math.ceil(devicePx / (qr.getModuleCount() + QUIET_MODULES * 2)),
                );
                const url = qr.createDataURL(cellSize, QUIET_MODULES);
                if (!cancelled) {
                    setSource(url);
                }
            } catch {
                if (!cancelled) {
                    setFailed(true);
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [value]);

    return (
        <Box sx={{ textAlign: 'center' }}>
            <Box
                sx={{
                    width: QR_SIZE + 24,
                    height: QR_SIZE + 24,
                    mx: 'auto',
                    p: 1.5,
                    bgcolor: '#ffffff',
                    borderRadius: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {source ? (
                    <Box
                        component="img"
                        src={source}
                        alt={t('account.totp.enrollTitle')}
                        sx={{
                            display: 'block',
                            width: QR_SIZE,
                            height: QR_SIZE,
                            imageRendering: 'pixelated',
                        }}
                    />
                ) : failed ? (
                    <Typography variant="caption" sx={{ color: '#424242' }}>
                        {t('account.totp.qrFailed')}
                    </Typography>
                ) : (
                    <LinearProgress sx={{ width: QR_SIZE - 32 }} aria-label={t('account.totp.enrollTitle')} />
                )}
            </Box>
        </Box>
    );
}
