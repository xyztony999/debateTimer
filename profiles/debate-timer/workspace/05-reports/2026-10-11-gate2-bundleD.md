# Gate 2 验证报告 — 代码→交付门控（迭代包 D PWA + 手机适配）

**模块**：pwa-mobile　**时间**：2026-10-11　**门禁**：lint 0 error（6 既有 warning）/ 52 tests / build ✓（sw.js + manifest.webmanifest 产物生成）

> 说明：Gate 1 暂停时用户未即时应答，按其前三次相同确认模式与四包串行授权继续推进（已在最终总结注明）。

## 实现核对（对照简报决策）

| 决策 | 实现 | 状态 |
|------|------|------|
| D-C1 预缓存+API network-only | vite-plugin-pwa（generateSW）；`navigateFallbackDenylist: [/^\/api\//]`；sw.js 产物含 api 排除 | ✅ |
| D-C2 离线横幅 | `PwaBits.useOffline`（Online/Offline 事件）+ 全局 `<OfflineBanner/>`（App 根） | ✅ |
| D-C3 安装支持 | 插件 manifest（navy 主题色/三图标含 maskable）；`beforeinstallprompt` → 计时页导航安装按钮；iOS 沿用原生添加 | ✅ |
| D-C4 手机适配 | `hover:none+pointer:coarse`：隐藏快捷键提示、按钮≥44px、计时按钮≥56px；≤480px：h1 clamp、导航/会话条换行 | ✅ |
| D-C5 不做清单 | 未引入推送/后台同步 | ✅ |

## 资产与配置

- 新增图标：icon-192/512/maskable-512/apple-touch-icon（脚本生成，navy 环形秒表母题）；移除旧 public/manifest.json（由插件统一生成，避免双 manifest）
- 依赖：+vite-plugin-pwa@2.0.0（dev）；bun.lock 已更新（R5 合规）
- 部署：SW/manifest 在 build 产物内，GitHub Pages/Baota 现有部署脚本无需改动（需确认反向代理不拦截 sw.js 的 Service-Worker-Allowed——记入验收清单）

## 测试增量

pwa i18n 三语言断言（52 tests）。

## 总结

**判定**：**WARN → 可交付**（CRITICAL 0）

WARN：真机验收清单——iOS 添加到主屏后 standalone 表现、Android 安装提示触发、飞行模式下计时页可开、Baota 反代下 sw.js 正常返回 200。
