# C-02 大屏同步与远程控制 API 设计 · 变更摘要

| 属性 | 值 |
|------|-----|
| 文档 | [api-C-02-大屏同步与远程控制.md](api-C-02-大屏同步与远程控制.md) v1.1 |
| 对比基线 | v1.0(2026-11-11) |
| 生成日期 | 2026-11-14 |

## 变更记录(结构化)

| 版本 | 日期 | 变更类型 | 目标节号 | 摘要 |
|------|------|---------|---------|------|
| v1.1 | 2026-11-14 | interface_added | §4.4.1/§4.4.9/§3.3/§5.1 | 新增 API-10 `POST /api/session/:name/intent`(主机操作意图上报,三段式路径):主权 sessionId 仲裁同 API-2、指令白名单域校验同 API-3、锚点域校验容错钳制;不排队不缓冲、仅推 token 流、刷新 lastSeenAt 不清 pendingCommands |
| v1.1 | 2026-11-14 | interface_added | §4.4.11a | 新增意图帧 wire schema:command 帧 + 锚点增量字段(anchorServerAt/anchorAff/anchorNeg/sessionId);消费端 localEndAt = endAtServerMs − consumerClockSkew(EMA);判别规则=command 帧含 anchorServerAt 字段 |
| v1.1 | 2026-11-14 | event_changed | §4.5/§4.4.10 | SSE `command` 事件载荷增量字段(意图帧);投递目标区分:遥控指令双流、意图帧仅 token 流 |
| v1.1 | 2026-11-14 | rule_changed | §1.3/§4.1 | 设计决策 D8(意图帧通道语义)/D9(快照降级对账);不变量 INV-C02-8(commandSeq 共用单调空间/不排队/仅 token 流/不清 pendingCommands) |
| v1.0 | 2026-11-11 | initial | §4.4.1 | 接口清单初始登记:9 个接口(会话五端点 + display 三端点 + 配对) |
| v1.0 | 2026-11-11 | initial | §4.4.3 | reportSnapshot 语义归档:seq 单调门槛、服务端权威归一、**sessionId 主权仲裁(409 session_taken,携带才仲裁、不携带保持 legacy)**、captureServerAt 上行补偿(≤2s 钳制)、响应 serverTime 供 NTP-lite 采样 |
| v1.0 | 2026-11-11 | initial | §4.4.7/§4.5 | SSE 快照流归档:连接即重放当前快照(state 帧打新 serverTime 戳);state/session/command/signal/change 五事件;token 流 + owner 流双流拓扑 |
| v1.0 | 2026-11-11 | initial | §4.4.8 | 配对仲裁归档:4 位码 owner-scoped 匹配,跨用户必不命中,无匹配 404 |
| v1.0 | 2026-11-11 | initial | §4.1/§4.2 | 聚合根模型:TimerSession 内存注册表(每 token 一个,惰性过期,7 条不变量);生命周期 active→ended/expired |
| v1.0 | 2026-11-11 | initial | §3.4 | 公共规范:6 组枚举池、7 行错误码表(400/401/403/404/409+session_taken/429+Retry-After/500)、6 项容量与限流配置 |

> 首次归档无「增/改/删」差量,以上按主题块登记 initial 覆盖范围,便于后续版本做节号级 diff。

## 逐章对比说明(无旧版,首版定位)

| 章节 | 本次内容 | 备注 |
|------|---------|------|
| §2 跨聚合根设计 | 不适用(单聚合根) | 裁剪并显式标注 |
| §3.3 权限模型 | 会话端点 owner-only(管理员不代控)、配对认证、display 匿名限流 | |
| §4.1 表结构 | 无数据库表,纯内存注册表 | 零 SQL/DDL |
| §4.4.10 | wire schema:TimerSnapshot 发布语言 | API-1/2/7/8 共用 |
| 路由归属 | 会话端点物理在 configurations 路由,语义归 C-02 | 文档头声明,归档如实记录 |

## 变更类型词汇表

| 变更类型 | 含义 | 需要目标节号 |
|---------|------|------------|
| `initial` | 首次生成 | 否 |
| `structural` | 章节增删/重组 | 否 |
| `interface_added` / `interface_changed` / `interface_removed` | 接口增删改 | 是 |
| `enum_value_added` / `enum_value_changed` | 枚举增改 | 是 |
| `state_added` / `state_changed` / `flow_added` / `flow_changed` | 状态/流转增删改 | 是 |
| `rule_added` / `rule_changed` | 规则增删改 | 是 |
| `event_added` / `event_changed` | 事件增删改 | 是 |

## 版本号规则

次版本(+0.1)随接口契约变更(端点/请求响应字段/SSE 帧结构/错误码)递增;wire schema 破坏性变更(字段语义不兼容)升主版本;枚举值新增按 `enum_value_added` 登记并升次版本。
