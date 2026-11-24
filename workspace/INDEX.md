# Workspace 索引

> 设计流水线产物索引与阶段状态。断电安全：每次阶段产物归档后更新本文件。

| 属性 | 值 |
|------|-----|
| Profile | debate-timer（react-vite-web） |
| 最后更新 | 2026-11-24 |

## 阶段状态

> 2026-11-24 增量轮 R20「安全与合规三件套」（两步验证、审计日志、隐私告知，另含应用入口页字体非阻塞加载）：设计、后端、前端与 Gate 2 全部完成，代码在工作区，**尚未提交、尚未发布**。上线前置条件见 Gate 2 报告与 R20 设计说明 §9.1。

| 阶段 | 状态 | 产物 | 说明 |
|------|------|------|------|
| D1 架构设计 | ✅ 完成 | `00-architecture/` BA v1.1 / AA v1.2 / FL v1.2 | 初始生成（2026-11-11）；增量轮（2026-11-14，计时延迟重构）：C-01-04 告警归属操作端、C-02-02 实时跟随语义，BA 零变更；增量轮（2026-11-24，R20）：BA v1.1（「账号与准入」下新增两个业务活动：两步验证、隐私告知与同意）、AA v1.2（S-01 新增子模块 2.2.1.4、2.2.1.5；D-01 功能说明补充；平台支撑域新增模块 P-04 审计日志）、FL v1.2（新增 5 个菜单项）。经临时目录模拟，`engine-cli doccenter` 只读 `profiles/debate-timer/` 下的源文件、不读顶层 `workspace/`，本轮改动前后生成结果相同，`doc-center.json` 无需再生成（本轮未触碰该文件） |
| D2 PRD 生成 | ✅ 完成 | 12 篇 PRD + 1 篇横切说明（C-01/C-02 v1.1；S-01/D-01/D-02/S-03/P-02/P-03 v1.1；P-04 v1.0；其余 v1.0） | 初始生成（2026-11-11）；增量轮（2026-11-14）：C-01/C-02 PRD v1.1（D40/D41/D42）；增量轮（2026-11-24，R20）：S-01 PRD v1.1（两步验证、隐私告知与同意、登录后门控）、D-01 v1.1（审计事件、两步验证重置、删除账号时清洗日志）、D-02 v1.1、S-03 v1.1、P-02 v1.1、P-03 v1.1（字体非阻塞加载）、P-04 审计日志 PRD v1.0（新增；代码阶段 §5.6 补「还原时复活日期」）、R20 安全与合规设计说明（新增，横切：决策 D43–D65、要求与做法对照、三语隐私说明草稿；代码阶段修订至 v1.3）；决策编号接续自 D42 |
| D3 API 设计 | ✅ 完成 | 12 模块 15 文档（C-01/C-02 v1.1；S-01/D-01/D-02/S-03/P-02/P-03 v1.1；P-04 v1.0；其余 v1.0） | 初始生成（2026-11-11）；增量轮（2026-11-14）：C-02 API v1.1、C-01 API v1.1；增量轮（2026-11-24，R20）：S-01 API v1.1（新增 8 个三段式接口、变更 REGISTER/LOGIN/ME、新节 §3.5 登录后门控，另建 changelog.md；代码阶段两处规则修订：TOTP-CONFIRM 纳入尝试限流、「先确认后绑定」由接口层保证）、P-04 API v1.0（新增：审计写入器契约与两个只读查询）、D-01 API v1.1（A7 两步验证重置、A4 执行顺序）、D-02 API v1.1、S-03 API v1.1、P-02 API v1.1、P-03 API v1.1（§4.6 字体加载契约，代码阶段修订为预加载写法）；枚举池 v1.2（新增 EP-IDENT-05~09、EP-AUDIT-01~03、EP-PROTECT-03/04）、通用枚举 v1.1、选择池 v1.1 |
| D4 交互设计 | ✅ 完成 | 9 篇交互文档（timer-console/display-follow v1.1；login/admin-page/S-02-configurations v1.1；S-01-account v1.0；其余 v1.0） | 初始生成（2026-11-11）；增量轮（2026-11-14）：timer-console/display-follow v1.1；增量轮（2026-11-24，R20）：login PageSpec v1.1（表单前隐私说明入口、注册同意、二次验证步骤）、S-01-account PageSpec v1.0（新增：`/gate` 登录后引导页、设置页「账号与安全」区块）、admin-page PageSpec v1.1（审计日志卡、注册时间与两步验证列、重置两步验证、开关最后修改人）、S-02-configurations PageSpec v1.1（登记新区块挂载点） |
| Gate 1 门控 | WARN → 已处置（2026-11-24 用户确认后进入代码阶段） | `05-reports/gate1-incremental-r20-security-trio.md` | 2026-11-24 R20：S1~S8 全过，三项必查全过（对照表 29 行 85 个定位点全部可定位；全文无结论性措辞；范围外清单 6 项），G1-01~G1-11 全过；判 WARN 仅因 8 项设计默认取舍与 2 个占位符待用户确认。同日用户裁定：八项全部按默认，留存期改为 184 天。上一轮（2026-11-14，计时延迟重构）为 PASS |
| B 后端代码 | ✅ 完成（增量轮 R20） | 新增 `server/lib/`：`totp.js`、`totpCrypto.js`、`totpStore.js`、`preloginTickets.js`、`authGates.js`、`auditLog.js`、`privacyNotices.js`；`server/routes/privacy.js`、`audit.js`；`server/scripts/reset-totp.js` 与 `scripts/lib/resetTotpAccount.js`。改动 `server/index.js`、`routes/auth.js`、`admin.js`、`gallery.js`、`configurations.js`、`lib/authMiddleware.js`、`rateLimit.js`、`rateLimits.js`、`session.js`、`scripts/backup.js`、`.env.example` | 2026-11-24：11 个新接口；登录后门控；按账号的两步验证尝试限流（验证、恢复码、绑定确认共用）；审计写入器（20 种事件白名单、184 天留存、未确认不记 IP）与两个只读查询；账号删除清洗；备份含审计集合并原时复活日期。新增 11 个测试文件，后端单测 260 pass。上一轮（2026-11-14）：意图端点+锚点钳制+共享 commandSeq+仅 token 流广播 |
| F 前端代码 | ✅ 完成（增量轮 R20） | 新增 `src/GatePage.jsx`、`src/components/account/`（两步验证面板、二维码、「我的登录记录」、隐私说明弹窗）、`src/components/admin/AuditLogCard.jsx`、`src/services/`：`accountService.js`、`auditService.js`、`privacyService.js`、`src/utils/`：`auditView.js`、`authFlow.js`、`authRedirect.js`、`safeNextPath.js`、`dateTime.js`、`clipboard.js`；端到端 `e2e/security.e2e.js`、`account-admin.e2e.js`、`fonts.e2e.js`。改动 `App.jsx`、`LoginPage.jsx`、`AdminPage.jsx`、`DebateSetting.jsx`、`ProtectedRoute.jsx`、`AuthContext.jsx`、三个语言文件、`index.html`、`package.json` 与 `bun.lock` | 2026-11-24：登录页隐私说明入口与注册同意、二次验证步骤；`/gate` 引导页；设置页「账号与安全」；后台审计日志卡、用户表两列与重置；应用入口字体非阻塞（预加载加到位切换）。前端单测 223 pass，端到端 76/76。上一轮（2026-11-14）：D40 意图上报、D41 对账降频、D42 RAF 帧循环等 |
| Gate 2 门控 | WARN（增量轮 R20：无阻断项） | `05-reports/gate2-incremental-r20-security-trio.md` | 2026-11-24：单测 483 / 0、lint 0 错误、构建通过、端到端 76 / 76、性能预算全过（性能分 0.92 / 0.88 / 0.90）；契约在真实后端与真实数据库上逐字段核对 0 不一致；存量账号首次登录 27 / 27；29 行「要求 → 做法」全部落实。判 WARN 仅因 4 项待负责人知悉：登录页脚本增量超设计内部目标、只能在上线环境验证的事项、三处覆盖率低于参考值、性能审计只在本机进行。上一轮（2026-11-14）为 PASS |

## 文档清单

| 文档 | 位置 | 版本 | 状态 |
|------|------|------|------|
| 业务架构（BA） | [00-architecture/business-arch.md](00-architecture/business-arch.md) | v1.1 | 稳定（增量：账号与准入下新增两个业务活动——两步验证、隐私告知与同意） |
| 应用架构（AA） | [00-architecture/application-arch.md](00-architecture/application-arch.md) | v1.2 | 稳定（增量：S-01 新增子模块 2.2.1.4 两步验证、2.2.1.5 隐私告知与同意；D-01 功能说明补充；平台支撑域新增 P-04 审计日志） |
| 功能清单（FL） | [00-architecture/function-list.md](00-architecture/function-list.md) | v1.2 | 稳定（增量：新增 5 个菜单项——两步验证、我的登录记录、两步验证重置、审计日志等） |
| R20 安全与合规设计说明（横切） | [02-detailed/prd/R20-安全与合规设计说明.md](02-detailed/prd/R20-安全与合规设计说明.md) | v1.3 | 设计已确认（2026-11-24）；代码阶段修订已并入（v1.2 四处、v1.3 一处，均见 Gate 2 报告）；隐私说明仍为技术事实草稿，待负责人审定 |
| C-01 比赛计时 PRD（核心域） | [02-detailed/prd/C-01-比赛计时-prd.md](02-detailed/prd/C-01-比赛计时-prd.md) | v1.1 | 稳定（增量：告警归属操作端/RAF 渲染/事件分流） |
| C-02 大屏同步与远程控制 PRD（核心域） | [02-detailed/prd/C-02-大屏同步与远程控制-prd.md](02-detailed/prd/C-02-大屏同步与远程控制-prd.md) | v1.1 | 稳定（增量：D40 意图帧同步/D41 对账降频/量化验收） |
| S-01 账号与准入 PRD（支撑域） | [02-detailed/prd/S-01-账号与准入.md](02-detailed/prd/S-01-账号与准入.md) | v1.1 | 稳定（v1.0 现网事实）+ v1.1 增量已实现、未发布（两步验证、隐私告知与同意、登录后门控） |
| S-02 赛制模板管理 PRD（支撑域） | [02-detailed/prd/S-02-赛制模板管理.md](02-detailed/prd/S-02-赛制模板管理.md) | v1.0 | 稳定 |
| S-03 模板广场 PRD（支撑域） | [02-detailed/prd/S-03-模板广场.md](02-detailed/prd/S-03-模板广场.md) | v1.1 | 稳定（增量：发布、撤回、下架写审计事件；【R20】部分已实现、未发布） |
| S-04 比赛记录与复盘 PRD（支撑域） | [02-detailed/prd/S-04-比赛记录与复盘.md](02-detailed/prd/S-04-比赛记录与复盘.md) | v1.0 | 稳定 |
| D-01 用户治理（系统组） | [02-detailed/prd/D-01-user-governance.md](02-detailed/prd/D-01-user-governance.md) | v1.1 | 增量已实现、未发布（治理动作审计事件、两步验证重置、删除账号时清洗日志） |
| D-02 系统设置（系统组） | [02-detailed/prd/D-02-system-settings.md](02-detailed/prd/D-02-system-settings.md) | v1.1 | 增量已实现、未发布（注册开关变更写审计事件） |
| P-01 实时通道（系统组） | [02-detailed/prd/P-01-realtime-channel.md](02-detailed/prd/P-01-realtime-channel.md) | v1.0 | 稳定 |
| P-02 API 防护（系统组） | [02-detailed/prd/P-02-api-protection.md](02-detailed/prd/P-02-api-protection.md) | v1.1 | 增量已实现、未发布（隐私说明接口限流、按账号的尝试限流器） |
| P-03 离线壳（系统组） | [02-detailed/prd/P-03-offline-shell.md](02-detailed/prd/P-03-offline-shell.md) | v1.1 | 增量已实现、未发布（应用入口页字体非阻塞加载；FR-4 写法在代码阶段修订） |
| P-04 审计日志 PRD（平台支撑域） | [02-detailed/prd/P-04-audit-log.md](02-detailed/prd/P-04-audit-log.md) | v1.0 | 已实现、未发布（R20 新增）：20 种事件白名单与逐条必要性、负面清单、IP 记录策略、184 天留存、账号删除清洗、读取规则；§5.6 补「还原时复活日期」 |
| 知识库·业务概念 | [profiles/debate-timer/knowledge/business-concepts/index.md](../profiles/debate-timer/knowledge/business-concepts/index.md) | v1.0 | 稳定 |
| 知识库·设计决策 | [profiles/debate-timer/knowledge/design-decisions/index.md](../profiles/debate-timer/knowledge/design-decisions/index.md) | v1.0 | 稳定 |
| 知识库·服务池 | [profiles/debate-timer/knowledge/service-pool/index.md](../profiles/debate-timer/knowledge/service-pool/index.md) | v1.0 | 稳定 |
| 知识库·架构选型 | [profiles/debate-timer/knowledge/architecture-choices/index.md](../profiles/debate-timer/knowledge/architecture-choices/index.md) | v1.0 | 稳定 |
| 知识库·来源索引 | [profiles/debate-timer/knowledge/source-index.md](../profiles/debate-timer/knowledge/source-index.md) | v1.0 | 稳定 |
| C-01 比赛计时 API 设计（核心域） | [02-detailed/api/C-01-比赛计时/api-C-01-比赛计时.md](02-detailed/api/C-01-比赛计时/api-C-01-比赛计时.md) | v1.1 | 稳定（增量：事件消费分流/RAF 渲染） |
| C-01 比赛计时 API 变更摘要（核心域） | [02-detailed/api/C-01-比赛计时/changelog.md](02-detailed/api/C-01-比赛计时/changelog.md) | v1.1 | 稳定 |
| C-02 大屏同步与远程控制 API 设计（核心域） | [02-detailed/api/C-02-大屏同步与远程控制/api-C-02-大屏同步与远程控制.md](02-detailed/api/C-02-大屏同步与远程控制/api-C-02-大屏同步与远程控制.md) | v1.1 | 稳定（增量：API-10 意图端点/意图帧 schema） |
| C-02 大屏同步与远程控制 API 变更摘要（核心域） | [02-detailed/api/C-02-大屏同步与远程控制/changelog.md](02-detailed/api/C-02-大屏同步与远程控制/changelog.md) | v1.1 | 稳定 |
| S-01 账号与准入 API 设计（支撑域） | [02-detailed/api/S-01-auth/api-S-01-auth.md](02-detailed/api/S-01-auth/api-S-01-auth.md) | v1.1 | 稳定（v1.0）+ v1.1 增量已实现、未发布（新增 8 接口、变更 3 接口、§3.5 登录后门控；代码阶段两处规则修订记入 §6） |
| S-01 账号与准入 API 变更摘要（支撑域） | [02-detailed/api/S-01-auth/changelog.md](02-detailed/api/S-01-auth/changelog.md) | v1.1 | 稳定 |
| S-02 赛制模板管理 API 设计（支撑域） | [02-detailed/api/S-02-configurations/api-S-02-configurations.md](02-detailed/api/S-02-configurations/api-S-02-configurations.md) | v1.0 | 稳定 |
| S-03 模板广场 API 设计（支撑域） | [02-detailed/api/S-03-gallery/api-S-03-gallery.md](02-detailed/api/S-03-gallery/api-S-03-gallery.md) | v1.1 | 增量已实现、未发布（发布与下架审计事件） |
| S-04 比赛记录与复盘 API 设计（支撑域） | [02-detailed/api/S-04-matchlogs/api-S-04-matchlogs.md](02-detailed/api/S-04-matchlogs/api-S-04-matchlogs.md) | v1.0 | 稳定 |
| D-01 权限与用户治理 API 设计（系统组） | [02-detailed/api/D-01-admin/api-D-01-admin.md](02-detailed/api/D-01-admin/api-D-01-admin.md) | v1.1 | 增量已实现、未发布（A7 两步验证重置、A4 执行顺序、审计事件） |
| D-02 系统配置 API 设计（系统组） | [02-detailed/api/D-02-settings/api-D-02-settings.md](02-detailed/api/D-02-settings/api-D-02-settings.md) | v1.1 | 增量已实现、未发布（PUT 写审计事件） |
| P-01 实时通信通道 API 设计（系统组） | [02-detailed/api/P-01-realtime-channel/api-P-01-realtime-channel.md](02-detailed/api/P-01-realtime-channel/api-P-01-realtime-channel.md) | v1.0 | 稳定 |
| P-02 接口防护 API 设计（系统组） | [02-detailed/api/P-02-api-protection/api-P-02-api-protection.md](02-detailed/api/P-02-api-protection/api-P-02-api-protection.md) | v1.1 | 增量已实现、未发布（L5 隐私说明限流、L6 按账号尝试限流器） |
| P-03 离线应用壳 API 设计（系统组） | [02-detailed/api/P-03-offline-shell/api-P-03-offline-shell.md](02-detailed/api/P-03-offline-shell/api-P-03-offline-shell.md) | v1.1 | 增量已实现、未发布（§4.6 字体加载的构建产物契约，代码阶段修订） |
| 审计日志 API 设计（平台支撑域） | [02-detailed/api/P-04-audit/api-P-04-audit.md](02-detailed/api/P-04-audit/api-P-04-audit.md) | v1.0 | 已实现、未发布（R20 新增）：审计写入器契约、两个只读查询接口、清洗子流程、索引 |
| 枚举池（enum-pool） | [01-solution/common-spec/enum-pool.md](01-solution/common-spec/enum-pool.md) | v1.2 | 稳定（新增 EP-IDENT-05~09、EP-AUDIT-01~03、EP-PROTECT-03/04，均已实现、未发布） |
| 跨模块通用枚举（common-enums） | [01-solution/common-spec/common-enums.md](01-solution/common-spec/common-enums.md) | v1.1 | 稳定（新增三组跨模块枚举，消费矩阵补 P-04） |
| 选择池（select-pool） | [01-solution/common-spec/select-pool.md](01-solution/common-spec/select-pool.md) | v1.1 | 稳定（+SP-12 审计事件类型筛选、SP-13 审计结果筛选） |
| API 路径规范 | [01-solution/common-spec/api-path-rules.md](01-solution/common-spec/api-path-rules.md) | v1.0 | 稳定 |
| 计时控制台 PageSpec（操作员） | [02-detailed/interaction/timer-operator/timer-console/timer-console.md](02-detailed/interaction/timer-operator/timer-console/timer-console.md) | v1.1 | 稳定（增量：意图上报/对账节拍/告警归属） |
| 遥控器布局 PageSpec（操作员） | [02-detailed/interaction/timer-operator/remote-controller/remote-controller.md](02-detailed/interaction/timer-operator/remote-controller/remote-controller.md) | v1.0 | 稳定 |
| 大屏跟随页 PageSpec（大屏观众） | [02-detailed/interaction/screen-audience/display-follow/display-follow.md](02-detailed/interaction/screen-audience/display-follow/display-follow.md) | v1.1 | 稳定（增量：意图帧跟随/声音面板仅回退态） |
| S-02 赛制模板管理 交互设计（注册用户） | [02-detailed/interaction/registered-user/S-02-configurations/S-02-configurations.md](02-detailed/interaction/registered-user/S-02-configurations/S-02-configurations.md) | v1.1 | 稳定（v1.0）+ v1.1 增量已实现、未发布（页末「账号与安全」区块挂载点，规格在 S-01-account） |
| 账号与安全 PageSpec（注册用户与管理员视角） | [02-detailed/interaction/registered-user/S-01-account/S-01-account.md](02-detailed/interaction/registered-user/S-01-account/S-01-account.md) | v1.0 | 已实现、未发布（R20 新增）：/gate 登录后引导页（隐私说明确认、管理员强制绑定）、设置页「两步验证」与「我的登录记录」 |
| S-03 模板广场 交互设计（注册用户） | [02-detailed/interaction/registered-user/S-03-gallery/S-03-gallery.md](02-detailed/interaction/registered-user/S-03-gallery/S-03-gallery.md) | v1.0 | 稳定 |
| S-04 比赛记录与复盘 交互设计（注册用户） | [02-detailed/interaction/registered-user/S-04-matchlogs/S-04-matchlogs.md](02-detailed/interaction/registered-user/S-04-matchlogs/S-04-matchlogs.md) | v1.0 | 稳定 |
| 管理后台页 PageSpec（管理员） | [02-detailed/interaction/admin/admin-page/admin-page.md](02-detailed/interaction/admin/admin-page/admin-page.md) | v1.1 | 稳定（v1.0）+ v1.1 增量已实现、未发布（审计日志卡、注册时间与两步验证列、重置两步验证、开关最后修改人） |
| 登录页 PageSpec（访客） | [02-detailed/interaction/guest/login/login.md](02-detailed/interaction/guest/login/login.md) | v1.1 | 稳定（v1.0）+ v1.1 增量已实现、未发布（表单前隐私说明入口、注册同意、二次验证步骤） |

## 架构速览

- **L2（业务阶段）**：赛前筹备 / 赛中执行 / 赛后复盘
- **L3（6 项）**：账号与准入、赛制模板管理、模板广场（赛前）｜比赛计时 ⭐、大屏同步与远程控制 ⭐（赛中）｜比赛记录与复盘（赛后）
- **应用域（DDD 四层）**：核心（C-01 计时、C-02 协同）/ 支撑（S-01~S-04）/ 基础数据（D-01、D-02）/ 平台支撑（P-01~P-04；P-04 审计日志为 R20 新增）
- **设计决策编号**：D20~D39 同步与时钟域，D40~D42 计时延迟重构，D43~D65 安全与合规轮（D43~D47 为用户裁定，D48~D65 为设计决策，清单见 [R20 设计说明](02-detailed/prd/R20-安全与合规设计说明.md) §2）
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
| gate2（代码→交付，增量轮 R20：安全三件套） | WARN（无阻断项） | 2026-11-24 | [05-reports/gate2-incremental-r20-security-trio.md](05-reports/gate2-incremental-r20-security-trio.md) | 待负责人知悉或决定 4 项：W1 登录页脚本增量 12,124 字节，超设计内部目标 3,932 字节（硬性预算余量充足）；W2 只能在上线环境验证或决定的事项（线上 MongoDB 到期删除、发布窗口、反向代理真实 IP、隐私说明生效日期与托管服务商名称、隐私说明未经法律审阅）；W3 三处覆盖率低于参考值；W4 性能审计只在本机进行。上线前置：服务器配置并离线备份 `TOTP_SECRET_KEY`、api 域名保持灰云或配置 realip、发布前备份数据库、隐私说明审定 |
| gate1（设计→代码，增量轮 R20：安全三件套） | WARN（无阻断项）→ 已处置 | 2026-11-24 | [05-reports/gate1-incremental-r20-security-trio.md](05-reports/gate1-incremental-r20-security-trio.md) | 2026-11-24 用户裁定：Q1~Q8 八项全部按默认，留存期改为 184 天。隐私说明占位符与正文审定、api 域名灰云或 realip、`TOTP_SECRET_KEY` 的配置与备份转为上线前置项。已知缺口 G-1~G-7 保持；待验证风险 R-1~R-7 的结果见 Gate 2 报告 §6 |
| gate1（设计→代码，增量轮：计时延迟重构） | PASS | 2026-11-14 | [05-reports/gate1-incremental-timer-refactor.md](05-reports/gate1-incremental-timer-refactor.md) | 无；设计风险备忘 R-1~R-3（commandSeq 游标/意图丢失兜底/旧主机兼容）随 Gate 2 用例验证 |
| gate1（设计→代码，全量补档） | WARN → 已处置（2026-11-11 三项修复完毕） | 2026-11-11 | [05-reports/gate1-full-backfill.md](05-reports/gate1-full-backfill.md) | W-1/W-2/W-3 均已修复（处置记录见报告附录）：S-02 PRD §3.1 表述修订、7 篇 API 文档 EP 编号回填 + 4 个派生枚举入池（EP-IDENT-04/EP-CONFIG-08/EP-SESSION-12/EP-SESSION-13）、路径规则固化 `01-solution/common-spec/api-path-rules.md`；I-1 锚点笔误顺手修复 |

## 更新记录

| 日期 | 更新 |
|------|------|
| 2026-11-24 | **增量轮 R20 代码阶段完成（B+F+Gate 2）**：后端 11 个新接口与审计写入器、前端登录页/引导页/设置页「账号与安全」/后台审计日志卡、应用入口字体非阻塞加载全部落盘。Gate 2 判 WARN（无阻断项）：单测 483 / 0（后端 260、前端 223）、lint 0 错误、端到端 76 / 76、性能预算全过；契约在真实后端与真实数据库上逐字段核对 0 不一致；存量账号首次登录 27 / 27。代码阶段修订：绑定确认纳入尝试限流、字体加载写法、备份还原复活日期、备份脚本导入即执行、**「先确认后绑定」改由接口层保证**（真库验证存量账号时发现，S-01 API §3.5 与 R20 设计说明 v1.3 已同步）。视觉检查修复 5 处显示问题。未提交、未推送；未触碰 .claude/* 与 doc-center.json |
| 2026-11-24 | **增量轮 R20 设计阶段完成（D0~D4 + Gate 1）**：D0 依简报落定（用户裁定 D43~D47）；D1：BA v1.1（账号与准入下新增 L4 两步验证、隐私告知与同意）、AA v1.2（S-01 新增子模块 2.2.1.4/2.2.1.5；平台支撑域新增 P-04 审计日志）、FL v1.2（新增 5 个菜单项）；D2：S-01/D-01/D-02/S-03/P-02/P-03 PRD v1.1，新增 P-04 审计日志 PRD 与 R20 安全与合规设计说明（决策 D43~D65、要求与做法对照、三语隐私说明草稿）；D3：S-01 API v1.1（新增 8 接口、变更 3 接口、登录后门控），新增 P-04 API 与 S-01 变更摘要，D-01/D-02/S-03/P-02/P-03 API v1.1，枚举池 v1.2、通用枚举 v1.1、选择池 v1.1；D4：login v1.1、admin-page v1.1、S-02-configurations v1.1，新增 S-01-account PageSpec（/gate 引导页与设置页账号与安全区块）；Gate 1 判 WARN（无阻断项，S1~S8 与三项必查全过，8 项默认取舍与 2 个占位符待用户确认），报告见 05-reports/gate1-incremental-r20-security-trio.md。未提交、未推送；未触碰 .claude/* 与 doc-center.json |
| 2026-11-14 | **增量轮代码阶段完成（B+F+Gate 2）**：B 后端（意图端点+锚点钳制+共享 commandSeq+仅 token 流广播）+ F 前端（D40 意图上报与重放/D41 5s 对账/D42 RAF 渲染/BR-C01-14 事件分流/声音入口收敛）全部落盘；断点续跑审计确认 TimerSessionService.reportIntent 半成品自洽无重复接线；Gate 2 验证：bun test 245 pass/0 fail（含 R-1/R-2/R-3 关键用例 21 项）、lint 0 error、E2E 19/19（display 套件同步 v1.1 语义并修复 mock 保真度）、SSE 每标签恒 1 条；待用户确认后交付（Mimosa 钩子在位，未 commit） |
| 2026-11-14 | **增量轮启动（计时延迟重构 + 投屏声音归属）**：D0 需求澄清完成（症状=两端秒数不齐/回跳+操作传播滞后+弱网冻结跳变；范围=同步链路重构（命令+锚，快照降级对账）+渲染层 RAF 重构；声音归控制端；验收=操作≤500ms/相位差≤100ms/无回跳）；D1 变更管理完成（AA v1.1/FL v1.1 文字级微调，BA 零变更，领域划分未动无需 doccenter）；D2 增量完成（C-01/C-02 PRD v1.1，决策编号 D40/D41/D42，领域模型零变更）；D3 增量完成（C-02 API v1.1 新增 API-10 意图端点+意图帧 schema、C-01 API v1.1 事件分流+RAF 管线，P-01 评估无需变更）；D4 增量完成（timer-console/display-follow PageSpec v1.1） |
| 2026-11-11 | Gate 1 三项 WARN 处置完毕（主会话裁决 proceed=true 后修复）：W-1 S-02 PRD 表述修订、W-2 枚举池 +4 派生枚举（v1.1）+ 7 篇 API 文档 EP 回填、W-3 api-path-rules.md 固化；I-1 锚点笔误修复；处置记录见 Gate 报告附录 |
| 2026-11-11 | Gate 1 执行完成（validation）：判定 WARN（可继续），报告归档 05-reports/gate1-full-backfill.md，gates.gate1 已记录 |
| 2026-11-11 | D1 完成：三文档初始生成并归档，建本索引 |
| 2026-11-11 | D2 完成：11 篇 PRD（核心域 C-01/C-02、支撑域 S-01~S-04、系统组 D-01/D-02、P-01~P-03）归档至 02-detailed/prd/，知识库 5 文档同步更新 |
