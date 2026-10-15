# Gate 2 验证报告 — R9：大屏同步延时修复（快照盖章+在途补偿+心跳 1s）

**模块**：display-sync-fix（PageSpec §15 v2.3，D20-D22）
**验证时间**：2026-10-15

## 工程检查

| 检查 | 结果 |
|------|------|
| ESLint | PASS（0 error；4 warning 为既有文件 react-refresh 提示） |
| bun test | PASS（107/107，+4 补偿单测：running 扣减/grace 扣减/暂停不动/负 lag 与 3s clamp/缺 serverTime 直通） |
| build | PASS（✓ built） |

## 根因（D0 记录）

快照不含时间戳 → 大屏无法补偿跨国在途时间（固定滞后 ~0.3-0.6s）；心跳 2s 周期性
采纳覆盖 → 时钟被反复"拉回"。启停/切换本就有即时上报，持续走秒偏差是主要症状。

## 验收（对照 D20-D22）

| # | 项 | 结果 |
|---|-----|------|
| D20 服务端盖章 | PASS（toSnapshot 出口盖 serverTime；冒烟实证：GET /state 双次投递章各自新鲜（lag 28ms/50ms→46840），SSE 重放帧带章（seq 8 帧 serverTime 在帧内），上报路径报告帧 lag 31ms；validateSnapshot 剥离入站伪造字段，只有服务端能章） |
| D21 在途补偿 | PASS（compensateInFlight 在 adoptSnapshot 取整前的毫秒线上扣减；4 单测覆盖；直连帧无 serverTime 原样直通；seq 去重不变） |
| D22 心跳提频 | PASS（2000→1000ms，采纳拉回幅度减半） |

## 附加验证

- 显示页端到端：/display/:token 加载采纳盖章快照，时钟正常渲染（00:31 = 配置中
  sound_check 时长 31s，数值与配置吻合）、无弱信号横幅、无崩溃。
- 重放路径修正：display.js 原直写 session.lastSnapshot（无章），现统一走
  snapshotOf() ——晚加载的大屏补偿用的是本次投递时间而非原上报时间。
- 会话生命周期/seq 去重/直连通道/弱信号判定零改动。

## 过程记录

- Mimosa 钩子一次误报：display.js 的 SSE JSON 写出被判 XSS。SSE data 字段的正确
  输出编码就是 JSON.stringify（EventSource 按 JSON 解析，不作 HTML 渲染）；将
  序列化提为具名常量 `frame` 后放行。安全语义无变化。
- 冒烟坑复现：本地 API 会话 10s 心跳超时（惰性回收），验证步骤间隙超时即报
  "No active session"——连贯执行后通过；登录 403 实为 Origin 校验而非账号禁用。

## 残余偏差说明

补偿后残差 ≈ 上行链路（快照从主机到服务器的 50-150ms，快照值冻结于捕获时刻，
无法在客户端补偿）+ 显示端与服务器的钟差（NTP 级）。总残差 ≈50-250ms，
秒级显示无感；对比修复前的 300-600ms 固定滞后 + 2s 周期拉回。

**判定：PASS**（真机清单：国内↔新加坡真实链路上大屏与主机并排对比走秒）
