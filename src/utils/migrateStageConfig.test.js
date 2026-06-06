import { migrateStageConfig } from './migrateStageConfig';

test('returns empty defaults for invalid debateStages', () => {
    expect(migrateStageConfig({ debateStages: null })).toEqual({
        debateStages: {},
        timerSettings: {},
        stageOrder: [],
        migrated: false,
    });
});

test('passes through config without legacy keys', () => {
    const debateStages = { sound_check: { duration: 30 }, aff_c1: { duration: 180 } };
    const timerSettings = { sound_check: { warning: 10 } };
    const stageOrder = ['sound_check', 'aff_c1'];

    const result = migrateStageConfig({ debateStages, timerSettings, stageOrder });

    expect(result.migrated).toBe(false);
    expect(result.debateStages).toEqual(debateStages);
    expect(result.debateStages).not.toBe(debateStages);
    expect(result.timerSettings).toEqual(timerSettings);
    expect(result.stageOrder).toEqual(stageOrder);
});

test('derives stageOrder from debateStages keys when order is empty', () => {
    const debateStages = { aff_c1: {}, sound_check: {} };
    const result = migrateStageConfig({ debateStages, stageOrder: [] });

    expect(result.migrated).toBe(false);
    expect(result.stageOrder).toEqual(['aff_c1', 'sound_check']);
});

test('remaps legacy Chinese keys to stable IDs', () => {
    const debateStages = {
        测试声音: { duration: 30 },
        正方一辩发言: { duration: 180 },
        custom_stage: { duration: 60 },
    };
    const timerSettings = {
        测试声音: { warning: 5 },
        custom_stage: { warning: 10 },
    };
    const stageOrder = ['测试声音', '正方一辩发言', 'custom_stage'];

    const result = migrateStageConfig({ debateStages, timerSettings, stageOrder });

    expect(result.migrated).toBe(true);
    expect(result.debateStages).toEqual({
        sound_check: { duration: 30 },
        aff_c1: { duration: 180 },
        custom_stage: { duration: 60 },
    });
    expect(result.timerSettings).toEqual({
        sound_check: { warning: 5 },
        custom_stage: { warning: 10 },
    });
    expect(result.stageOrder).toEqual(['sound_check', 'aff_c1', 'custom_stage']);
});

test('deduplicates stageOrder when legacy and stable IDs collide', () => {
    const debateStages = {
        测试声音: { duration: 30 },
        sound_check: { duration: 45 },
    };

    const result = migrateStageConfig({
        debateStages,
        stageOrder: ['测试声音', 'sound_check'],
    });

    expect(result.migrated).toBe(true);
    expect(result.stageOrder).toEqual(['sound_check']);
    // Later key wins when both map to the same stable ID
    expect(result.debateStages.sound_check).toEqual({ duration: 45 });
});
