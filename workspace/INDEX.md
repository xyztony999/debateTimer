# Workspace 索引

> 设计流水线产物索引与阶段状态。断电安全：每次阶段产物归档后更新本文件。

| 属性 | 值 |
|------|-----|
| Profile | debate-timer（react-vite-web） |
| 最后更新 | 2026-11-11 |

## 阶段状态

| 阶段 | 状态 | 产物 | 说明 |
|------|------|------|------|
| D1 架构设计 | ✅ 完成 | `00-architecture/` 三文档 v1.0 | BA→AA→FL 初始生成，G4 全局检查通过（2026-11-11） |
| D2 PRD 生成 | ✅ 完成 | `02-detailed/prd/` 11 篇 PRD v1.0 | 输入：FL 功能点；另更新知识库 5 文档（2026-11-11） |
| D3 API 设计 | ✅ 完成 | `02-detailed/api/` 11 模块 13 文档 + `01-solution/common-spec/` 3 文档 v1.0 | 输入：PRD + 领域模型；核心域 C-01/C-02 附 changelog（2026-11-11） |
| D4 交互设计 | ✅ 完成 | `02-detailed/interaction/` 8 篇交互文档 v1.0 | 输入：API 文档；按用户类型生成并归档（2026-11-11） |
| Gate 1 门控 | ✅ WARN 已处置 | `05-reports/gate1-full-backfill.md` | 2026-11-11 全量执行：G1-01~G1-11 无 CRITICAL 失败；3 项 WARN 已全部修复（见门控记录与报告处置附录） |

## 文档清单

| 文档 | 位置 | 版本 | 状态 |
|------|------|------|------|
| 业务架构（BA） | [00-architecture/business-arch.md](00-architecture/business-arch.md) | v1.0 | 稳定 |
| 应用架构（AA） | [00-architecture/application-arch.md](00-architecture/application-arch.md) | v1.0 | 稳定 |
| 功能清单（FL） | [00-architecture/function-list.md](00-architecture/function-list.md) | v1.0 | 稳定 |
| C-01 比赛计时 PRD（核心域） | [02-detailed/prd/C-01-比赛计时-prd.md](02-detailed/prd/C-01-比赛计时-prd.md) | v1.0 | 稳定 |
| C-02 大屏同步与远程控制 PRD（核心域） | [02-detailed/prd/C-02-大屏同步与远程控制-prd.md](02-detailed/prd/C-02-大屏同步与远程控制-prd.md) | v1.0 | 稳定 |
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
| C-01 比赛计时 API 设计（核心域） | [02-detailed/api/C-01-比赛计时/api-C-01-比赛计时.md](02-detailed/api/C-01-比赛计时/api-C-01-比赛计时.md) | v1.0 | 稳定 |
| C-01 比赛计时 API 变更摘要（核心域） | [02-detailed/api/C-01-比赛计时/changelog.md](02-detailed/api/C-01-比赛计时/changelog.md) | v1.0 | 稳定 |
| C-02 大屏同步与远程控制 API 设计（核心域） | [02-detailed/api/C-02-大屏同步与远程控制/api-C-02-大屏同步与远程控制.md](02-detailed/api/C-02-大屏同步与远程控制/api-C-02-大屏同步与远程控制.md) | v1.0 | 稳定 |
| C-02 大屏同步与远程控制 API 变更摘要（核心域） | [02-detailed/api/C-02-大屏同步与远程控制/changelog.md](02-detailed/api/C-02-大屏同步与远程控制/changelog.md) | v1.0 | 稳定 |
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
| 计时控制台 PageSpec（操作员） | [02-detailed/interaction/timer-operator/timer-console/timer-console.md](02-detailed/interaction/timer-operator/timer-console/timer-console.md) | v1.0 | 稳定 |
| 遥控器布局 PageSpec（操作员） | [02-detailed/interaction/timer-operator/remote-controller/remote-controller.md](02-detailed/interaction/timer-operator/remote-controller/remote-controller.md) | v1.0 | 稳定 |
| 大屏跟随页 PageSpec（大屏观众） | [02-detailed/interaction/screen-audience/display-follow/display-follow.md](02-detailed/interaction/screen-audience/display-follow/display-follow.md) | v1.0 | 稳定 |
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
| gate1（设计→代码，全量补档） | WARN → 已处置（2026-11-11 三项修复完毕） | 2026-11-11 | [05-reports/gate1-full-backfill.md](05-reports/gate1-full-backfill.md) | W-1/W-2/W-3 均已修复（处置记录见报告附录）：S-02 PRD §3.1 表述修订、7 篇 API 文档 EP 编号回填 + 4 个派生枚举入池（EP-IDENT-04/EP-CONFIG-08/EP-SESSION-12/EP-SESSION-13）、路径规则固化 `01-solution/common-spec/api-path-rules.md`；I-1 锚点笔误顺手修复 |

## 更新记录

| 日期 | 更新 |
|------|------|
| 2026-11-11 | Gate 1 三项 WARN 处置完毕（主会话裁决 proceed=true 后修复）：W-1 S-02 PRD 表述修订、W-2 枚举池 +4 派生枚举（v1.1）+ 7 篇 API 文档 EP 回填、W-3 api-path-rules.md 固化；I-1 锚点笔误修复；处置记录见 Gate 报告附录 |
| 2026-11-11 | Gate 1 执行完成（validation）：判定 WARN（可继续），报告归档 05-reports/gate1-full-backfill.md，gates.gate1 已记录 |
| 2026-11-11 | D1 完成：三文档初始生成并归档，建本索引 |
| 2026-11-11 | D2 完成：11 篇 PRD（核心域 C-01/C-02、支撑域 S-01~S-04、系统组 D-01/D-02、P-01~P-03）归档至 02-detailed/prd/，知识库 5 文档同步更新 |
