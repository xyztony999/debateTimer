/**
 * PID icon registry (S-01-07): stable string ids → icon components. Shared by
 * the settings pickers (grid), the control-page PID timeline, and travels in
 * the config as `stagePid[stageId].icon` / `pidOptions.marker`. Ids are
 * append-only — never reuse a retired id for a different glyph.
 */
import React from 'react';
import TrainRounded from '@mui/icons-material/TrainRounded';
import MicRounded from '@mui/icons-material/MicRounded';
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded';
import QuestionAnswerRounded from '@mui/icons-material/QuestionAnswerRounded';
import ReplyRounded from '@mui/icons-material/ReplyRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import SummarizeRounded from '@mui/icons-material/SummarizeRounded';
import PauseCircleRounded from '@mui/icons-material/PauseCircleRounded';
import FlagRounded from '@mui/icons-material/FlagRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import CompareArrowsRounded from '@mui/icons-material/CompareArrowsRounded';
import NotificationsRounded from '@mui/icons-material/NotificationsRounded';
import GavelRounded from '@mui/icons-material/GavelRounded';
import SchoolRounded from '@mui/icons-material/SchoolRounded';
import GroupsRounded from '@mui/icons-material/GroupsRounded';
import EmojiEventsRounded from '@mui/icons-material/EmojiEventsRounded';
import RecordVoiceOverRounded from '@mui/icons-material/RecordVoiceOverRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';

export const PID_ICONS = {
    train: TrainRounded,
    mic: MicRounded,
    volume: VolumeUpRounded,
    question_answer: QuestionAnswerRounded,
    reply: ReplyRounded,
    forum: ForumRounded,
    summarize: SummarizeRounded,
    pause: PauseCircleRounded,
    flag: FlagRounded,
    timer: TimerRounded,
    compare_arrows: CompareArrowsRounded,
    bell: NotificationsRounded,
    gavel: GavelRounded,
    school: SchoolRounded,
    groups: GroupsRounded,
    trophy: EmojiEventsRounded,
    record_voice_over: RecordVoiceOverRounded,
    schedule: ScheduleRounded,
};

export const PID_ICON_IDS = Object.keys(PID_ICONS);

// Pre-created elements (mirrors StageIcon's STAGE_ICONS pattern — the React
// compiler lint forbids constructing components during render).
export const PID_ICON_ELEMENTS = Object.fromEntries(
    Object.entries(PID_ICONS).map(([id, Component]) => [id, React.createElement(Component)]),
);

// Current-station marker (train) subset for the template-level picker.
export const MARKER_IDS = [
    'train', 'mic', 'volume', 'bell', 'flag', 'timer', 'trophy', 'record_voice_over',
];

// Route line palette — whitelist mirrored in server configDocs validation.
export const LINE_COLORS = [
    '#1e3a5f', '#c62828', '#2e7d32', '#ef6c00', '#6a1b9a', '#00695c', '#455a64',
];

export const DEFAULT_LINE_COLOR = '#1e3a5f';

/** Returns a pre-created element for a stable icon id, or null for auto/unknown. */
export function pidIconElement(id) {
    if (!id || id === 'auto' || !/^[a-z0-9_]{1,32}$/.test(id)) {
        return null;
    }
    return PID_ICON_ELEMENTS[id] || null;
}
