# API 设计文档 — C-02-07 遥控指令通道（双模遥控增量）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 待评审 |
| 模块编码 | C-02-07（核心业务域-实时协同展示） |
| 关联变更 | 基于 api-timer-session.md v1.0（会话/快照/SSE 既有契约全部沿用） |
| 日期 | 2026-10-12 |
| 输入 | prd/remote-command.md v1.0 |

## 1. 模块设计概述

### 1.1 业务背景及目标

双模遥控：电脑（控制台）为计时主机时，手机遥控器以瘦客户端工作——按钮操作转指令
经服务端转发至主机执行，计时权威始终在主机（消除手机后台节流硬伤）。指令确认 =
主机执行后的快照回流（seq 变化），不另建 ack。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 本模块负责 | 指令接收（owner 鉴权）、会话内指令队列（保序）、经既有 SSE hub 以新事件 `command` 推送至订阅端 |
| 本模块不负责 | 指令语义解释与执行（主机端前端映射引擎动作）；遥控端状态呈现（复用快照流）；快照通道（既有） |
| 存储边界 | 进程内存（随会话，不落库，重启失效——与会话一致） |

### 1.3 设计决策

| # | 决策 | 理由 |
|---|------|------|
| D-1 | 指令为过程数据，队列即发即弃（消费者拉走即清） | 指令时效性秒级，主机离线即失效；无持久化价值 |
| D-2 | 指令端点走 owner 鉴权（同会话三接口），不开放给分享令牌持有者 | 防止拿到大屏链接的观众操控计时 |
| D-3 | 主机端经既有 `/api/display/:token/stream` 接收 `command` 事件（复用 D-6 单连接原则） | 接收是只读、无敏感写入；避免新开 owner 专用流 |
| D-4 | 队列上限 32 条，超出拒绝（429 语义以业务码返回） | 防失控遥控器刷爆；正常操作远达不到 |
| D-5 | 指令携带单调 `commandSeq`（会话级） | 前端可丢弃重复/乱序（SSE 重连重放场景） |

## 2. 跨聚合根设计

不适用（单聚合根控制会话的扩展属性，无新聚合根）。

## 3. 接口规范（增量）

### 3.1 新增端点

`POST /api/configurations/:name/session/command` [操作员]

- 鉴权：`requireAuth` + owner 校验 + CSRF（同会话三接口）
- 请求体：

```json
{ "type": "start | stop | reset | toggle | applyStage", "side": "aff | neg | single（applyStage 外必填）", "stageId": "string（applyStage 携带）" }
```

`type` 为正交动词 + `side` 目标：`toggle` 覆盖遥控器布局的一键对切（主机按自身状态定向），`start`/`stop` 覆盖控制台的分离按钮，`reset`/`applyStage` 通用。

- 行为：校验 type 枚举与参数 → 会话不存在/失活返回 404 业务失败 → 入队（`commandSeq` 自增）→ `sse.sendToToken(token, 'command', payload)` 即刻推送 → 返回 `{ commandSeq }`
- 队列满（>32）返回业务失败 `TOO_MANY_COMMANDS`
- `applyStage` 的 `stageId` 必须属于会话 `stageIds`（防越权阶段注入）

### 3.2 会话对象扩展（内存）

```js
session.lastCommandSeq = 0        // 单调指令序号
session.pendingCommands = []      // 未被拉走的指令（SSE 直推后即清；作为离线缓冲）
```

### 3.3 SSE 事件增量

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `command` | `{ commandSeq, type, side?, stageId?, at }` | 经既有 display 流下发；主机端按 commandSeq 去重后执行 |

## 4. 错误码

| 错误 | 场景 |
|------|------|
| SESSION_NOT_FOUND | 无活跃会话 |
| INVALID_COMMAND | type 非法 / side 与 type 不匹配 / applyStage 的 stageId 越界 |
| TOO_MANY_COMMANDS | 队列超限 |

## 5. 兼容性

- 旧客户端（不订阅 command）不受影响：新事件类型被 EventSource 监听器忽略
- 既有 state/session 事件与三接口零改动

## 更新记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-10-12 | 初稿：1 端点 + SSE command 事件 + 会话对象扩展 |
