import React from 'react';
import { formatTime } from '../timer/engine';
import './timer-box.css';

/**
 * Shared clock face (single / per-side). Purely presentational: the clock
 * value, blink classes, and grace hint all derive from the engine side
 * state — no DOM reach-ins. Used by both the MUI control page (variant
 * "control") and the lightweight display page (variant "display").
 */
export default function TimerBox({
    sideState,
    blinking = false,
    active = false,
    title = null,
    badge = null,
    hint = null,
    graceText = null,
    readonlyText = null,
    readonly = false,
    variant = 'control',
    startTitle,
    stopTitle,
    resetTitle,
    onStart,
    onStop,
    onReset,
}) {
    const inGrace = sideState.phase === 'grace';
    const clockClass = [
        'tb-clock',
        sideState.phase === 'locked' ? 'tb-clock--locked' : '',
        inGrace ? 'tb-clock--grace' : '',
        blinking ? 'tb-clock--warn' : '',
    ].filter(Boolean).join(' ');

    return (
        <div className={[
            'tb-box',
            variant === 'display' ? 'tb-box--display' : '',
            active ? 'tb-active' : '',
        ].filter(Boolean).join(' ')}>
            {title != null ? (
                <h3 className="tb-head">
                    {badge != null ? <span className="tb-badge">{badge}</span> : null}
                    {title}
                </h3>
            ) : null}
            <h1 className={clockClass}>
                {formatTime(inGrace ? sideState.graceLeft : sideState.remaining)}
            </h1>
            {inGrace && graceText != null ? <p className="tb-grace-hint">{graceText}</p> : null}
            {readonly ? (
                readonlyText != null ? <p className="tb-hint">{readonlyText}</p> : null
            ) : (
                <React.Fragment>
                    <div className="tb-controls">
                        <button
                            type="button"
                            className={`tb-btn${sideState.running ? '' : ' tb-btn--live'}`}
                            onClick={onStart}
                            disabled={sideState.running}
                            title={startTitle}
                        >
                            ▶
                        </button>
                        <button
                            type="button"
                            className={`tb-btn${sideState.running ? ' tb-btn--live' : ''}`}
                            onClick={onStop}
                            disabled={!sideState.running}
                            title={stopTitle}
                        >
                            ⏸
                        </button>
                        <button
                            type="button"
                            className="tb-btn"
                            onClick={onReset}
                            disabled={sideState.running}
                            title={resetTitle}
                        >
                            ↺
                        </button>
                    </div>
                    {hint != null ? <p className="tb-hint">{hint}</p> : null}
                </React.Fragment>
            )}
        </div>
    );
}
