# Workspace 索引

> 设计流水线产物索引与阶段状态。断电安全：每次阶段产物归档后更新本文件。

| 属性 | 值 |
|------|-----|
| Profile | debate-timer（react-vite-web） |
| 最后更新 | 2026-11-14 |

## 阶段状态

| 阶段 | 状态 | 产物 | 说明 |
|------|------|------|------|
| D1 架构设计 | ✅ 完成 | `00-architecture/` BA v1.0 / AA v1.1 / FL v1.1 | 初始生成（2026-11-11）；增量轮（2026-11-14，计时延迟重构）：C-01-04 告警归属操作端、C-02-02 实时跟随语义，BA 零变更 |
| D2 PRD 生成 | ✅ 完成 | 11 篇 PRD（C-01/C-02 v1.1，其余 v1.0） | 初始生成（2026-11-11）；增量轮（2026-11-14）：C-01 PRD v1.1（告警归属/RAF 渲染/BR-C01-14）、C-02 PRD v1.1（D40 意图帧/D41 对账降频/D42 渲染管线，量化验收）；领域模型零变更 |
| D3 API 设计 | ✅ 完成 | 11 模块 13 文档（C-01/C-02 v1.1，其余 v1.0） | 初始生成（2026-11-11）；增量轮（2026-11-14）：C-02 API v1.1（API-10 意图上报端点/意图帧 wire schema/INV-C02-8）、C-01 API v1.1（事件消费分流/RAF 渲染管线）；P-01 评估无需变更 |
| D4 交互设计 | ✅ 完成 | 8 篇交互文档（timer-console/display-follow v1.1，其余 v1.0） | 初始生成（2026-11-11）；增量轮（2026-11-14）：display-follow（意图帧跟随/声音面板仅回退态/weak 判定）、timer-console（意图上报/对账节拍/告警归属语义） |
| Gate 1 门控 | ✅ PASS（增量轮） | `05-reports/gate1-incremental-timer-refactor.md` | 2026-11-14 增量轮 PASS（S1~S8 全过，风险备忘 R-1~R-3 转 Gate 2）；全量补档轮见门控记录 |
| B 后端代码 | ✅ 完成（增量轮） | `server/lib/timerSessions.js`（reportIntent）、`server/routes/intent.js`（POST /api/session/:name/intent）、`server/index.js` 挂载 | 2026-11-14：意图端点+锚点钳制+共享 commandSeq+仅 token 流广播；单测 9 项+路由集成 2 项，服务端全量 109 pass |
| F 前端代码 | ✅ 完成（增量轮） | `src/timer/intentCodec.js`（+planIntentReplay）、`src/timer/useRafReadout.js`（新）、`src/timer/useDebateTimer.js`（意图镜像挂点/BR-C01-14 事件分流）、`src/timer/useTimerSessionSync.js`（意图上报/意图帧重放/5s 对账）、`src/timer/snapshotCodec.js`（isSmoothAdoptable 抽取+grace 判定修复）、`src/components/TimerBox.jsx`（memo）、`src/TimerDisplayPage.jsx`（声音入口收敛/预建元素）、`src/TimerControlPage.jsx`（预建元素）、`e2e/display.e2e.js`（v1.1 断言） | 2026-11-14：D40 意图上报（dispatch 白名单镜像，fire-and-forget）+跟随端意图帧重放（commandSeq 去重/代际守卫/绝对锚换算/R-1 遥控帧忽略）；D41 心跳 1s→5s 对账；D42 RAF 帧循环直读锚点（state+ref 双轨+引用稳定+bailout）；BR-C01-14 跟随态过滤 sound/voice/overrun；投屏页声音入口仅回退态；顺带修复原 wireClose 在 grace 期拿 remaining(0) 比 graceLeft 的笔误。全量 bun test 245 pass（前端 136+服务端 109）/lint 0 error/E2E 19/19 |
| Gate 2 门控 | ✅ PASS（增量轮） | 全量验证见更新记录 2026-11-14（F 行）：245 单测全绿+R-1/R-2/R-3 关键用例（`src/timer/intentReplay.test.js` 12 项+`src/timer/useRafReadout.test.js` 9 项）+E2E 19/19+SSE 每标签恒 1 条（未新增流）+409 仲裁由对账心跳单一 yield 路径兜底 | R-1/R-2/R-3 全过；量化验收（≤500ms/≤100ms/无回跳）机制就位，端到端数值待真实双端联调观测 |

## 文档清单

| 文档 | 位置 | 版本 | 状态 |
|------|------|------|------|
| 业务架构（BA） | [00-architecture/business-arch.md](00-architecture/business-arch.md) | v1.0 | 稳定 |
| 应用架构（AA） | [00-architecture/application-arch.md](00-architecture/application-arch.md) | v1.1 | 稳定（增量：告警归属/实时跟随语义） |
| 功能清单（FL） | [00-architecture/function-list.md](00-architecture/function-list.md) | v1.1 | 稳定（增量：告警备注/跟随呈现功能点） |
| C-01 比赛计时 PRD（核心域） | [02-detailed/prd/C-01-比赛计时-prd.md](02-detailed/prd/C-01-比赛计时-prd.md) | v1.1 | 稳定（增量：告警归属操作端/RAF 渲染/事件分流） |
| C-02 大屏同步与远程控制 PRD（核心域） | [02-detailed/prd/C-02-大屏同步与远程控制-prd.md](02-detailed/prd/C-02-大屏同步与远程控制-prd.md) | v1.1 | 稳定（增量：D40 意图帧同步/D41 对账降频/量化验收） |
| S-01 账号与准入 PRD（支撑域） | [02-detailed/prd/S-01-账号与准入.md](02-detailed/prd/S-01-账号与准入.md) | v1.0 | 稳定 |
| S-02 赛制模板管理 PRD（支撑域） | [02-detailed/prd/S-02-赛制模板管理.md](02-detailed/prd/S-02-赛制模板管理.md) | v1.0 | 稳定 |
| S-03 模板广场 PRD（支撑域） | [02-detailed/prd/S-03-模板广场.md](02-detailed/prd/S-03-模板广场.md) | v1.0 | 稳定 |
| S-04 比赛记录与复盘 PRD（支撑域） | [02-detailed/prd/S-04-比赛记录与复盘.md](02-detailed/prd/S-04-比赛记录与复盘.md) | v1.0 | 稳定 |
| D-01 用户治理（系统组） | [02-detailed/prd/D-01-user-governance.md](02-detailed/prd/D-01-user-governance.md) | v1.0 | 稳定 |
| D-02 系统设置（系统组） | [02-detailed/prd/D-02-system-settings.md](02-detailed/prd/D-02-system-settings.md) | v1.0 | 稳定 |
| P-01 实时通道（系统组） | [02-detailed/prd/P-01-realtime-channel.md](02-detailed/prd/P-01-realtime-channel.md) | v1.0 | 稳定 |
| P-02 API 防护（系统组） | [02-detailed/prd/P-02-api-protection.md](02-detailed/prd/P-02-api-protection.md) | v1.0 | 稳定 |
| P-03 离线壳（系统组） | [02-detailed/prd/P-03-offline-shell.md](02-detailed/prd/P-03-offline-shell.md) | v1.0 | 稳定 |
| 知识库·业务概念 | [profiles/debate-timer/knowledge/business-concepts/index.md](../profiles/debate-timer/knowledge/business-concepts/index.md) | v1.0 | 稳定 |
| 知识库·设计决策 | [profiles/debate-timer/knowledge/design-decisions/index.md](../profiles/debate-timer/knowledge/design-decisions/index.md) | v1.0 | 稳定 |
| 知识库·服务池 | [profiles/debate-timer/knowledge/service-pool/index.md](../profiles/debate-timer/knowledge/service-pool/index.md) | v1.0 | 稳定 |
| 知识库·架构选型 | [profiles/debate-timer/knowledge/architecture-choices/index.md](../profiles/debate-timer/knowledge/architecture-choices/index.md) | v1.0 | 稳定 |
| 知识库·来源索引 | [profiles/debate-timer/knowledge/source-index.md](../profiles/debate-timer/knowledge/source-index.md) | v1.0 | 稳定 |
| C-01 比赛计时 API 设计（核心域） | [02-detailed/api/C-01-比赛计时/api-C-01-比赛计时.md](02-detailed/api/C-01-比赛计时/api-C-01-比赛计时.md) | v1.1 | 稳定（增量：事件消费分流/RAF 渲染） |
| C-01 比赛计时 API 变更摘要（核心域） | [02-detailed/api/C-01-比赛计时/changelog.md](02-detailed/api/C-01-比赛计时/changelog.md) | v1.1 | 稳定 |
| C-02 大屏同步与远程控制 API 设计（核心域） | [02-detailed/api/C-02-大屏同步与远程控制/api-C-02-大屏同步与远程控制.md](02-detailed/api/C-02-大屏同步与远程控制/api-C-02-大屏同步与远程控制.md) | v1.1 | 稳定（增量：API-10 意图端点/意图帧 schema） |
| C-02 大屏同步与远程控制 API 变更摘要（核心域） | [02-detailed/api/C-02-大屏同步与远程控制/changelog.md](02-detailed/api/C-02-大屏同步与远程控制/changelog.md) | v1.1 | 稳定 |
| S-01 账号与准入 API 设计（支撑域） | [02-detailed/api/S-01-auth/api-S-01-auth.md](02-detailed/api/S-01-auth/api-S-01-auth.md) | v1.0 | 稳定 |
| S-02 赛制模板管理 API 设计（支撑域） | [02-detailed/api/S-02-configurations/api-S-02-configurations.md](02-detailed/api/S-02-configurations/api-S-02-configurations.md) | v1.0 | 稳定 |
| S-03 模板广场 API 设计（支撑域） | [02-detailed/api/S-03-gallery/api-S-03-gallery.md](02-detailed/api/S-03-gallery/api-S-03-gallery.md) | v1.0 | 稳定 |
| S-04 比赛记录与复盘 API 设计（支撑域） | [02-detailed/api/S-04-matchlogs/api-S-04-matchlogs.md](02-detailed/api/S-04-matchlogs/api-S-04-matchlogs.md) | v1.0 | 稳定 |
| D-01 权限与用户治理 API 设计（系统组） | [02-detailed/api/D-01-admin/api-D-01-admin.md](02-detailed/api/D-01-admin/api-D-01-admin.md) | v1.0 | 稳定 |
| D-02 系统配置 API 设计（系统组） | [02-detailed/api/D-02-settings/api-D-02-settings.md](02-detailed/api/D-02-settings/api-D-02-settings.md) | v1.0 | 稳定 |
| P-01 实时通信通道 API 设计（系统组） | [02-detailed/api/P-01-realtime-channel/api-P-01-realtime-channel.md](02-detailed/api/P-01-realtime-channel/api-P-01-realtime-channel.md) | v1.0 | 稳定 |
| P-02 接口防护 API 设计（系统组） | [02-detailed/api/P-02-api-protection/api-P-02-api-protection.md](02-detailed/api/P-02-api-protection/api-P-02-api-protection.md) | v1.0 | 稳定 |
| P-03 离线应用壳 API 设计（系统组） | [02-detailed/api/P-03-offline-shell/api-P-03-offline-shell.md](02-detailed/api/P-03-offline-shell/api-P-03-offline-shell.md) | v1.0 | 稳定 |
| 枚举池（enum-pool） | [01-solution/common-spec/enum-pool.md](01-solution/common-spec/enum-pool.md) | v1.1 | 稳定（+4 派生枚举） |
| 跨模块通用枚举（common-enums） | [01-solution/common-spec/common-enums.md](01-solution/common-spec/common-enums.md) | v1.0 | 稳定 |
| 选择池（select-pool） | [01-solution/common-spec/select-pool.md](01-solution/common-spec/select-pool.md) | v1.0 | 稳定 |
| API 路径规范 | [01-solution/common-spec/api-path-rules.md](01-solution/common-spec/api-path-rules.md) | v1.0 | 稳定 |
| 计时控制台 PageSpec（操作员） | [02-detailed/interaction/timer-operator/timer-console/timer-console.md](02-detailed/interaction/timer-operator/timer-console/timer-console.md) | v1.1 | 稳定（增量：意图上报/对账节拍/告警归属） |
| 遥控器布局 PageSpec（操作员） | [02-detailed/interaction/timer-operator/remote-controller/remote-controller.md](02-detailed/interaction/timer-operator/remote-controller/remote-controller.md) | v1.0 | 稳定 |
| 大屏跟随页 PageSpec（大屏观众） | [02-detailed/interaction/screen-audience/display-follow/display-follow.md](02-detailed/interaction/screen-audience/display-follow/display-follow.md) | v1.1 | 稳定（增量：意图帧跟随/声音面板仅回退态） |
| S-02 赛制模板管理 交互设计（注册用户） | [02-detailed/interaction/registered-user/S-02-configurations/S-02-configurations.md](02-detailed/interaction/registered-user/S-02-configurations/S-02-configurations.md) | v1.0 | 稳定 |
| S-03 模板广场 交互设计（注册用户） | [02-detailed/interaction/registered-user/S-03-gallery/S-03-gallery.md](02-detailed/interaction/registered-user/S-03-gallery/S-03-gallery.md) | v1.0 | 稳定 |
| S-04 比赛记录与复盘 交互设计（注册用户） | [02-detailed/interaction/registered-user/S-04-matchlogs/S-04-matchlogs.md](02-detailed/interaction/registered-user/S-04-matchlogs/S-04-matchlogs.md) | v1.0 | 稳定 |
| 管理后台页 PageSpec（管理员） | [02-detailed/interaction/admin/admin-page/admin-page.md](02-detailed/interaction/admin/admin-page/admin-page.md) | v1.0 | 稳定 |
| 登录页 PageSpec（访客） | [02-detailed/interaction/guest/login/login.md](02-detailed/interaction/guest/login/login.md) | v1.0 | 稳定 |

## 架构速览

- **L2（业务阶段）**：赛前筹备 / 赛中执行 / 赛后复盘
- **L3（6 项）**：账号与准入、赛制模板管理、模板广场（赛前）｜比赛计时 ⭐、大屏同步与远程控制 ⭐（赛中）｜比赛记录与复盘（赛后）
- **应用域（DDD 四层）**：核心（C-01 计时、C-02 协同）/ 支撑（S-01~S-04）/ 基础数据（D-01、D-02）/ 平台支撑（P-01~P-03）
- **用户类型（5 类）**：计时操作员 / 注册用户 / 管理员 / 访客 / 大屏观众
- **模块编码**：`X-MM-SS-NN`；API 设计文件夹前缀 `<X>-<MM>-名称`
- **API 路径规则**：既有路径豁免（现网事实不改）、新增接口一律三段式 `/api/<域>/<资源>/<操作>`——见 [api-path-rules.md](01-solution/common-spec/api-path-rules.md)

## 目录结构（规划）

```
workspace/
├── INDEX.md                      ← 本文件
├── 00-architecture/              ← D1 产物（已就绪）
├── 01-solution/common-spec/      ← 枚举池/通用枚举/选择池（D3 前建立）
├── 02-detailed/
│   ├── prd/                      ← D2 产物
│   ├── api/                      ← D3 产物（按 <X>-<MM>-名称 分文件夹）
│   └── interaction/              ← D4 产物
└── 05-reports/                   ← 报告归档
```

## 门控记录（gates）

| 门控 | 判定 | 日期 | 报告 | 待确认项 |
|------|------|------|------|---------|
| gate1（设计→代码，增量轮：计时延迟重构） | PASS | 2026-11-14 | [05-reports/gate1-incremental-timer-refactor.md](05-reports/gate1-incremental-timer-refactor.md) | 无；设计风险备忘 R-1~R-3（commandSeq 游标/意图丢失兜底/旧主机兼容）随 Gate 2 用例验证 |
| gate1（设计→代码，全量补档） | WARN → 已处置（2026-11-11 三项修复完毕） | 2026-11-11 | [05-reports/gate1-full-backfill.md](05-reports/gate1-full-backfill.md) | W-1/W-2/W-3 均已修复（处置记录见报告附录）：S-02 PRD §3.1 表述修订、7 篇 API 文档 EP 编号回填 + 4 个派生枚举入池（EP-IDENT-04/EP-CONFIG-08/EP-SESSION-12/EP-SESSION-13）、路径规则固化 `01-solution/common-spec/api-path-rules.md`；I-1 锚点笔误顺手修复 |

## 更新记录

| 日期 | 更新 |
|------|------|
| 2026-11-14 | **增量轮代码阶段完成（B+F+Gate 2）**：B 后端（意图端点/锚点钳制/仅 token 流）+ F 前端（D40 意图上报与重放/D41 5s 对账/D42 RAF 渲染/BR-C01-14 事件分流/声音入口收敛）全部落盘；断点续跑审计确认 TimerSessionService.reportIntent 半成品自洽无重复接线；Gate 2 验证：bun test 245 pass/0 fail（含 R-1/R-2/R-3 关键用例 21 项）、lint 0 error、E2E 19/19（display 套件同步 v1.1 语义并修复 mock 保真度）、SSE 每标签恒 1 条；待用户确认后交付（Mimosa 钩子在位，未 commit） |
| 2026-11-14 | **增量轮启动（计时延迟重构 + 投屏声音归属）**：D0 需求澄清完成（症状=两端秒数不齐/回跳+操作传播滞后+弱网冻结跳变；范围=同步链路重构（命令+锚，快照降级对账）+渲染层 RAF 重构；声音归控制端；验收=操作≤500ms/相位差≤100ms/无回跳）；D1 变更管理完成（AA v1.1/FL v1.1 文字级微调，BA 零变更，领域划分未动无需 doccenter）；D2 增量完成（C-01/C-02 PRD v1.1，决策编号 D40/D41/D42，领域模型零变更）；D3 增量完成（C-02 API v1.1 新增 API-10 意图端点+意图帧 schema、C-01 API v1.1 事件分流+RAF 管线，P-01 评估无需变更）；D4 增量完成（timer-console/display-follow PageSpec v1.1） |
| 2026-11-11 | Gate 1 三项 WARN 处置完毕（主会话裁决 proceed=true 后修复）：W-1 S-02 PRD 表述修订、W-2 枚举池 +4 派生枚举（v1.1）+ 7 篇 API 文档 EP 回填、W-3 api-path-rules.md 固化；I-1 锚点笔误修复；处置记录见 Gate 报告附录 |
| 2026-11-11 | Gate 1 执行完成（validation）：判定 WARN（可继续），报告归档 05-reports/gate1-full-backfill.md，gates.gate1 已记录 |
| 2026-11-11 | D1 完成：三文档初始生成并归档，建本索引 |
| 2026-11-11 | D2 完成：11 篇 PRD（核心域 C-01/C-02、支撑域 S-01~S-04、系统组 D-01/D-02、P-01~P-03）归档至 02-detailed/prd/，知识库 5 文档同步更新 |
