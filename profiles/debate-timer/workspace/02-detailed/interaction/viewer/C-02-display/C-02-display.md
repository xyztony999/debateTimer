# PageSpec — C-02 显示端（大屏跟随 / 独立模式）

| 属性 | 值 |
|------|-----|
| 版本 | v1.1 |
| 日期 | 2026-10-11（v1.0：2026-10-10） |
| 模块编码 | C-02 |
| App | 辩论赛计时器（debatetimer.tonyxyz.com） |
| 用户类型 | 观众（匿名） |
| 业务类型 | 业务流程类（轻量实时型，只读消费侧） |
| 页面类型 | `code`（实时渲染 + 插值，非标准列表/表单页） |
| 栈适配说明 | react-vite-web：React 19 + MUI 主题变量 + i18next；SCM 组件映射不适用 |

## 1. 模块元信息

| 项 | 值 |
|----|-----|
| 路由 | `/display/:token`（既有页面增强） |
| 页面组件 | `src/DisplayTimer.jsx` → `DebateTimer shareToken` |
| 服务依赖 | `GET /api/display/:token`（既有）、`GET /api/display/:token/state`（#4）、`GET /api/display/:token/stream`（#5，扩展事件） |
| 权限 | 匿名，仅 token 可见性；**跟随模式严格只读（BR-5）** |

## 2. Action 定义

无用户 Action（只读页）。系统内部行为：

| 行为 Key | 触发 | 行为 |
|---------|------|------|
| bootstrap | 初载 | GET 配置 → GET #4 → active ? 跟随模式 : 独立模式 |
| applySnapshot | SSE `state` 事件 / #4 拉取 | 校准钟偏（serverTime）并整体替换快照（seq 防回退） |
| interpolate | 250ms 本地节拍 | 按 `runningAff/Neg` 递减对应剩余毫秒；下限 0（BR-6） |
| onSessionEvent | SSE `session` 事件 | ended/expired → 提示横幅 + 回退独立模式（保留最后画面） |
| onStale | >5s 无新快照 | 顶部「信号弱」标注，继续插值（NFR-2） |
| onReconnect | EventSource 自动重连 | 重连成功 → GET #4 全量校准一次（NFR-4） |

## 3. 字典 Key 清单（i18next 新增）

| Key | zh-Hans | en | fr-CA |
|-----|---------|-----|-------|
| display.following | 正在大屏跟随 | Live from controller | Diffusion en direct |
| display.weakSignal | 信号弱 | Weak signal | Signal faible |
| display.sessionEnded | 同步已结束，已切换为独立计时 | Sync ended — standalone mode | Synchro terminée — mode autonome |
| display.free.locked | 自由辩论环节已结束 | Free debate concluded | Débat libre terminé |

## 4. 页面结构（区块级）

### 4.1 状态横幅（新增，页面顶部细条）

| 模式 | 表现 |
|------|------|
| 跟随中 | 绿色细条「正在大屏跟随」；信号弱时切换为橙色 |
| 回退提示 | 会话结束横幅 8 秒后自动收起，页面转为独立模式（可继续手动操作） |
| 独立模式 | 无横幅（与现状一致） |

### 4.2 计时渲染主体

| stageMode | 渲染 |
|-----------|------|
| single | 既有单计时布局（只读跟随或独立可操作两态） |
| double | 既有双计时布局 |
| free | 双计时布局 + `activeSide` 高亮当前发言方；双方归零显示锁态文案 |

### 4.3 提示告警（C-01-05 展示侧）

- 30 秒提醒 / 时间到 / 必须停：按本地插值时间触发，闪烁 + 提示音与控制端表现一致
- 跟随模式同样发声（会场可闻）
- v1.1：铃声方案与音量读取本设备提示音偏好（P-02-03）；导航区新增「提示音」入口
  （弹层：三节点方案/音量/试听，匿名可用，localStorage）

### 4.4 宽限相位呈现（v1.1 新增，C-01-06）

- 快照 `timerPhase=grace`：对应方呈现橙色宽限倒计时（`graceMs` 插值）+「收尾中」提示
- `locked`：持续红闪；旧快照无 timerPhase 时按 running 渲染（兼容）

### 4.5 队名呈现（v1.1 新增，S-01-06）

- 双计/自由辩论布局标题显示模板 `teamNames`（经配置流到达），空值回退默认称谓

### 4.4 只读守卫（BR-5）

- 跟随模式：隐藏全部计时操作按钮；快捷键监听器不绑定（空格/A/L/Shift+R 等无副作用）
- 独立模式：恢复现有匿名计时页全部操作（现状回归基线）

## 5. 状态与反馈

| 场景 | 表现 |
|------|------|
| 初载有活跃会话 | 直接进入跟随态渲染最新快照 |
| 初载无会话 | 独立模式（现状行为，FR-6 回归） |
| 断流期间 | 连续本地插值，不跳变、不黑屏（NFR-4） |
| token 失效/配置删除 | 既有 404 友好页（现状能力） |
| 旧客户端（未升级）收到 `free` | 按 double 渲染（BR-10 降级） |

## 6. 路由定义

| 路由 | 组件 | 变更 |
|------|------|------|
| `/display/:token` | DisplayTimer | 增强（状态横幅 + 跟随渲染 + 只读守卫）；路由本身不变 |

## 7. 全局一致性

- 三语言文案齐备（§3）；暗色模式跟随系统（会场多为暗环境，默认暗色友好）
- 无接口地址字面量（服务模块统一）；只读页无写请求，天然无 CSRF 面

## 8. 版本与变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-10-10 | 初稿：跟随/独立双模式、插值与恢复行为、只读守卫、i18n key |
| v1.1 | 2026-10-11 | 赛制增强包：宽限相位呈现（timerPhase/graceMs）、队名呈现、提示音本地入口（P-02-03） |

> 校验说明：同 operator PageSpec——FX 清单按节人工核对通过；列表/表单/详情节不适用 `code` 型页面。
