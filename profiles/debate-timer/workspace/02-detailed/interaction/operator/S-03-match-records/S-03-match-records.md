# PageSpec — S-03 比赛记录（控制端：计时页保存入口 + /records 列表与详情）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-10-11 |
| 模块编码 | S-03-01~04 |
| 用户类型 | 计时操作员（管理员代查） |
| 业务类型 | 台账（列表/详情/导出）+ 采集入口（code） |
| 页面类型 | `config`（列表/详情）+ `code`（采集入口） |

## 1. 路由与页面

| 路由 | 组件 | 说明 |
|------|------|------|
| `/records` | `src/RecordsPage.jsx`（新，MUI） | 列表 |
| `/records/:id` | `src/RecordDetailPage.jsx`（新，MUI） | 详情+导出+删除 |
| `/timer` | DebateTimer 增强 | 「保存记录」按钮（会话条旁） |

导航入口：计时页/设置页导航栏新增「比赛记录」（认证用户可见）。

## 2. 计时页增量（S-03-01）

- 采集缓冲：内存累计（PRD FR-B1）；页面刷新即清（PRD §10 已声明）
- 「💾 保存记录」按钮：位于会话条右侧；点击提交 POST #1 → toast 成功/失败（失败保留缓冲+重试提示）
- 控制会话结束（主动停止/失活）→ 自动提交（默认开；会话条下拉不做开关，跟随会话）
- 无活跃采集时按钮 disabled（首阶段进入前）

## 3. 列表页 `/records`（S-03-02）

查询条件：无（自有记录降序）；管理员可经 `?ownerId=` 代查（URL 直达，页面不提供选择器）。

| 列 | 类型 | 宽度 | 说明 |
|----|------|------|------|
| 保存时间 | text(datetime) | 180 | savedAt |
| 模板 | text | 160 | configName |
| 队名 | text | 180 | 「A vs B」（缺省 正 vs 反） |
| 阶段数 | 数值 | 80 | stageCount |
| 超时数 | 数值（>0 标橙） | 80 | overrunCount |
| 操作 | action | — | 详情（行点击）/ 删除 |

- 分页：`加载更多`（游标 nextBefore；无总页数）
- 加载态：Skeleton；错误态：Alert + 重试按钮（R3）
- 空态：引导文案「完成一场比赛后，在计时页保存记录」

## 4. 详情页 `/records/:id`（S-03-02/03/04）

Card 1 比赛信息：模板/队名/起止时间/汇总（计划总秒/实际总秒/超时次数）
Card 2 阶段表格：

| 列 | 说明 |
|----|------|
| # | 序号 |
| 阶段 | label（快照） |
| 模式 | 单/双/自由辩论 |
| 计划 | mm:ss |
| 实际（正/反） | mm:ss / mm:ss（单计时反方显示 —） |
| 超时 | ✓ 标记（正/反分别，Chip 红色） |

按钮区：`导出 CSV` `导出 JSON`（下载附件）｜ `删除`（ConfirmDialog，红）→ 返回列表。

## 5. Action 定义

| Action Key | 行为 | 接口 |
|-----------|------|------|
| matchLogs/save | 提交采集缓冲 | POST #1 |
| matchLogs/list | 拉取列表（游标） | GET #2 |
| matchLogs/detail | 拉取详情 | GET #3 |
| matchLogs/export | 下载 CSV/JSON | GET #4（window 打开） |
| matchLogs/delete | 确认后删除 | DELETE #5 |

## 6. 字典 Key（i18n，三语言）

records.title / records.empty / records.savedAt / records.template / records.teams /
records.stageCount / records.overruns / records.detail / records.planned / records.actual /
records.overrun / records.exportCsv / records.exportJson / records.deleteConfirm /
records.save / records.saved / records.saveFailed / records.retryHint /
timer.saveRecord 等。

## 7. 全局一致性

- MUI 组件 + 暗色主题（R4）；下载经服务端附件端点（不经前端拼 CSV，保真一致）
- 服务地址经服务模块（新 `MatchLogService`，R2）；加载/错误/空三态齐备（R3）

## 8. 版本与变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-10-11 | 初稿：保存入口、列表/详情/导出/删除、Action 与 i18n |

> FX 适配说明同前（react-vite-web 栈；人工清单核对）。
