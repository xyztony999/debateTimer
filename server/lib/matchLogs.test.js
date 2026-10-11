import { buildMatchRecord, exportFilename } from './matchLogs.js';

const OWNER = '111111111111111111111111';
const NOW = Date.now();

function stagePayload(overrides = {}) {
    return {
        stageId: 'free_debate',
        label: '自由辩论',
        mode: 'free',
        plannedSeconds: 180,
        graceSeconds: 30,
        actualAffSeconds: 170,
        actualNegSeconds: 181,
        overrunAff: 0,
        overrunNeg: 1,
        enteredAt: NOW - 600_000,
        exitedAt: NOW - 300_000,
        ...overrides,
    };
}

function recordPayload(overrides = {}) {
    return {
        configName: 'default',
        teamNames: { aff: 'A 队', neg: 'B 队' },
        startedAt: NOW - 3600_000,
        endedAt: NOW,
        stages: [stagePayload()],
        ...overrides,
    };
}

test('builds a record with server-side summary', () => {
    const doc = buildMatchRecord(recordPayload(), OWNER);
    expect(doc.ownerId).toBe(OWNER);
    expect(doc.savedAt).toBeGreaterThan(0);
    expect(doc.summary).toEqual({
        totalPlannedSeconds: 180,
        totalActualSeconds: 351,
        overrunCount: 1,
    });
    expect(doc.stages[0]).toMatchObject({ stageId: 'free_debate', graceSeconds: 30 });
});

test('rejects invalid payloads', () => {
    expect(() => buildMatchRecord(recordPayload({ configName: '' }), OWNER)).toThrow();
    expect(() => buildMatchRecord(recordPayload({ endedAt: NOW - 7200_000 }), OWNER)).toThrow(/endedAt/);
    expect(() => buildMatchRecord(recordPayload({ stages: [{ ...stagePayload(), mode: 'rapid' }] }), OWNER)).toThrow(/mode/);
    expect(() => buildMatchRecord(recordPayload({ stages: [{ ...stagePayload(), plannedSeconds: 0 }] }), OWNER)).toThrow(/plannedSeconds/);
    expect(() => buildMatchRecord(recordPayload({ teamNames: { aff: 'x'.repeat(21) } }), OWNER)).toThrow(/teamNames/);
    expect(() => buildMatchRecord(recordPayload({ stages: [{ ...stagePayload(), exitedAt: NOW - 700_000 }] }), OWNER)).toThrow(/exitedAt/);
});

test('truncates beyond 64 stages and marks the record', () => {
    const stages = Array.from({ length: 70 }, (_, i) => stagePayload({ stageId: `s${i}`, label: `S${i}` }));
    const doc = buildMatchRecord(recordPayload({ stages }), OWNER);
    expect(doc.stages).toHaveLength(64);
    expect(doc.truncated).toBe(true);
});

test('export filename is sanitized and timestamped', () => {
    const doc = buildMatchRecord(recordPayload({ configName: 'UOMDC 秋季赛/2026' }), OWNER);
    const name = exportFilename(doc, 'json');
    expect(name).toMatch(/^match-\d{8}-\d{4}-.*\.json$/);
    expect(name).not.toMatch(/[/]/);
});
