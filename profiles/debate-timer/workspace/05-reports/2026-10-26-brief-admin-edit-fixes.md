# 合并简报 — admin-edit-fixes：管理页编辑模板两处缺陷

| 属性 | 值 |
|------|-----|
| 日期 | 2026-10-26 |
| 输入 | 真机反馈×2（管理后台→编辑模板） |
| 范围 | 纯前端修复（零 API/存储变更）；AA/FL 无结构变化不升版 |

## D0 根因与决策

### FB-A 误报「你正在编辑其他用户的模板」

- **根因**：`AdminPage` 编辑按钮恒带 `?ownerId=`（含管理员自己的模板）；`DebateSetting` 只要 URL 有 `ownerId` 就渲染警告横幅（DebateSetting.jsx:723），且 `loadConfigByName` 里 `if (!ownerId)` 分支连带导致**自己的模板也不记忆**最近使用。
- **决策 A-1**：入口处归一化——`ownerId === String(user.id)` 时视为本人（`ownerId` 置 undefined）：横幅消失、记忆行为恢复、列表/保存 API 调用与无参等价（self 查询本就返回本人数据，服务端零改动）。真正的他人模板（id 不同）行为不变（横幅+不记忆）。

### FB-B 深链不预选模板

- **根因**：编辑按钮只传 `ownerId` 不传模板名；设置页初始化取 localStorage 记忆名或「默认配置」（DebateSetting.jsx:241-242），与管理页点击的行无关。
- **决策 B-1**：编辑按钮追加 `&name=<模板名>`；设置页初始化优先级改为 **URL name（在列表中存在时）> 记忆名 > 默认配置**。不清洗 URL 参数（初始化 effect 只跑一次，后续手动切换不受影响）。

## PRD 要点

- 验收：管理页点自己任意模板 → 无警告横幅 + 直接选中该模板；点他人模板（未来多账号场景）→ 横幅保留；直接访问 /settings 行为与现状完全一致（回归）
- 不做什么：不改服务端、不做 URL 参数清洗、不动 AdminPage 其他动作（查看大屏/删除）

## 测试计划

- 单测：两个纯函数（ownerId 归一化 `normalizeOwnerScope`、初始模板选择 `pickInitialTemplate`）
- E2E ×2（全 mock API）：`/settings?ownerId=self&name=X` → 无横幅+选中 X；`?ownerId=other&name=X` → 有横幅（防过度修复）

## Gate 1（内联）

根因均代码实证；决策最小面（单点归一化+参数透传）；零 API 变更；测试计划明确 → **PASS**。
WARN：E2E 需 mock 设置页完整启动链（list/default 初始化/SSE），mock 面较广场页大，若不稳定则降级为纯函数单测+人工验收。
