# 合并简报 — records-style：比赛记录样式对齐新版规范（方案 A）

| 属性 | 值 |
|------|-----|
| 日期 | 2026-10-26 |
| 输入 | 用户反馈：比赛记录样式未统一到新版 |
| 用户选定 | **A 完整对齐广场页**（三选一，含现状项）；选定即 Gate 1 定向 → PASS |
| 范围 | 纯视觉/结构重排（零 API/逻辑变更）；S-03 PageSpec v1.1 附记 |

## 决策

| # | 决策 |
|---|------|
| S-1 | 两页头部换 Gallery 同款 sticky AppBar（返回图标钮 + 标题 + LanguageSwitcher + 明暗图标钮）；详情页 AppBar 右侧收纳 CSV/JSON/删除操作 |
| S-2 | 列表项卡片化：Card outlined + borderRadius 16 + hover 上浮/描边（与广场卡同款 sx），CardActionArea 进详情；超时 Chip（🔥 warning）/ ✓ outlined 保留 |
| S-3 | 详情页主体：汇总 Chip 行 + 阶段表格卡（圆角 16）；loading 态 AppBar+Spinner，missing/error 保留 Alert+返回 |
| S-4 | 删除 `.records-page`/`.settings-header` 私有 CSS（3 段）；背景交给 MUI 主题（Box minHeight 100dvh） |
| S-5 | 行为零变更：数据链路/分页/导出/删除确认交互不动；文字全走既有 i18n 键 |

## 测试计划

- E2E `records.e2e.js`（首次覆盖两页，mock match-logs API）：列表渲染（记录行+超时 Chip）→ 点击进详情（AppBar 标题=模板名、阶段表格行数）
- 门禁：138 单测（无新增单测——纯视觉）+ 12 E2E + lint + build

## Gate 1：PASS（用户选定 A 即定向）；WARN：视觉终判以用户线上验收为准（E2E 只锁结构契约）
