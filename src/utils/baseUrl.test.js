import { describe, it, expect } from 'bun:test';
import { appPath } from './baseUrl.js';

// 测试环境无 Vite 注入，BASE_URL 走默认 '/'；/app/ 前缀分支由
// VITE_BASE=/app/ 的 Pages 构建产物在发版验证中覆盖。
describe('appPath（默认 base=/）', () => {
    it('keeps leading-slash paths unchanged', () => {
        expect(appPath('/display/abc')).toBe('/display/abc');
    });

    it('adds a leading slash when missing', () => {
        expect(appPath('gallery')).toBe('/gallery');
    });

    it('maps empty input to the base root', () => {
        expect(appPath('')).toBe('/');
    });
});
