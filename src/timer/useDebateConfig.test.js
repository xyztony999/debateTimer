import { configFingerprint } from './useDebateConfig.js';

/**
 * Follow-bug regression: applyLoadedData no-ops on identical re-delivery by
 * comparing configFingerprint(configName, data). Hook-state identity can't
 * be asserted here (no DOM for renderHook — bun --dom does not install the
 * globals @testing-library/react needs); the end-to-end proof that identical
 * re-delivery keeps the runtime (and thus never mints a new config identity
 * downstream) is the display E2E 'identical config re-delivered mid-follow'.
 */

const PAYLOAD = {
    schemaVersion: 2,
    debateStages: { sound_check: 30, aff_c1: 120, free_debate: 60 },
    timerSettings: { sound_check: 'single', aff_c1: 'single', free_debate: 'free' },
    stageOrder: ['sound_check', 'aff_c1', 'free_debate'],
    stageLabels: {},
    stageGrace: { aff_c1: 15 },
    stageAutoAdvance: {},
    teamNames: { aff: '红队', neg: '蓝队' },
    shareEnabled: true,
    shareToken: 'tok',
};

test('structurally identical payloads yield the same fingerprint regardless of object identity', () => {
    // The poll fallback and SSE 'change' re-parse the same document — new
    // object graph, same content. The fingerprint must collapse them.
    const reDelivered = JSON.parse(JSON.stringify(PAYLOAD));
    expect(reDelivered).not.toBe(PAYLOAD);
    expect(configFingerprint('E2E 赛制', reDelivered))
        .toBe(configFingerprint('E2E 赛制', PAYLOAD));
});

test('changed content yields a different fingerprint', () => {
    const edited = { ...PAYLOAD, debateStages: { ...PAYLOAD.debateStages, free_debate: 90 } };
    expect(configFingerprint('E2E 赛制', edited))
        .not.toBe(configFingerprint('E2E 赛制', PAYLOAD));
});

test('a different configuration name yields a different fingerprint', () => {
    expect(configFingerprint('其他赛制', PAYLOAD))
        .not.toBe(configFingerprint('E2E 赛制', PAYLOAD));
});

test('nested deep-equal structures collapse to the same fingerprint', () => {
    const a = { ...PAYLOAD, teamNames: { aff: '红队', neg: '蓝队' } };
    const b = { ...PAYLOAD, teamNames: JSON.parse(JSON.stringify(PAYLOAD.teamNames)) };
    expect(configFingerprint('cfg', a)).toBe(configFingerprint('cfg', b));
});
