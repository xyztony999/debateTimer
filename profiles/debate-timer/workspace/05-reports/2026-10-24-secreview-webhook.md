# 安全核查报告 — deploy/baota/webhook.php（Mimosa 高危「命令注入」专项）

| 属性 | 值 |
|------|-----|
| 日期 | 2026-10-24 |
| 结论 | **误报（无注入路径）**；附带 2 项最小加固已应用 |
| 事实核查 | `gh api repos/xyztony999/debateTimer/hooks` = 0 —— 该 webhook **未在 GitHub 注册**，属休眠备用路径（现役发版走 GitHub Actions SSH，deploy-baota.yml） |

## 逐项分析（对照 Mimosa 报告的 line 75 exec）

1. **命令构成**：`bash {deployScript} >> {log} 2>&1 &`——`$deployScript = __DIR__ . '/deploy.sh'`、`$log = '/www/wwwlogs/debatetimer-webhook.log'`，**两个成分均为服务器端常量，零请求来源输入**，且都过了 `escapeshellarg`。Mimosa 模式匹配到 `exec()` 即报，无实际注入路径。
2. **签名验证**：`hash_equals`（时序安全）比对 `X-Hub-Signature-256` HMAC-SHA256，验证在 json_decode 与任何副作用之前；`WEBHOOK_SECRET` 缺失时 500 拒绝。实现正确。
3. **事件过滤**：非 push 204 / ref 不匹配直接返回——不触达 exec。
4. **env 解析**：仅读本地 `deploy.env` 固定键，无任意键写入。

## 已应用加固（防御纵深，不改行为）

- `X-Content-Type-Options: nosniff` 响应头
- exec 处补充注释说明「无用户输入进入命令」的边界条件（防未来改动引入真注入）

## 建议

- 维持现状（作为 Actions 之外的备用触发路径保留），或确认不再需要时整文件删除——GitHub 侧无注册，删除零影响。
