# D0 + D1 + PRD/API/交互（合并简报） — 迭代包 D：PWA 离线 + 手机适配

> 本包为平台支撑域能力，无业务架构变化：BA 不动（纯技术功能不入 BA）；AA 增 P-03；
> FL 无新菜单（附录注明）；PRD/API/交互合并为本简报（无新端点、无新页面路由）。

## D0 决策

| # | 决策 |
|---|------|
| D-C1 | PWA 方案：`vite-plugin-pwa`（Workbox）——预缓存应用壳与静态资产；API 请求一律 network-only（SSE/计时数据不做离线伪装） |
| D-C2 | 离线体验：检测 `navigator.onLine` + SW 激活态；离线时顶部细横幅「离线模式：计时可用，云同步暂不可用」；恢复在线自动消失 |
| D-C3 | 安装支持：Web App Manifest（名称/图标/standalone/主题色随明暗）；捕获 `beforeinstallprompt` 在计时页导航提供「安装」按钮（不支持的浏览器隐藏） |
| D-C4 | 手机适配：viewport 已有；增强——计时页双计时移动端纵向堆叠（既有媒体查询保留）、加大按钮触达区（≥44px）、h1 秒表字号 clamp 适配小屏、会话条/导航换行布局、快捷键提示在触屏隐藏（hover:none） |
| D-C5 | 不做：推送通知、后台同步、离线配置编辑冲突合并；iOS Safari 的安装提示按其原生「添加到主屏幕」引导文案处理 |

## D1（AA v1.4）

平台支撑域新增：

- **P-03 渐进离线（PWA）**：P-03-01 应用壳离线缓存（预缓存+更新策略）；P-03-02 安装与离线提示（manifest、安装入口、离线横幅）。涉及用户类型：全部。BA 不涵盖（平台技术功能），FL 无菜单（自动行为 + 导航内嵌入口，见附录说明）。

## PRD 要点（完备性）

- G1 目标：现场弱网/断网时计时器核心可用、可安装到主屏；手机作遥控器可用性提升
- G2 范围：做什么见 D-C1~C4；不做什么见 D-C5
- G3 角色：全用户类型（无权限差异）
- G4/G5 对象：无领域对象（service worker/manifest 为平台资产；离线横幅为 UI 状态=过程数据）
- NFR：SW 更新采用 prompt-free 自动更新（skipWaiting+clientsClaim）；Lighthouse PWA 基本项通过；预缓存体积 ≤1MB（现状 build 资产 gzip 后约 240KB）

## API

无新端点、无载荷变更。部署注意：`deploy/production` 的 GitHub Pages 工作流需复制 service worker 与 manifest（vite-plugin-pwa 产物在 build 输出内，现有 `pages` 部署脚本一般无需改；Baota 同理）。

## 交互（增量）

- 计时页导航新增「安装」按钮（beforeinstallPrompt 可用时）+ 离线横幅（Online/Offline 事件驱动）
- 触屏媒体查询隐藏 shortcut-hint 行；按钮 min-height 44px
- 既有路由无变化

## Gate 1 结论（简报内联）

三文档检查：AA v1.4 编辑 + FL 附录注记 ✅；PRD 完备（上节）✅；API 无变更 ✅；交互增量明确 ✅；枚举无 ✅ → **PASS**。
WARN：iOS 安装体验依赖原生菜单（D-C5）；PWA 预缓存策略对 `/api` 代理环境的兼容需部署后验证。
