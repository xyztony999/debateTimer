# Gate 2 验证报告 — R3 真机反馈包 + 连接池根因修复

**模块**：pairing-and-fixes（配对码 / mp3 音频 / 单钟）+ 连接池根因修复
**扫描时间**：2026-10-14

## 工程检查

| 检查 | 结果 |
|------|------|
| ESLint | PASS（0 error） |
| bun test | PASS（103/103，+3：pairByCode owner 匹配/坏码/死会话；SSE 断言双路更新） |
| build | PASS |

## 本包三项验收

| # | 项 | 结果 |
|---|-----|------|
| FB-A 音频 | WAV 497KB → MP3 单声道 64kbps 46KB（10.7×）；soundPrefs 全部切换；wav 删除 | PASS（体积数学确定；冷缓存手感待真机） |
| FB-B 配对码 | 会话创建带 4 位码（防同码碰撞）；POST /api/session/pair owner 匹配；电脑顶栏码 + 手机菜单「连接电脑」弹窗（4 位输入/错误提示/成功即入遥控） | PASS（浏览器实测：弹窗正确关闭、错码提示、正码秒进遥控） |
| FB-C 单钟 | 遥控布局 single 模式一钟（显示阶段名）、double/free 双钟 | PASS（实测 clockCount=1） |

## 重大附带修复：SSE 连接池耗尽（跨会话根因终结）

**根因链（实证）**：浏览器同源 HTTP/1.1 连接上限 6；每条 SSE 永占 1 连接。双标签
（主机 config+display 各 1、手机 config+display 各 1）= 4 长连接 + keep-alive 短请求
→ 池满 → **全部 XHR 挂起（实测手动 XHR 超时 status 0）** → 主机心跳饿死 → 10s 会话
过期。关闭手机标签立即恢复（实测）——完整解释历史三次"主机转弱/心跳停"灵异
（Gate 2 #55 两 WARN 的根因）。

**修复**：主机 command/signal 从 display 流（第 2 连接）迁移至既有 owner config 流
（服务端 sendToOwner 双路推送 + 前端 namedEvents 挂载，连接 4→3）。

**修复后实测**：配对弹窗正确关闭（原 POST 响应饿死所致）、**WebRTC 直连成功**
（信令秒达，chip「遥控中 · 直连」）、指令执行、15s+ 存活、镜像走秒精确。

## 总结

**判定：PASS**（历史两 WARN 随根因修复关闭；真机清单仅剩音频冷缓存手感）
