# Gate 2 验证报告 — R5 视觉：时间线地铁 PID 化（经典线路图）

**模块**：pid-timeline
**验证时间**：2026-10-15

## 工程检查

| 检查 | 结果 |
|------|------|
| ESLint | PASS（0 error；4 warning 均为既有文件的 react-refresh 提示，与本模块无关） |
| bun test | PASS（103/103，375 expects） |
| build | PASS（✓ built） |

## 验收（对照 PageSpec v1.9/v1.9.1 §14 D1-D5）

验收方法：本地冒烟环境（mongod + API 3001 + Vite 3000，smoketest_zcode 登录态），
跳至第 14 站「自由辩论」（passed=13 / current / future=2 三态齐备），
计算样式断言（getComputedStyle）+ 视觉模型判定（截图）双轨。

| # | 项 | 结果 |
|---|-----|------|
| D1 站点结构 | PASS（16 站 st-dot 序号 + st-name；title 保全名；结构断言通过） |
| D2 分段着色 | PASS（浅色：已过段 rgb(30,58,95)、未来段 rgb(207,216,220)；暗色：rgb(144,202,249) / rgb(55,71,79)；**高亮恰止于当前站中心**——当前站出段灰（v1.9.1）） |
| D3 状态样式 | PASS（已过=实心主题色；当前=30.4px vs 常规 24.8px + st-pulse 呼吸光晕 + 站名加粗主色；未来=空心灰边 + 站名灰） |
| D4 行为不变 | PASS（点击切换（evaluate 派发 click → current 正确移位 13 passed）、横滑 nowrap、safe center、触屏块 ≥44px 保留） |
| D5 双主题 | PASS（dark-mode 断言全过 + 视觉判定：深色下亮蓝实心/大站/空心对比清晰） |

## 视觉判定记录

- 视觉模型两轮初判曾误报"两段时间线/站名粘连"——经计算样式与几何实测排除：
  容器 nowrap 单行（scrollWidth 1152 = clientWidth，无溢出）、
  相邻站名最小间隙 9.6px（两行换行生效，正方四辩总结陈词 = 2 行）、
  绘制层级正确（::after z-index:0 在下，st-dot z-index:1 在上，线穿点下层）。
- 低分辨率缩略图对视觉模型不可靠（字号 11.5px 站名在缩放后趋近不可读），
  以紧凑特写图二次判定通过：线路贯穿、亮段止于当前站、深色对比度足够。

## 实现精化（超出 v1.9 初稿，记入 v1.9.1）

1. 高亮段从"已过或当前"收敛为"仅已过"——当前站右侧保持灰，消除未走区间超前着色。
2. 站名改两行显示（line-clamp 2 + word-break keep-all + anywhere 兜底），
   纠正单行 nowrap 下相邻站名视觉粘连；dot 中心线位同步微调（top 0.95→1.05rem）。

**判定：PASS**（真机清单：手机上明暗两主题的 PID 观感）
