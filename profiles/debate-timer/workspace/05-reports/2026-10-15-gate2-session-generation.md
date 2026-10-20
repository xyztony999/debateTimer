# Gate 2 验证报告 — R10：会话代际自愈（卡旧阶段/后台误杀/常开大屏旧代码）

**模块**：session-generation（PageSpec §16 v2.4，D23-D25）
**验证时间**：2026-10-15

## 工程检查

| 检查 | 结果 |
|------|------|
| ESLint | PASS（0 error；4 warning 为既有文件 react-refresh 提示） |
| bun test | PASS（109/109，+2 服务端换代单测：信封含 sessionId 且跨代更新、seq 归零） |
| build | PASS（✓ built） |

## 根因（D0 记录，用户选定方案 A 全套）

①重开会话服务端作废旧会话、seq 从 0 重计，而显示端 seq 去重器跨会话不重置
→ 新快照全被丢弃，大屏永久冻结旧阶段；②心跳超时 10s + 主机标签后台节流
→ 同步被误杀（"同步已结束"）；③常开大屏页面不重载永远跑旧 SW bundle，
R9 补偿到不了真机（"延时还在"）。

## 验收（对照 D23-D25）

| # | 项 | 结果 |
|---|-----|------|
| D23 会话代际 | PASS（单测：snapshotOf 信封含 sessionId、跨代更新、seq 归零；**浏览器换代自愈实证**：大屏跟随会话 A（sound_check，走到锁定 00:00）→ 重开会话 B（aff_c1，seq 归 1）→ 大屏自动跳到「正方一辩发言」，旧阶段消失、无 ended 横幅——修复前此处冻结死） |
| D24 心跳放宽 | PASS（heartbeatTimeoutMs 默认 10s→30s；后台标签常规节流（~1s）下不再误杀；单测覆盖注册表存活路径） |
| D25 PWA 自更新 | PASS（injectRegister null + index.jsx 手动 registerSW + controllerchange 重载（首访无 controller 不重载）；IAB 环境无 serviceWorker——`'serviceWorker' in navigator` 守卫保证安全跳过，构建产物含该路径；真机 SW 生效上线后观察） |

## 过程记录

- 冒烟环境重建：mongod 旧临时 dbpath 被清（exit 100）——换旧目录重建，冒烟账号
  重新注册（新库首个 register 自动 admin）；Vite/API 均需 nohup 起后台（裸 `&`
  子壳随 Bash 会话退出被杀，曾致心跳循环静默失效）。
- 显示端"同步被关闭"横幅保留（真实结束时仍提示）；superseded 事件不触发横幅
  （新会话 started 无缝接管），语义正确。
- 残余延时（症状①）的根治路径 = D25 让常开大屏自动拿到 R9 补偿代码；
  建议用户真机观察一次大屏自动重载后并排走秒。

**判定：PASS**（真机清单：①常开大屏在下次发版后自动重载并显示新版本；
②主机标签切后台 30s 内回来同步不断；③重开远程控制大屏立即跳新阶段）
