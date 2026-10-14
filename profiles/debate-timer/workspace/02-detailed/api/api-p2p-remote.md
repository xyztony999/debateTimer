# API 设计文档 — C-02-08 P2P 遥控直连（信令转发增量）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 待评审 |
| 模块编码 | C-02-08 |
| 关联变更 | 基于 api-remote-command.md v1.1（指令/快照契约完全复用） |
| 日期 | 2026-10-14 |
| 输入 | prd/p2p-remote.md v1.0 |

## 1. 模块设计概述

服务器仅承担 WebRTC 一次性信令中转（国内设备 ↔ 海外服务器只在建连期通信）；
连接建立后指令与快照经 DataChannel 直连，不再经过服务器。

### 设计决策

| # | 决策 | 理由 |
|---|------|------|
| D-1 | 信令不解释、不排队、不落库（透明转发） | RTC 信令是瞬时握手帧，语义在前端；服务器零新概念 |
| D-2 | 复用 display 流新增 `signal` 事件（与 command 事件同构） | 主机/遥控均已订阅该流，零新连接 |
| D-3 | to 字段定向（host/remote），服务端只按订阅广播由前端自筛 | display 流本身按 token 定向，to 再由消息路由字段区分 |

## 2. 接口规范（增量）

`POST /api/configurations/:name/session/signal` [操作员]

- 鉴权：requireAuth + owner + CSRF（同指令端点）
- 请求体：`{ "to": "host" | "remote", "payload": { ...RTC 信令任意 JSON } }`
- 行为：会话活跃 → `sse.sendToToken(token, 'signal', { from, to, payload })`
  → 返回 `{ relayed: true }`；无会话 → 业务失败（404 语义）
- payload 上限 32KB（单帧 offer/answer 足够，防滥用）

### SSE 事件增量

| 事件名 | 载荷 | 说明 |
|--------|------|------|
| `signal` | `{ from: 'host'|'remote', to: 'host'|'remote', payload }` | 接收端按 to 自筛；旧客户端忽略 |

## 3. 兼容性

- 不监听 `signal` 的旧客户端不受影响；指令/快照/会话契约零改动

## 更新记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-10-14 | 初稿：1 信令端点 + SSE signal 事件 |
