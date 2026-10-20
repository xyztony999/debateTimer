# 移动端适配保守补齐：恢复触屏验收口径 + 小屏收纳

## 背景

方向 1（手机遥控器）的底座已上线；但上次重构清理 App.css 时，迭代包 D 定下并验收过的触屏适配（gate2-bundleD：`hover:none+pointer:coarse` 隐藏快捷键提示、按钮 ≥44px、计时按钮 ≥56px、小屏 h1 clamp）被删掉没补回来。本包恢复这些口径，并对新控制台做小屏防挤压收纳。全 CSS 为主 + TimerControlPage 少量 sx 调整，不动架构。

## 改动清单

### 1. 触屏适配恢复（`src/components/timer-box.css`、`src/timer/timer-control.css`、`src/timer/display.css`）

新增 `@media (hover: none) and (pointer: coarse)` 块：
- 隐藏 `tb-hint`（TimerBox 下的键盘快捷键提示行）与控制页 ⌨ 快捷键帮助入口（讲的全是键盘操作，触屏无意义）
- `tb-btn`（时钟下 ▶⏸↺）min-height 56px、加大 padding——对齐旧"计时按钮 ≥56px"口径
- `st-step`（阶段时间线）与 `dt-icon-btn` min-height/min-width 44px——对齐"按钮 ≥44px"
- `dt-note`（大屏独立模式的键盘提示行）触屏隐藏

### 2. 小屏秒表字号（`timer-box.css`）

`@media (max-width: 480px)` 下 `.tb-clock` 用旧验收口径 `clamp(56px, 18vw, 88px)`（当前 13vh 在窄横屏/小机型会过小）；大屏端 `.tb-box--display .tb-clock` 保持 24vh（投影为主，不缩）。

### 3. 控制台 AppBar 小屏收纳（`src/TimerControlPage.jsx` + `timer-control.css`）

- 标题 `🎯 辩论计时器` 在 `xs` 断点只留 🎯（文字 `sx={{ display: { xs: 'none', sm: 'inline' } }}`）
- 保存记录按钮 xs 只留图标（label 同上隐藏），避免 Toolbar 换行
- 底部操作栏按钮窄屏 `flex: 1`（360px 宽放双按钮不溢出）
- 顶部刘海安全区：内容区加 `paddingTop: env(safe-area-inset-top)` 兜底（viewport-fit=cover + standalone 状态栏 black）

### 4. 不做的部分

- 遥控器专版布局（超大主按钮、时钟缩顶）——后续再说
- 大屏页整体重排（投影为主，只补 icon 按钮触屏尺寸）
- iOS 音频解锁策略调整（单独议题，需真机验证后再定）

## 验证

- 桌面 Chrome DevTools iPhone 视口 + 触屏仿真检查：提示隐藏、按钮尺寸、AppBar 不换行、双计时纵向堆叠
- `bun run lint` + `bun test` + `bun run build` 全绿
- 你在安卓真机复验（先强刷拿到新版：关标签重开或清站点数据）——正好把遗留的"真机验收清单"里安卓侧跑一遍

## 提交与发版

单提交 `fix(mobile)`，走同一 PR → deploy/production 流程发版（发版前先给你看真机效果也可以，由你定）。