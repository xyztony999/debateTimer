# PageSpec — C-01 赛制增强（设置页 / 计时页：宽限·提示音·队名·自动推进）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-10-11 |
| 模块编码 | C-01-05/06/07 + S-01-02/06 + P-02-03 |
| 用户类型 | 计时操作员（配置与操作） |
| 业务类型 | 增强迭代（react-vite-web 栈，MUI 组件映射） |
| 页面类型 | `config`（设置页表单增量）+ `code`（计时页行为增量） |

## 1. 变更页面与路由

| 路由 | 组件 | 变更类型 |
|------|------|---------|
| `/settings` | DebateSetting | 增强：阶段编辑行扩展 + 队名卡片 + 提示音卡片 |
| `/timer` | DebateTimer | 增强：宽限相位渲染、自动推进倒计时、队名标题 |
| `/display/:token` | DisplayTimer | 增强：宽限相位呈现、队名、提示音本地入口（详见 viewer PageSpec v1.1） |

## 2. 设置页增量（DebateSetting）

### 2.1 阶段编辑行扩展（既有「计时模式」卡片内）

| 字段 | 组件 | 规格 | 说明 |
|------|------|------|------|
| 宽限秒数 | MUI `TextField type=number` | min 0 / max 300 / 缺省 0，每阶段一格 | 紧随计时模式 Select；0=关闭 |
| 自动推进 | MUI `Switch` | 缺省关，每阶段一个 | 开启后阶段结束 3 秒自动切换 |

- 校验：提交前 clamp 0–300；非法输入标红（MUI error 态）并阻止保存（R3 反馈）

### 2.2 队名卡片（新增 Card）

| 字段 | 组件 | 规格 |
|------|------|------|
| 正方队名 | `TextField` | maxLength 20，placeholder=默认「正方」 |
| 反方队名 | `TextField` | maxLength 20，placeholder=默认「反方」 |

- 空值=使用默认称谓（不写入 teamNames 空串语义：空即删键）

### 2.3 提示音卡片（新增 Card，P-02-03）

三行（节点 × 控件组），恢复默认按钮置底：

| 节点 | 控件 | 规格 |
|------|------|------|
| 30 秒提醒 | `Select`（铃声方案）+ `Slider`（音量 0–100）+ `IconButton`（▶ 试听） | 即点即响 |
| 时间到 | 同上 | 默认新短铃方案 |
| 必须停 | 同上 | 默认既有长鸣 |

- 偏好写 localStorage（`timer.soundPrefs`），保存按钮不涉及（本地即时生效）
- 无加载态需求（本地同步）；试听失败静默回退默认（PRD §10）

## 3. 计时页增量（DebateTimer 控制端）

### 3.1 宽限相位渲染（C-01-06）

| 相位 | 表现 |
|------|------|
| grace（单/任一方） | 该方时间切换为宽限倒计时，橙色闪烁类 `grace-blinking`；进入时短铃 |
| locked | 持续红闪（复用 `blinking`）+ 长鸣 |

- 快照上报：`timerPhase`/`graceMs` 随每次状态变化与心跳发出

### 3.2 自动推进（C-01-07）

- 阶段彻底结束且标志开 → 顶部提示条「3 秒后进入下一阶段 · 按任意键取消」倒计时动画
- 任意 keydown/按钮/下拉交互 → 取消提示条；到时执行 `applyStage(下一阶段)`
- 末阶段不触发

### 3.3 队名标题（S-01-06）

- 双计/自由辩论布局：`<h3>` = 「正」/「反」徽标 + 队名（默认称谓回退）
- 单计时布局不受影响

## 4. Action 增量

| Action Key | 触发 | 行为 | 接口 |
|-----------|------|------|------|
| stage/save（既有） | 保存模板 | 载荷新增 stageGrace/stageAutoAdvance/teamNames | PUT #配置（扩展） |
| sounds/preview | 试听按钮 | 按方案+音量播放一次 | —（本地资产） |
| sounds/reset | 恢复默认 | 重置三节点偏好 | —（localStorage） |
| advance/cancel | 推进倒计时期间任意输入 | 取消推进 | —（本地） |

## 5. 字典 Key 增量（i18n，三语言）

`settings.graceSeconds`、`settings.autoAdvance`、`settings.teamNames`、`settings.teamAff`、
`settings.teamNeg`、`settings.soundTitle`、`settings.soundWarn30`、`settings.soundTimeUp`、
`settings.soundMustStop`、`settings.soundPreview`、`settings.soundReset`、
`timer.graceHint`（收尾中）、`timer.advanceCountdown`（{n} 秒后进入下一阶段 · 按任意键取消）、
`timer.free.locked`（沿用）等。

## 6. 全局一致性

- 新控件均适配明暗主题（MUI 主题自动 + 自定义类补暗色变体）
- 表单校验失败阻止保存并给出可见错误（R3）；宽限/队名校验与服务端规则一致（AB-1/AB-5）
- 无接口字面量（载荷经 ConfigurationService 既有 save 通道）

## 7. 版本与变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-10-11 | 初稿：设置页三处增量、计时页宽限/推进/队名、Action 与 i18n key 清单 |

> 校验说明：FX 清单人工核对（同前两份 PageSpec 适配方式）；`config` 型设置页增量含字段-组件-校验
> 三要素对齐（SaveAO=配置载荷新键）。
