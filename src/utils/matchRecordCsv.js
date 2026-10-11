// Client-side CSV assembly (BD-6: the server never composes user-sourced
// text). Mirrors the detail payload with BOM for Excel + formula guard.

function csvCell(value) {
    let text = String(value ?? '');
    if (/^[=+\-@\t\r]/.test(text)) {
        text = `'${text}`;
    }
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatSeconds(total) {
    const seconds = Math.max(0, Number(total) || 0);
    const minutes = Math.floor(seconds / 60);
    const rem = seconds % 60;
    return `${minutes}:${rem.toString().padStart(2, '0')}`;
}

export function buildMatchRecordCsv(detail) {
    const header = [
        'index', 'stage', 'mode', 'planned', 'actual_aff', 'actual_neg',
        'overrun_aff', 'overrun_neg', 'entered_at', 'exited_at',
    ];
    const rows = (detail.stages || []).map((stage, index) => [
        index + 1,
        stage.label,
        stage.mode,
        formatSeconds(stage.plannedSeconds),
        formatSeconds(stage.actualAffSeconds),
        formatSeconds(stage.actualNegSeconds),
        stage.overrunAff > 0 ? `x${stage.overrunAff}` : '',
        stage.overrunNeg > 0 ? `x${stage.overrunNeg}` : '',
        stage.enteredAt ? new Date(stage.enteredAt).toISOString() : '',
        stage.exitedAt ? new Date(stage.exitedAt).toISOString() : '',
    ]);
    return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;
}

export function exportFilename(detail, format) {
    const stamp = new Date(detail.startedAt || detail.savedAt);
    const pad = (n) => String(n).padStart(2, '0');
    const name = `match-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}-${detail.configName}`;
    const safe = name.replace(/[^\w.-]+/g, '_').slice(0, 80);
    return `${safe}.${format}`;
}

export function downloadCsv(detail) {
    const blob = new Blob([buildMatchRecordCsv(detail)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = exportFilename(detail, 'csv');
    anchor.click();
    URL.revokeObjectURL(url);
}
