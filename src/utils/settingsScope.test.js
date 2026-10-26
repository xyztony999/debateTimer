import { normalizeOwnerScope, pickInitialTemplate } from './settingsScope.js';

test('normalizeOwnerScope: self id behaves like a normal visit', () => {
    expect(normalizeOwnerScope(undefined, 'u1')).toBeUndefined();
    expect(normalizeOwnerScope('', 'u1')).toBeUndefined();
    expect(normalizeOwnerScope('u1', 'u1')).toBeUndefined(); // admin editing own template
    expect(normalizeOwnerScope('u1', 'u2')).toBe('u1'); // genuinely another owner
    expect(normalizeOwnerScope('u1', null)).toBe('u1'); // no session id yet — keep scope
});

test('pickInitialTemplate: deep link wins, then memory, then fallback', () => {
    const names = ['默认配置', '校内赛', '联赛'];
    expect(pickInitialTemplate(names, '校内赛', '联赛', '默认配置')).toBe('校内赛');
    expect(pickInitialTemplate(names, '已删除的模板', '联赛', '默认配置')).toBe('联赛');
    expect(pickInitialTemplate(names, null, '也已失效', '默认配置')).toBe('默认配置');
    // Fallback itself missing from a non-empty list → first entry, never undefined.
    expect(pickInitialTemplate(['校内赛'], null, null, '默认配置')).toBe('校内赛');
    expect(pickInitialTemplate([], null, null, '默认配置')).toBe('默认配置');
});
