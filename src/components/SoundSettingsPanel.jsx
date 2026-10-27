import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Button,
    Divider,
    FormControlLabel,
    Grid,
    IconButton,
    MenuItem,
    Select,
    Slider,
    Stack,
    Switch,
    Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
    ALERT_NODES,
    DEFAULT_SOUND_PREFS,
    DEFAULT_TTS_PREFS,
    SOUND_OPTIONS,
    TTS_NODES,
    loadSoundPrefs,
    previewSound,
    saveSoundPrefs,
    warmupSounds,
} from '../services/soundPrefs';
import {
    getVoices,
    isTtsSupported,
    isTtsUnlocked,
    pickVoiceForLang,
    primeTts,
    speakAnnouncement,
    unlockTtsNow,
} from '../services/speech';

const NODE_LABEL_KEYS = {
    warn30: 'settings.soundWarn30',
    timeUp: 'settings.soundTimeUp',
    mustStop: 'settings.soundMustStop',
};

const TTS_NODE_LABEL_KEYS = {
    warn30: 'settings.soundWarn30',
    timeUp: 'settings.soundTimeUp',
    mustStop: 'settings.soundMustStop',
    handover: 'settings.ttsHandover',
};

/**
 * Per-device alert sound + voice announcement preferences (browser-local).
 * Used inside the settings page card and as a popover on the display page —
 * the display popover re-renders it, so no extra styling is needed there.
 */
export default function SoundSettingsPanel() {
    const { t, i18n } = useTranslation();
    const [prefs, setPrefs] = useState(() => loadSoundPrefs());
    // Voice list loads asynchronously and the unlock flag lives outside
    // React; gestures / voiceschanged bump this to refresh the hints.
    const [, setHintTick] = useState(0);

    useEffect(() => {
        warmupSounds();
    }, []);

    useEffect(() => {
        if (!isTtsSupported()) {
            return undefined;
        }
        const bump = () => setHintTick((n) => n + 1);
        try {
            window.speechSynthesis.addEventListener?.('voiceschanged', bump);
        } catch {
            // Ignore — hints stay at their last computed state.
        }
        return () => {
            try {
                window.speechSynthesis.removeEventListener?.('voiceschanged', bump);
            } catch {
                // Ignore.
            }
        };
    }, []);

    // Only listen for gestures while TTS is on (they refresh the unlock hint).
    const ttsEnabled = Boolean(prefs.tts?.enabled);
    useEffect(() => {
        if (!ttsEnabled) {
            return undefined;
        }
        const bump = () => setHintTick((n) => n + 1);
        window.addEventListener('pointerdown', bump);
        window.addEventListener('keydown', bump);
        return () => {
            window.removeEventListener('pointerdown', bump);
            window.removeEventListener('keydown', bump);
        };
    }, [ttsEnabled]);

    const update = (node, patch) => {
        setPrefs((prev) => {
            const next = { ...prev, [node]: { ...prev[node], ...patch } };
            saveSoundPrefs(next);
            return next;
        });
    };

    const updateTts = (patch) => {
        if (patch.enabled === true) {
            // The toggle click is itself a user gesture: arm the one-shot
            // unlock for future gestures and mark the path open now.
            primeTts();
            unlockTtsNow();
        }
        setPrefs((prev) => {
            const next = { ...prev, tts: { ...prev.tts, ...patch } };
            saveSoundPrefs(next);
            return next;
        });
    };

    const reset = () => {
        const next = { ...DEFAULT_SOUND_PREFS, tts: { ...DEFAULT_TTS_PREFS } };
        setPrefs(next);
        saveSoundPrefs(next);
    };

    // Preview speaks the real announcement copy (generic team name — the
    // panel has no config context).
    const previewTts = (node) => {
        const sample = {
            warn30: () => t('timer.tts.warn30'),
            timeUp: () => t('timer.tts.timeUpSide', { team: t('timer.affirmative') }),
            mustStop: () => t('timer.tts.mustStopSide', { team: t('timer.affirmative') }),
            handover: () => t('timer.tts.handover', { team: t('timer.negative') }),
        }[node]?.();
        if (!sample) {
            return;
        }
        unlockTtsNow();
        speakAnnouncement(sample, i18n.language);
    };

    const supported = isTtsSupported();
    const voiceHint = (() => {
        if (!supported) {
            return t('settings.ttsUnsupported');
        }
        if (!ttsEnabled) {
            return null;
        }
        if (!isTtsUnlocked()) {
            return t('settings.ttsUnlockHint');
        }
        const pick = pickVoiceForLang(i18n.language);
        if (pick.matched === 'fallback') {
            return getVoices().length > 0
                ? t('settings.ttsVoiceFallback')
                : null;
        }
        return pick.voice ? t('settings.ttsVoiceReady', { name: pick.voice.name }) : null;
    })();

    return (
        <Stack spacing={2}>
            {ALERT_NODES.map((node) => (
                <Grid container key={node} spacing={1} sx={{ alignItems: 'center' }}>
                    <Grid size={{ xs: 12, sm: 3.5 }}>
                        <Typography variant="body2">{t(NODE_LABEL_KEYS[node])}</Typography>
                    </Grid>
                    <Grid size={{ xs: 6, sm: 4 }}>
                        <Select
                            size="small"
                            fullWidth
                            value={prefs[node].sound}
                            onChange={(event) => update(node, { sound: event.target.value })}
                            aria-label={t(NODE_LABEL_KEYS[node])}
                        >
                            {SOUND_OPTIONS.map((option) => (
                                <MenuItem key={option.id} value={option.id}>
                                    {t(`settings.soundOption.${option.id}`)}
                                </MenuItem>
                            ))}
                        </Select>
                    </Grid>
                    <Grid size={{ xs: 4, sm: 3.2 }}>
                        <Slider
                            size="small"
                            min={0}
                            max={100}
                            step={5}
                            value={prefs[node].volume}
                            onChange={(_event, value) => update(node, { volume: value })}
                            aria-label={`${t(NODE_LABEL_KEYS[node])} ${t('settings.soundVolume')}`}
                        />
                    </Grid>
                    <Grid size={{ xs: 2, sm: 1.3 }}>
                        <IconButton
                            size="small"
                            onClick={() => previewSound(prefs[node].sound, prefs[node].volume)}
                            aria-label={t('settings.soundPreview')}
                            title={t('settings.soundPreview')}
                        >
                            <PlayArrowIcon />
                        </IconButton>
                    </Grid>
                </Grid>
            ))}
            <Box>
                <Button
                    size="small"
                    startIcon={<RestartAltIcon />}
                    onClick={reset}
                >
                    {t('settings.soundReset')}
                </Button>
            </Box>

            <Divider />

            <Stack spacing={1}>
                <Typography variant="subtitle2">{t('settings.ttsTitle')}</Typography>
                <Typography variant="body2" color="text.secondary">{t('settings.ttsDesc')}</Typography>
                <FormControlLabel
                    control={(
                        <Switch
                            checked={ttsEnabled}
                            onChange={(event) => updateTts({ enabled: event.target.checked })}
                            disabled={!supported}
                        />
                    )}
                    label={t('settings.ttsEnabled')}
                />
                {TTS_NODES.map((node) => (
                    <Grid container key={node} spacing={1} sx={{ alignItems: 'center' }}>
                        <Grid size={{ xs: 9, sm: 10 }}>
                            <FormControlLabel
                                control={(
                                    <Switch
                                        size="small"
                                        checked={Boolean(prefs.tts[node])}
                                        onChange={(event) => updateTts({ [node]: event.target.checked })}
                                        disabled={!ttsEnabled}
                                    />
                                )}
                                label={<Typography variant="body2">{t(TTS_NODE_LABEL_KEYS[node])}</Typography>}
                            />
                        </Grid>
                        <Grid size={{ xs: 3, sm: 2 }} sx={{ textAlign: 'right' }}>
                            <IconButton
                                size="small"
                                onClick={() => previewTts(node)}
                                disabled={!ttsEnabled}
                                aria-label={`${t(TTS_NODE_LABEL_KEYS[node])} ${t('settings.soundPreview')}`}
                                title={t('settings.soundPreview')}
                            >
                                <PlayArrowIcon />
                            </IconButton>
                        </Grid>
                    </Grid>
                ))}
                {voiceHint ? (
                    <Typography variant="caption" color="text.secondary" role="status">
                        {voiceHint}
                    </Typography>
                ) : null}
            </Stack>
        </Stack>
    );
}
