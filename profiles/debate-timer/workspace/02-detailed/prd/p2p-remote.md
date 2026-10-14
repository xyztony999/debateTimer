# PRD — P2P 遥控直连（C-02-08）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-10-14 |
| 模块编码 | C-02-08（挂载于 C-02 实时协同展示） |
| 关联 | C-02-07（指令通道与回退基线）、C-02-01（信令载体） |
| 关联 D0 | 用户确认：立项 WebRTC 直连（RC2-1）、仅同网 host 直连无 STUN/TURN（RC2-2） |

## 1. 业务目标与范围

### 1.1 业务目标（G1）

消除跨国服务器 RTT 对遥控链路的拖累：生产服务器在新加坡、设备在国内，四程中转
~0.6-1.4s。比赛现场遥控端（手机）与主机（电脑）几乎总在同一局域网——WebRTC
DataChannel 同网直连（host candidates，~5ms），指令按下即达、状态即时回流。

### 1.2 功能范围（G2）

**做什么**：
- 遥控模式进入时自动发起 WebRTC 建连：信令（offer/answer/ICE）经既有会话通道
  转发（服务器只在建连期转发握手帧）；连接建立后指令与快照副本走 DataChannel
- 指令优先级：DataChannel open → 直发；否则 → 既有 HTTP 指令（C-02-07）
- 状态回流：主机在每次快照上报的同时向 DataChannel 推送快照副本；遥控端对
  DataChannel 与 SSE 两条来源统一 adopt（先到先得，天然幂等——seq 防回退由
  adopt 内部 max 语义保证）
- 断线与回退：ICE 断开/通道关闭 → 自动回退服务器通道；直连状态在遥控端胶囊
  以小点/文案指示（直连/中转）
- 主机端零 UI：收到信令自动应答（复用主机已订阅的 display 流新增 signal 事件）

**不做什么**：
- 不配 STUN/TURN（跨网不尝试打洞——跨网直接用服务器通道）
- 不改大屏通道（本机 localhost 零延迟）与主机 UI
- 不改指令格式与鉴权模型（信令端点 owner 鉴权 + CSRF，与指令端点同构）
- 不做直连加密之外的额外安全层（DataChannel 自带 DTLS）

### 1.3 决策记录

| # | 决策 | 依据 |
|---|------|------|
| RC2-1 | 立项 WebRTC DataChannel 直连 | 用户确认；同网场景覆盖近 100% |
| RC2-2 | 仅 host candidates，无 STUN/TURN | 用户确认；实现最简，跨网回退服务器 |
| RC2-3 | 失败静默回退，功能永不劣于现状 | 渐进增强原则 |
| RC2-4 | 信令复用会话通道（POST 上行 + SSE signal 下行） | 与指令通道同构，服务端零新概念 |

## 2. 角色与对象

- 角色：计时操作员（一人双设备，同网）
- 领域对象：**零新增**。信令帧与 DataChannel 消息均为过程数据（P5 集成载荷）；
  连接状态为 P3 UI 状态。复用控制会话/指令/快照全部既有对象。

## 3. 功能需求

### FR-1 信令交换

- 新端点 `POST /api/configurations/:name/session/signal`（owner + CSRF）：
  body `{ to: 'host' | 'remote', payload: <任意 RTC 信令 JSON> }`；服务端不解释
  内容，仅经 display 流以 `signal` 事件定向转发（会话不存在返回业务失败）
- 遥控端发起（offer + ICE）、主机端应答（answer + ICE）；ICE 仅 host candidates
  （RTCPeerConnection 不配 iceServers）

### FR-2 DataChannel 消息

- 消息格式复用现有 wire 契约：指令 `{commandSeq, type, side?/stageId?/kind?, at}`
  （与 SSE command 事件同构，commandSeq 继续单调——遥控端本地计数）；快照
  `{snapshot}`（与 SSE state 同构）
- 主机端 DataChannel onmessage → 与 SSE onCommand 同一处理函数（seq 去重共用）
- 遥控端 DataChannel onmessage 快照 → adoptFromSnapshot（与 SSE onState 同路）

### FR-3 回退与状态指示

- DataChannel 未 open/closing/closed/firewall → 指令走 HTTP；遥控端胶囊后缀指示
  「直连」/「中转」（i18n 两 key）
- 会话结束：直连随之关闭（PeerConnection close），退出遥控模式语义同 C-02-07
- 主机接管/退位路径不受影响（直连属遥控模式内部通道）

## 4. 非功能需求

- 同网直连建立时间 ≤2s（信令两程跨国 ~1s 内）；建连期指令走 HTTP 不阻塞
- 直连断开→回退切换 ≤1s（iceConnectionState 监听）
- 服务端信令转发不排队、不落库（即发即弃）

## 5. 验收标准

1. 双标签同机（localhost，等价同网）：遥控模式下自动直连（胶囊指示「直连」）；
   指令端到端 <50ms（无跨国 RTT）；断网服务器仍可用（回退路径）
2. 模拟直连失败（RTCPeerConnection 不可用/信令超时 3s）：自动回退 HTTP 指令，
   胶囊指示「中转」，全功能可用
3. SSE 与 DataChannel 双来源快照并发：无状态抖动（seq 幂等）
4. 服务端：信令转发/鉴权/无会话失败 单测；lint/test/build 全绿
5. 零回归：非遥控路径（跟随/接管/大屏）行为不变

## 6. PRD 完备性自检

G1 ✅｜G2 ✅（含四不做）｜G3/G4/G5 ✅ §2（零新对象）｜T 类不适用｜N1-N3 ✅ §4
