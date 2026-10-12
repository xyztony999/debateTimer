# PageSpec — C-02 控制端（计时页增强：控制会话 + 自由辩论）

| 属性 | 值 |
|------|-----|
| 版本 | v1.2 |
| 日期 | 2026-10-12（v1.0：2026-10-10） |
| 模块编码 | C-02（含 C-01-03 交互） |
| App | 辩论赛计时器（debatetimer.tonyxyz.com） |
| 用户类型 | 计时操作员（认证） |
| 业务类型 | 业务流程类（轻量实时型） |
| 页面类型 | `code`（实时计时交互，非标准列表/表单页） |
| 栈适配说明 | 本栈为 react-vite-web（React 19 + MUI + react-router v7 + i18next）；SCM vue 组件映射（ScmListPage 等）不适用，以 MUI 等价组件标注 |

## 1. 模块元信息

| 项 | 值 |
|----|-----|
| 路由 | `/timer`（既有页面增强，不新增路由） |
| 页面组件 | `src/DebateTimer.jsx`（shareToken=null 即控制端形态） |
| 新增服务依赖 | `POST/DELETE /api/configurations/:name/session`、`PUT …/session/state`（apiClient 封装进 `ConfigurationService` 或新 `TimerSessionService`） |
| 权限 | 认证用户（页面本身匿名可用，仅会话功能要求登录 + 本人配置） |

## 2. Action 定义

| Action Key | 触发 | 行为 | 对应接口 | 权限 |
|-----------|------|------|---------|------|
| session/start | 「开启大屏同步」按钮 | 开启控制会话；成功后进入已连接态并开始上报 | POST #1 | owner |
| session/stop | 「结束同步」按钮 | 结束会话并停止上报 | DELETE #2 | owner |
| session/copyUrl | 「复制大屏链接」按钮 | 复制 `displayUrl` 到剪贴板，toast 确认 | — | owner |
| report/snapshot | 计时状态变化 + 2s 心跳 | 组装快照上报（seq++），失败静默重试一次后置「信号弱」 | PUT #3 | owner（会话内） |
| timer/toggleAff 等 | 既有按钮/快捷键 | 既有行为不变；`free` 模式下叠加自动切换（BR-8/9） | — | 页面级 |

## 3. 字典 Key 清单（i18next 新增）

| Key | zh-Hans | en | fr-CA |
|-----|---------|-----|-------|
| timer.session.start | 开启大屏同步 | Start display sync | Démarrer la synchro écran |
| timer.session.stop | 结束同步 | Stop sync | Arrêter la synchro |
| timer.session.active | 大屏同步中 | Display synced | Écran synchronisé |
| timer.session.weak | 信号弱 | Weak signal | Signal faible |
| timer.session.ended | 同步已结束 | Sync ended | Synchro terminée |
| timer.session.enableShareFirst | 请先在设置中开启分享 | Enable sharing in settings first | Activez le partage dans les paramètres |
| timer.session.copyUrl | 复制大屏链接 | Copy display link | Copier le lien écran |
| timer.setting.free | 自由辩论 | Free debate | Débat libre |
| timer.free.locked | 自由辩论环节已结束 | Free debate concluded | Débat libre terminé |

## 4. 页面结构（区块级）

### 4.1 会话控制条（新增区块，置于阶段下拉栏右侧）

- `Chip`（状态）：未开启（灰）/ 大屏同步中（绿，含在线大屏数提示）/ 信号弱（橙）/ 已结束（灰）
- `Button` 开启大屏同步（未开启态）｜ 结束同步 + 复制大屏链接（已连接态）
- 加载态：按钮 disabled + CircularProgress（R3 异步反馈）
- 错误态：Snackbar 展示 message（403/409/400 分别见 API 3.4.2）

### 4.2 计时主体（既有布局扩展）

| stageMode | 布局 | 说明 |
|-----------|------|------|
| single | 既有单计时布局 | 不变 |
| double | 既有双计时布局 | 不变 |
| free | 双计时布局 + 活跃方高亮 | 当前 `activeSide` 一侧加边框/亮度强调；双方均 0 显示「环节已结束」锁态文案 |

### 4.3 自由辩论操作区（`free` 模式）

- 显式停止一方（按钮或 A/L）→ 自动启动对方（无需二次操作）
- 一方归零 → 自动切换 + 提示音；双方归零 → 锁态 + 「重置」可解锁（BR-9）
- 快捷键沿用：A / L / Shift+Q / Shift+O（语义见 README 既有定义）

## 5. 状态与反馈

| 状态 | 表现 |
|------|------|
| 会话未开启 | 会话条灰色初始态；计时行为与现状完全一致 |
| 已连接 | 绿 Chip；每次操作后快照上报（seq++）；心跳 2s |
| 上报连续失败 ≥2 | 橙 Chip「信号弱」；本地计时不受影响 |
| 会话被 superseded / 409 | 提示后回到未开启态 |
| 页面刷新 | 重拉配置 + GET #4 判会话存续，active 则恢复已连接态续操作 |

## 6. 路由定义

| 路由 | 组件 | 变更 |
|------|------|------|
| `/timer` | DebateTimer | 增强（会话条 + free 模式） |
| `/settings` | DebateSetting | 变更：阶段编辑「计时模式」Select 增加选项「自由辩论」（select-pool: stageTimingMode）；旧值展示兼容 |

## 7. 全局一致性

- 全部新文案经 i18n 三语言齐备（§3），不硬编码（栈规约）
- 暗色模式：会话条/高亮/锁态均适配明暗两主题（frontend-rules R4）
- 接口地址经服务模块（`apiClient`），禁止组件内字面量（R2）
- 异步操作均有加载/错误反馈（R3）

## 8. 版本与变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-10-10 | 初稿：控制端会话条、free 模式布局与操作、i18n key、路由变更 |
| v1.1 | 2026-10-12 | 重构落地：页面组件改为 `src/TimerControlPage.jsx`（MUI 控制台布局：AppBar + 阶段时间线 + 底部操作栏），路由 `/`；本节未单独成稿，行为契约（Action/状态/反馈）不变 |
| v1.2 | 2026-10-12 | 增量：融合式阶段导航（见 §9）；用户线上反馈时间线靠左/裁切/标题重复突兀 |

## 9. v1.2 增量：融合式阶段导航（2026-10-12）

**背景**：控制台上线后用户反馈——阶段时间线 16 个胶囊从容器左缘排起、右侧溢出横滑裁切，与下方居中时钟轴线错位；下方大标题与时间线当前项重复显示同一阶段名；胶囊宽窄随名称长短参差，观感突兀。

**设计决策**：

| # | 决策 | 内容 |
|---|------|------|
| D1 | 删除重复标题行 | 移除时钟区上方的 `h5` 阶段名标题；阶段名由时间线选中胶囊承载 |
| D2 | 等宽胶囊铺满 | 未选中胶囊 `flex: 1 1 0`（等宽铺满容器，两端对齐），名称截断（ellipsis）+ `title` 全名提示；**选中胶囊加宽**（flex-grow 放大）显示完整阶段名、字重 700、维持现高亮样式 |
| D3 | 当前项居中视口 | 阶段切换后选中胶囊平滑滚动至时间线水平居中（`scrollIntoView({ inline: 'center' })`），修复"比赛进行到中后段时当前项滚出视口" |
| D4 | 移动端回退 | <768px 胶囊恢复自然宽度 + 横滑 + `justify-content: safe center`（居中对齐不裁左缘），等宽在该宽度不可用 |
| D5 | 语境按钮行 | 试铃按钮（sound_check）/ 自动推进倒计时（Alert）合并为时钟区上方一行，居中，仅在存在时渲染 |

**不变项**：Action/接口/i18n 无变更；tablist/tab 语义（aria-selected）保留；触屏适配（bundle D 口径）保留。

**验收标准**：

- [ ] 时间线与容器两端对齐，无右侧空白或固定裁切感
- [ ] 仅选中胶囊显示完整阶段名（其余截断 + title 提示）
- [ ] 切换阶段后选中胶囊位于时间线可视中心（可滚动时）
- [ ] sound_check 试铃与自动推进倒计时显示于时钟上方一行
- [ ] <768px 回退为自然宽度横滑居中；触屏 ≥44px 口径不回退

> 校验说明：v1.2 增量沿用 v1.0 校验口径（FX 清单按节人工核对），新增验收 5 条如上。

> 校验说明：本栈无 check.sh 机械脚本，FX 清单按节人工核对——模块元信息（FX-001~005）✓、
> Action 定义（FX-006~016）✓ 含接口映射与权限、字典 Key（FX-017~020）✓ 三语言齐备、
> 路由（FX-122~125）✓、全局一致性（FX-126~137）✓；列表/表单/详情节（FX-021~121）不适用于
> `code` 型页面，以区块级结构替代并逐项给出状态反馈。
