# API 设计文档 — S-03 比赛记录（match-logs）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 待评审 |
| 模块编码 | S-03（支撑业务域） |
| 日期 | 2026-10-11 |
| 输入 | PRD match-records.md v1.0 + 领域模型 match-record.md v1.0 |

## 1. 模块设计概述

### 1.1 业务背景及目标

为计时操作员沉淀可复盘的比赛记录：一次性提交、只读消费、CSV/JSON 导出。目标：低干扰采集
（前端本地累计）+ 简单存储（单集合 append-only）。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 负责 | 记录的创建/查询/导出/删除与载荷校验 |
| 不负责 | 计时采集逻辑（前端 C-01 联动）；模板存在性校验（BB-6 快照） |
| 存储 | 新集合 `match_logs`（首个业务新集合）；索引 `{ownerId:1, savedAt:-1}` |

### 1.3 设计决策

| # | 决策 | 理由 |
|---|------|------|
| BD-1 | 一次性 POST 提交（无逐事件写入） | 采集在前端，服务端零高频写 |
| BD-2 | configName/teamNames/阶段定义全快照 | 记录独立存续，模板可删改 |
| BD-3 | 无 update 端点 | append-only 防篡改（B-C3） |
| BD-4 | 导出为独立 GET 附件端点 | 浏览器下载语义（Content-Disposition） |
| BD-5 | 汇总 summary 提交时服务端计算 | 不信任客户端派生值 |

### 1.4 领域对象总览

聚合根 MatchRecord；内嵌实体 StageActual[]；值对象 summary/模板快照。见领域模型文档。

### 1.5 上下文映射

| 对端 | 模式 | 契约 |
|------|------|------|
| 权限域 | 遵奉者 | requireAuth + owner 隔离（admin 代查同 configurations 惯例） |
| 流程模板域 | 解耦 | 仅前端提交快照，服务端不回查 |

## 2. 跨聚合根设计

不适用（单聚合根）。

## 3. 应用/基础设施层设计

### 3.1 接口规范

REST；`/api/match-logs`；JSON 信封；写操作经全局 CSRF（Origin 校验）。

### 3.2 依赖与约束

新路由 `server/routes/matchLogs.js`，挂载 `app.use('/api/match-logs', …)`（requireAuth）。

### 3.3 权限模型

| 角色 | 能力 |
|------|------|
| 操作员 | 本人记录增删查导 |
| 管理员 | 查/导任意（?ownerId=）；不代删（与配置代管对齐：删除仅 owner） |
| 观众 | 无 |

### 3.4 公共规范

错误码：400（载荷非法/超限）、401、403（非本人删除）、404（不存在）。无新枚举（mode 复用 stageTimingMode）。

## 4. 聚合根详细设计：MatchRecord

### 4.1 领域模型（`match_logs` 集合）

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| ownerId | ObjectId | ✓ | 取自会话 |
| configName | string | ✓ | 1–100 字符 |
| teamNames | {aff?,neg?} | 否 | 各 ≤20 |
| startedAt / endedAt | long | ✓ | endedAt ≥ startedAt；≤ now+60s 容差 |
| savedAt | long | ✓ | 服务端盖戳 |
| stages | array | ✓ | 0–64 条；单条结构见下 |

StageActual：

| 字段 | 类型 | 校验 |
|------|------|------|
| stageId / label | string | stageId 1–64；label ≤100 |
| mode | stageTimingMode | 枚举 |
| plannedSeconds | int | 1–3600 |
| graceSeconds | int | 0–300 |
| actualAffSeconds / actualNegSeconds | int | 0–86400 |
| overrunAff / overrunNeg | int ≥0 | 次数 |
| enteredAt / exitedAt | long | exitedAt ≥ enteredAt（可空=进行中） |

summary（服务端计算存储）：`{totalPlannedSeconds, totalActualSeconds, overrunCount}`。

不变量：INV-M1 创建后不可变；INV-M2 summary=stages 派生；INV-M3 stages ≤64 且载荷 ≤64KB（截断+truncated 标记）。

### 4.2 状态模型

无状态机（append-only；删除即消失）。

### 4.3 子流程

无。

### 4.4 接口设计

| # | 接口 | 方法 | 路径 | 权限 | 用户类型 |
|---|------|------|------|------|---------|
| 1 | 创建记录 | POST | `/api/match-logs` | auth+owner | [操作员] |
| 2 | 记录列表 | GET | `/api/match-logs?limit&before` | auth | [操作员][管理员] |
| 3 | 记录详情 | GET | `/api/match-logs/:id` | auth | [操作员][管理员] |
| 4 | 导出 | GET | `/api/match-logs/:id/export?format=csv\|json` | auth | [操作员][管理员] |
| 5 | 删除 | DELETE | `/api/match-logs/:id` | auth+owner | [操作员] |

**#1 创建** 请求体 = 领域模型字段（不含 summary/savedAt）。响应 data：`{id, savedAt, summary}`。
**#2 列表** 响应 data：`{items:[{id, configName, teamNames, startedAt, endedAt, savedAt, stageCount, overrunCount}], nextBefore}`（limit 默认 20 ≤100；before=savedAt 游标）。
**#3 详情** 响应 data = 全字段。
**#4 导出** JSON 附件：`Content-Type: application/json; charset=utf-8`、`Content-Disposition: attachment`、`X-Content-Type-Options: nosniff`。CSV 由前端基于 #3 详情数据在浏览器内生成（Blob 下载，含 BOM 与单元格净化），不经服务端拼装。

> BD-6（实现期修订，Mimosa 门禁驱动）：服务端不拼装 CSV 文本——「用户来源数据→文本响应」
> 属注入高危模式；JSON 序列化由框架转义，CSV 移至客户端生成，两种格式对用户等价。
**#5 删除** 响应 data `{deleted:true}`；幂等 404。

校验规则：4.1 全表；阶段 label 服务端不过滤（快照原样）。

### 4.5 领域事件与集成

无 SSE/MQ 事件。仓储：insertOne / find / findOne / deleteOne（索引见 1.2）。

## 5. 模块清单汇总

| 项 | 值 |
|----|-----|
| 对外服务 | 5 个 REST 端点（上表） |
| 集合 | `match_logs`（新）；索引 `{ownerId:1, savedAt:-1}` |
| DDL（本栈等价） | `db.match_logs.createIndex({ownerId:1, savedAt:-1})`（启动时 ensure） |

## 6. 更新记录

| 类型 | 目标 | 说明 |
|------|------|------|
| initial | S-03 | 首次生成：MatchRecord 聚合根 + 5 端点 + match_logs 集合 |
| interface_added | #1–#5 | |
| rule_added | 载荷校验/summary 服务端派生/64 条截断 | |
