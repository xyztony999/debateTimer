# PageSpec — C-01-08 移动遥控器布局（操作端手机竖屏形态）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-10-12 |
| 模块编码 | C-01-08 |
| App | 辩论赛计时器（debatetimer.tonyxyz.com） |
| 用户类型 | 计时操作员（认证） |
| 业务类型 | 呈现层增强（复用 C-01/C-02 全部业务行为） |
| 页面类型 | `code`（实时计时交互的移动形态变体） |
| 栈适配说明 | react-vite-web：React 19 + MUI；`useMediaQuery('(max-width:600px) and (orientation: portrait)')` 控制形态切换；复用 `useDebateTimer` 运行时与 `TimerBox` 状态语义 |

## 1. 模块元信息

| 项 | 值 |
|----|------|
| 路由 | `/`（既有控制端路由的竖屏形态变体，不新增路由） |
| 页面组件 | `src/TimerControlPage.jsx`（内部按媒体查询切换遥控器布局分支） |
| 服务依赖 | **零新增**。复用：`POST/DELETE /api/configurations/:name/session`、`PUT …/session/state`、配置/SSE 既有端点、`POST /api/match-logs` |
| 触发条件 | 视口宽 ≤600px 且 portrait → 遥控器布局；否则控制台布局（FR-1） |
| 权限 | 同控制端（ProtectedRoute） |

## 2. Action 定义（全部映射既有原语）

| Action Key | 触发 | 行为 | 映射 |
|-----------|------|------|------|
| remote/toggleSingle | 巨型主钮（single） | 播放/暂停切换 | `TOGGLE single`（= 桌面空格） |
| remote/resetSingle | 次级重置钮 | 重置当前钟 | `RESET single` |
| remote/hitSide | 双大钮（free） | 点正在发言方=停该方（自动起对方）；点未发言方=启动该方 | 运行中→`STOP side`；停止→`START side`（= 桌面 A/L） |
| remote/toggleSide | 双侧钮（double） | 各侧启停 | `START/STOP side` |
| remote/resetSide | 各侧重置次级钮 | 重置该侧 | `RESET side` |
| remote/selectStage | 阶段横滑条 | 切换阶段并重置上下文 | `APPLY_STAGE`（= 桌面时间线点击） |
| remote/menu/* | ☰ 菜单项 | 开启/停止同步、复制链接、保存记录、设置/记录/广场/管理、语言/主题/登出/安装 | 与控制台 ☰ 完全同构 |

> 对切无二次确认：误触可立即再点回（对切代价对称）；重置保留在次级位避免误清。

## 3. 字典 Key 清单（i18next 新增）

| Key | zh-Hans | en | fr-CA |
|-----|---------|-----|-------|
| timer.remote.affSpeaking | 正方发言 | Aff. speaking | Parle (aff.) |
| timer.remote.negSpeaking | 反方发言 | Neg. speaking | Parle (nég.) |
| timer.remote.pressToStart | 点击开始 | Tap to start | Toucher pour démarrer |

其余文案全部复用既有 key（timer.op.* / timer.free.locked / timer.advanceCountdown / timer.graceHint / session 系列）。

## 4. 页面结构（区块级，自上而下）

```
┌─────────────────────────────┐
│ ① 紧凑顶栏：🎯 + [同步胶囊] + ☰ │  AppBar（xs 文字截断同控制台）
├─────────────────────────────┤
│ ② 双钟条：[正·队名 00:00] [反·队名 00:00] │  缩小版双钟（tb-compact），
│                             │  宽限橙显/锁死红闪/30s 闪烁沿用
├─────────────────────────────┤
│ ③ 语境位：阶段名（+试铃钮/+推进横幅） │  高度最小化
├─────────────────────────────┤
│                             │
│ ④ 主操作区（屏高 ≥55%）        │  single: 巨型 ▶/⏸ 主钮(≥88px 高,
│                             │   全宽) + 次级 ↺
│                             │  double: [▶ 正] [▶ 反] 半屏钮 + 各侧 ↺
│                             │  free:   [▶ 正方发言] [▶ 反方发言]
│                             │   半屏大钮对切，发言方高亮；双尽→置灰+锁态
├─────────────────────────────┤
│ ⑤ 阶段横滑条（拇指区）          │  复用 st- 时间线（触屏 ≥44px）
└─────────────────────────────┘
```

### 4.1 双钟条（新紧凑组件语义）

- 复用引擎派生态：`phase/graceLeft/blinking` 驱动小钟类名（不新建时间逻辑）
- 单计时阶段：两格仍显示（正=当前钟，反格显示同一钟镜像，与桌面单钟语义差异以阶段名+主钮消歧）

### 4.2 自由辩论双大钮对切（R-C2 核心）

| 状态 | 正方钮 | 反方钮 |
|------|--------|--------|
| 静止 | ▶ 正方发言（可启动） | ▶ 反方发言（可启动） |
| 正方发言中 | **高亮 ⏸（点击=停正→自动起反）** | ▶（点击=直接起反，正方继续跑的场景=仅手动双开时） |
| 该方锁死 | 置灰 + ↺ 重置入口 | 置灰 + ↺ 重置入口 |
| 双方锁死 | 双钮置灰 + `timer.free.locked` 文案 | 同左 |

### 4.3 收纳清单（☰ 菜单，与控制台同构）

开启/停止大屏同步（按会话态）、复制大屏链接、保存记录、设置、比赛记录、模板广场、管理（admin）、语言、主题、安装（PWA）、登出。快捷键帮助入口不显示（触屏无键盘，沿用 hover:none 隐藏口径）。

## 5. 状态与反馈

| 状态 | 遥控器表现 |
|------|-----------|
| 同步 active/weak | 顶栏胶囊绿/橙常显；操作即时上报（复用事件+心跳） |
| 自动推进倒计时 | 主区顶部横幅；点任意主钮取消（引擎 SET_ADVANCE null 语义） |
| 会话通知 | 顶部 Snackbar 浮层 4s（复用） |
| 旋转/缩放视口 | 形态即时切换，计时状态零丢失（同一 hook 实例） |
| 断网 | PWA 离线横幅 + 本地计时继续（复用 P-03） |

## 6. 路由定义

| 路由 | 组件 | 变更 |
|------|------|------|
| `/` | TimerControlPage | 内部新增遥控器布局分支（无新路由） |

## 7. 全局一致性

- 三语言文案齐备（§3）；暗色模式经 `body.dark-mode` 变量链生效（tb-*/st- 体系复用）
- 无接口地址字面量；无新写请求面（同步/保存复用既有 CSRF 通道）
- 安全区：顶栏 `safe-area-inset-top`、底部横滑条 `safe-area-inset-bottom`（standalone 刘幕适配）

## 8. 实现边界（代码阶段约束）

- 布局分支放 `TimerControlPage.jsx` 内（或拆 `RemoteControlLayout` 子组件于同文件），禁止新路由/新 hook 实例（避免计时状态分叉）
- 复用 `useDebateTimer` 返回的 `state/derived/actions`，禁止遥控器分支自持计时状态
- 触屏媒体查询口径（hover:none）继续隐藏键盘提示

## 9. 版本与变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-10-12 | 初稿：R-C1~R-C4 决策落地为区块级规格 |

> 校验说明：FX 清单按节人工核对通过；`code` 型页面，列表/表单/详情节不适用。
