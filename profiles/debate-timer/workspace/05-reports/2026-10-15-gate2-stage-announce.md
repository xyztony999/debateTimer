# Gate 2 验证报告 — R8：到站播报 + 当前站站名折叠修复

**模块**：stage-announce（PageSpec §14 v2.2 增补，D17-D19）
**验证时间**：2026-10-15

## 工程检查

| 检查 | 结果 |
|------|------|
| ESLint | PASS（0 error；4 warning 均为既有文件 react-refresh 提示） |
| bun test | PASS（103/103，375 expects） |
| build | PASS（✓ built） |

## 验收（对照 D17-D19）

| # | 项 | 结果 |
|---|-----|------|
| D17 站名全显 | PASS（3 号站「反方四辩盘问正方一辩」10 字：修复前 4 行被 clamp 砍尾 2 字（scrollH 47 > clientH 31 实证）；修复后 2 行完整、scrollH == clientH、clamp=none、字号回归 11.52px 与邻站统一；5 号站同验） |
| D18 到站播报 | PASS（点 3 号站浮出「当前比赛阶段 · 反方四辩盘问正方一辩」、点 5/14 号文案随更新；3.4s 后确认卸载（announceGone=true）；absolute + pointer-events none + 线路色胶囊；载入即播报一次（含刷新恢复场景）） |
| D19 删下一站条 | PASS（.st-next 不在 DOM；i18n nextStage/terminus 三语删除、currentStage 三语就位、全仓无残留引用） |

## 附加确认

- 主题变量上移 `.st-anchor` 后明暗两套线带/胶囊配色不变（播报胶囊浅色深蓝底白字）
- 全页截图：单时间线 16 站、车标骑当前站、线带连续（含 #63 首站缺口修复持续有效）
- 首载播报行为：刷新后短暂显示当前阶段再淡出——作为特性保留（信息性 + 港铁语义一致）

**判定：PASS**（真机清单：手机端播报胶囊小屏不溢出、读屏 aria-live 体验）
