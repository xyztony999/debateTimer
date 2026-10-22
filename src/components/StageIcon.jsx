import React from 'react';
import VolumeUpRounded from '@mui/icons-material/VolumeUpRounded';
import MicRounded from '@mui/icons-material/MicRounded';
import QuestionAnswerRounded from '@mui/icons-material/QuestionAnswerRounded';
import ReplyRounded from '@mui/icons-material/ReplyRounded';
import ForumRounded from '@mui/icons-material/ForumRounded';
import SummarizeRounded from '@mui/icons-material/SummarizeRounded';
import PauseCircleRounded from '@mui/icons-material/PauseCircleRounded';
import FlagRounded from '@mui/icons-material/FlagRounded';
import TimerRounded from '@mui/icons-material/TimerRounded';
import CompareArrowsRounded from '@mui/icons-material/CompareArrowsRounded';

// Stable IDs keep the icon independent of translated or customized labels.
const STAGE_ICONS = new Map([
    ['sound_check', <VolumeUpRounded />],
    ['aff_c1', <MicRounded />],
    ['neg_c1', <MicRounded />],
    ['neg_x_aff_c1', <QuestionAnswerRounded />],
    ['aff_x_neg_c1', <QuestionAnswerRounded />],
    ['aff_poii', <QuestionAnswerRounded />],
    ['neg_poii', <QuestionAnswerRounded />],
    ['aff_rebuttal_2', <ReplyRounded />],
    ['neg_rebuttal_2', <ReplyRounded />],
    ['crossfire_2v2', <ForumRounded />],
    ['free_debate', <ForumRounded />],
    ['aff_poii_sum', <SummarizeRounded />],
    ['neg_poii_sum', <SummarizeRounded />],
    ['tactical_pause', <PauseCircleRounded />],
    ['neg_closing', <FlagRounded />],
    ['aff_closing', <FlagRounded />],
]);

const MODE_ICONS = new Map([
    ['single', <TimerRounded />],
    [0, <TimerRounded />],
    ['double', <CompareArrowsRounded />],
    [1, <CompareArrowsRounded />],
    ['free', <ForumRounded />],
    [2, <ForumRounded />],
]);

const DEFAULT_ICON = <TimerRounded />;

/** Current stage marker with a mode-based fallback for custom templates. */
export default function StageIcon({ stageId, mode, ...iconProps }) {
    const icon = STAGE_ICONS.get(stageId) || MODE_ICONS.get(mode) || DEFAULT_ICON;
    return React.cloneElement(icon, iconProps);
}
