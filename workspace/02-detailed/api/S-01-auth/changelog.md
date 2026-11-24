# S-01 账号与准入 API 设计 · 变更摘要

| 属性 | 值 |
|------|-----|
| 文档 | [api-S-01-auth.md](api-S-01-auth.md) v1.1 |
| 对比基线 | v1.0（2026-11-11，逆向归档） |
| 生成日期 | 2026-11-24 |
| 变更主题 | R20：两步验证（TOTP）、隐私告知与同意、登录后门控、登录类审计事件 |

## 变更记录（结构化）

| 版本 | 日期 | 变更类型 | 目标节号 | 摘要 |
|------|------|---------|---------|------|
| v1.1 | 2026-11-24 | interface_added | §4.4「TOTP-VERIFY」「TOTP-RECOVER」 | 新增二次验证接口（三段式 `/api/auth/totp/*`）：口令通过后持预登录凭据提交 6 位动态口令或恢复码，成功才建立会话；每账号 15 分钟 5 次失败，两种方式共用计数；动态口令以 `lastUsedStep` 条件更新防重放，恢复码以 `$pull` 保证一次性 |
| v1.1 | 2026-11-24 | interface_added | §4.4「TOTP-STATUS」「TOTP-SETUP」「TOTP-CONFIRM」「TOTP-DISABLE」 | 新增两步验证管理接口：状态查询、开始绑定（返回 otpauth 链接与 Base32 密钥）、确认绑定（返回一次性恢复码，并让其他设备下线；与登录二次验证共用每账号 15 分钟 5 次的失败计数，口令不匹配返回带 `data.attemptsRemaining` 的 401，达到上限返回 429）、关闭（仅普通用户，需密码）；开启与关闭需「近期密码证明」 |
| v1.1 | 2026-11-24 | interface_added | §4.4「PRIVACY-NOTICE」「PRIVACY-CONSENT」 | 新增隐私说明读取（三段式 `/api/privacy/notices/current`，按语言下发纯文本）与同意提交（`/api/privacy/consent/accept`，版本不符返回 409 并带 code） |
| v1.1 | 2026-11-24 | interface_changed | §4.4「REGISTER」 | 请求体新增必填 `agree`、`privacyVersion`；新增 400（未同意）与 409（版本不是当前版本）；账号文档写入 `privacy`；写 `registered`、`privacy_consented` 两条审计事件 |
| v1.1 | 2026-11-24 | interface_changed | §4.4「LOGIN」 | 已启用两步验证的账号改为返回 `{status:'totp_required', ticket}` 且不签发会话；未配置主密钥时 503；登录失败与成功写审计事件 |
| v1.1 | 2026-11-24 | interface_changed | §4.4「REGISTER」「LOGIN」「ME」 | 会话响应统一为「会话用户」结构：在 `publicUser` 之上追加 `status` 与 `pending`（待办步骤数组） |
| v1.1 | 2026-11-24 | field_added | §4.1 | users 新增可选子文档 `totp`（AES-256-GCM 密文三件套、绑定时间、已用时间步、恢复码散列、待确认绑定）与 `privacy`（版本、时间） |
| v1.1 | 2026-11-24 | rule_added | §3.5（新节） | 登录后门控：待办步骤按请求实时派生，全局中间件强制，七条放行路径；存量会话不销毁 |
| v1.1 | 2026-11-24 | rule_added | §1.3、§3.4、§4.1 | 设计决策 D8–D16；不变量 I7–I13；失败包络的可选 `code` 字段；新增环境变量 `TOTP_SECRET_KEY` 与三个限流参数及其未配置时的行为 |
| v1.1 | 2026-11-24 | state_added | §4.2、§4.3 | 登录流程（口令 → 二次验证 → 会话）、两步验证绑定状态；新增「登录（含二次验证）」「两步验证绑定」两个子流程 |
| v1.1 | 2026-11-24 | enum_added | §3.4 | EP-IDENT-05~09、EP-AUDIT-03（已入 enum-pool.md v1.2） |
| v1.1 | 2026-11-24 | event_added | §4.5 | 注册、登录、两步验证、隐私同意五类审计事件接入 P-04 |
| v1.1 | 2026-11-24 | rule_changed | §1.3-D12、§3.2、§3.4、§4.4「TOTP-CONFIRM」、§4.5 | 代码阶段修订（v1.1 尚未发布，就地修订）：绑定确认 TOTP-CONFIRM 纳入按账号的二次验证尝试限流，与 TOTP-VERIFY、TOTP-RECOVER 共用同一账号的失败计数；其 401 响应新增 `data.attemptsRemaining`，新增 429（带 `Retry-After`）；口令不匹配时写审计事件 `totp_failed`（actor 与 subject 均为本人），确认成功时清零该账号的计数 |
| v1.0 | 2026-11-11 | initial | §4.4 | 接口清单初始登记：7 个接口（STATUS、REGISTER、LOGIN、LOGOUT、ME、REG-GET、REG-PUT） |
| v1.0 | 2026-11-11 | initial | §4.1 | 账号、会话、注册开关的领域模型与不变量 I1–I6 |
| v1.0 | 2026-11-11 | initial | §3.4 | 公共规范：3 组枚举、错误码语义表 |

## 逐章对比说明（相对 v1.0）

| 章节 | v1.0 | v1.1 | 变化性质 |
|------|------|------|---------|
| §1.1 | 注册、登录、注册开关 | 追加两步验证、隐私告知、审计事件 | 补充 |
| §1.2 | 边界 | 追加做什么的三项与不做的新边界（管理员重置归 D-01、审计存储归 P-04） | 补充 |
| §1.3 | D1–D7 | 追加 D8–D16 | 新增 |
| §1.4 | 4 个对象、无子流程 | 追加两步验证凭据、同意记录、预登录凭据、待办步骤；两个子流程 | 新增 |
| §1.5 | 5 个外部上下文 | 追加 P-04 与 D-01（两步验证重置） | 新增 |
| §3.1 | 挂载与包络 | 追加 `/api/privacy` 前缀、失败包络的可选 `code`、`attachUser` 挂载的内部数据 | 补充 |
| §3.2 | 9 项依赖 | 追加 node:crypto、主密钥与限流环境变量、按键限流器、auditLog | 新增 |
| §3.3 | 权限矩阵 7 列 | 追加 5 列新接口 | 扩展 |
| §3.4 | 错误码 11 行、3 组枚举、既有配置项 | 错误码增加【R20】16 行；枚举增加 6 组；新增配置项表 | 扩展 |
| §3.5 | 无 | 登录后门控 | 新节 |
| §4.1 | users 6 字段、I1–I6、4 个领域服务 | users 追加 `totp`、`privacy`；不变量 I7–I13；领域服务追加 5 个；业务常量追加 10 项 | 扩展 |
| §4.2 | 账号禁用态、开关来源态 | 追加登录流程、绑定状态 | 新增 |
| §4.3 | 无子流程 | 两个子流程 | 修订 |
| §4.4 | 7 个接口 | 15 个接口；REGISTER、LOGIN、ME 三个接口详情变化 | 扩展 |
| §4.5 | 无领域事件 | 追加审计事件清单 | 新增 |
| §5.2 | 3 个集合的操作 | 追加 users 的 6 种条件更新、sessions 的 deleteMany、audit_logs 的 insertOne | 扩展 |
| §5.3 | 3 个索引 | 不变 | 无 |

## 与其他模块的衔接

| 对方模块 | 衔接内容 | 对方文档 |
|---------|---------|---------|
| D-01 权限与用户治理 | 管理员重置他人两步验证（A7），复用本模块导出的 `removeTotp` | D-01 API v1.1 §4.4.2 A7 |
| P-04 审计日志 | 本模块各写入点调用 `recordAudit`；向其提供 `PRIVACY_NOTICE_VERSION` 供 `consentOf` 使用 | P-04 API §4.4.5 |
| P-02 接口防护 | 隐私说明接口的按 IP 限流；二次验证的按账号尝试限流 | P-02 API v1.1 §4.4.1 |
| P-03 离线应用壳 | 登录页是 Lighthouse 预算的实际占用页面，二次验证步骤与隐私说明弹窗须按需加载 | R20 §9.6 |

## 变更类型词汇表

| 变更类型 | 含义 | 需要目标节号 |
|---------|------|------------|
| `initial` | 首次生成 | 否 |
| `structural` | 章节增删或重组 | 否 |
| `interface_added` / `interface_changed` / `interface_removed` | 接口增删改 | 是 |
| `field_added` / `field_changed` / `field_removed` | 字段增删改 | 是 |
| `enum_added` / `enum_value_added` / `enum_value_changed` | 枚举增删改 | 是 |
| `state_added` / `state_changed` / `flow_added` / `flow_changed` | 状态或流转增删改 | 是 |
| `rule_added` / `rule_changed` | 规则增删改 | 是 |
| `event_added` / `event_changed` | 领域事件增删改 | 是 |

## 版本号规则

次版本（+0.1）随接口契约变化递增；wire 结构出现语义不兼容的变化时升主版本。v1.1 中 REGISTER 新增必填字段对旧客户端不兼容，但旧客户端会收到明确的 400 提示且发布窗口很短，按次版本登记。
