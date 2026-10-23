# 合并简报 — gallery-ops：模板生态运营（S-04 扩展）

| 属性 | 值 |
|------|-----|
| 日期 | 2026-10-23 |
| 输入 | 方向讨论定案：做"模板生态运营"（复制计数/搜索排序/可选署名）；预置赛制校对属社区内容任务不在包内 |
| 范围 | S-04 扩展；AA v2.0 / FL v1.7 同步；无新聚合根 |

## D0 决策

| # | 决策 |
|---|------|
| G-C1 | 复制计数：配置文档 +`galleryCopyCount`；`POST /api/gallery/:id/copy`（登录）`$inc`；前端在复制成功后调用（计数仅作热度信号，信任客户端可接受）；列表项返回 `copies` |
| G-C2 | 搜索：`GET /api/gallery?q=`（模板名正则，i，元字符转义，≤50 字符）；前端 300ms 防抖 |
| G-C3 | 排序：`sort=updated`（默认，现状）\| `copies`（计数降序+更新时间降序）；游标仍按 `updatedAt` 过滤，计数变动导致的页间漂移在广场体量下可接受 |
| G-C4 | 可选署名：配置文档 +`creditName`（≤20 字符，空=匿名）；经既有 visibility 端点随 `{public, creditName}` 提交；广场列表/详情展示「贡献者」；设置页发布行提供输入（已发布态失焦即存）；**默认匿名不变**，署名为 owner 主动填写的展示名，不回退暴露用户名 |
| G-C5 | 预置赛制内容校对 = 社区内容任务（follow-up，不在本包） |

## PRD 要点

目标：让好赛制被发现（搜索/热度）、让愿意署名的贡献者被看见（可选）。不做什么：评论/评分、贡献者实名关联、计数防刷（热度信号非计费数据）。

## API 增量（api-template-gallery v1.1）

- `GET /api/gallery`：+`q`、+`sort`；items +`copies`、+`creditName?`
- `GET /api/gallery/:id`：+`copies`、+`creditName?`
- `POST /api/gallery/:id/copy`（auth）：`$inc`；响应 `{copies}`；未发布 404
- `POST /api/configurations/:name/visibility`：body +`creditName?`（≤20，空串清除）
- 配置响应投影 +`creditName?`

## 交互增量（PageSpec S-04 v1.2）

广场 AppBar 下加搜索框（防抖）+ 排序切换（最新/最热）；卡片与详情显示 🔥 复制数与贡献者；设置页发布行加署名输入。

## Gate 1（内联）

三文档同步（AA/FL 增量）✓；PRD 完备（对象=配置文档两新字段，值语义明确）✓；API 增量与 Action 对齐 ✓；枚举无新增 ✓ → **PASS**。

## 同批工程债（用户授权逐项清理，本批三项）

| # | 项 | 方案 |
|---|-----|------|
| E-1 | 匿名端点限流 | `server/lib/rateLimit.js` 滑动窗口（内存，按 IP）；挂 gallery（120/min）与 display（60/min）；429 + Retry-After；`app.set('trust proxy', 1)` 以取真实 IP（Baota 反代） |
| E-2 | 比赛采集缓冲 sessionStorage 兜底 | matchCapture 增加持久化/恢复/清空纯函数；hook 在 begin/bump 后持久化、初始化恢复、换配置清空（缓解刷新丢缓冲，PRD B 包 §10 取舍的后续） |
| E-3 | 主 chunk 拆分 | vite manualChunks（react / mui / i18n 三档 vendor） |

后续队列：Playwright 常驻 E2E → 数据备份 → useDebateTimer 拆分（体量大，单独批次）。
