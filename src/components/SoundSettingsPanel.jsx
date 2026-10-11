import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Box,
    Button,
    Grid,
    IconButton,
    MenuItem,
    Select,
    Slider,
    Stack,
    Typography,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import {
    ALERT_NODES,
    DEFAULT_SOUND_PREFS,
    SOUND_OPTIONS,
    loadSoundPrefs,
    previewSound,
    saveSoundPrefs,
    warmupSounds,
} from '../services/soundPrefs';

const NODE_LABEL_KEYS = {
    warn30: 'settings.soundWarn30',
    timeUp: 'settings.soundTimeUp',
    mustStop: 'settings.soundMustStop',
};

/**
 * Per-device alert sound preferences (browser-local). Used inside the settings
 * page card and as a popover on the display page.
 */
export default function SoundSettingsPanel() {
    const { t } = useTranslation();
    const [prefs, setPrefs] = useState(() => loadSoundPrefs());

    useEffect(() => {
        warmupSounds();
    }, []);

    const update = (node, patch) => {
        setPrefs((prev) => {
            const next = { ...prev, [node]: { ...prev[node], ...patch } };
            saveSoundPrefs(next);
            return next;
        });
    };

    const reset = () => {
        setPrefs({ ...DEFAULT_SOUND_PREFS });
        saveSoundPrefs(DEFAULT_SOUND_PREFS);
    };

    return (
        <Stack spacing={2}>
            {ALERT_NODES.map((node) => (
                <Grid container key={node} spacing={1} alignItems="center">
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
        </Stack>
    );
}
