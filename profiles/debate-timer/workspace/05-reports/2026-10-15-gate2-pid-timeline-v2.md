# Gate 2 验证报告 — R6 视觉深化：北京粗带 × 港铁换乘环（PID v2）

**模块**：pid-timeline-v2
**验证时间**：2026-10-15

## 工程检查

| 检查 | 结果 |
|------|------|
| ESLint | PASS（0 error；4 warning 为既有 react-refresh 提示，与本模块无关） |
| bun test | PASS（103/103，375 expects） |
| build | PASS（✓ built） |

## 验收（对照 PageSpec v2.0 §14 D6-D10）

验证方法同 R5 双轨：本地冒烟（API 3001 + Vite 3000），跳至第 14 站，
计算样式断言 + 几何实测 + 视觉模型判定（明暗特写图）。

| # | 项 | 结果 |
|---|-----|------|
| D6 粗带端帽 | PASS（::after 高 7px；首段 left:0 + 圆角 4px 0 0 4px，末段 50% + 圆角 0 4px 4px 0） |
| D7 光环骑线 | PASS（所有点 box-shadow 0 0 0 3px surface 色；已过=实色芯 rgb(30,58,95)、未来=白芯 2px 灰环；深色对应 #1a2332/#90caf9） |
| D8 港铁换乘环 | PASS（换乘=8/9/14/15 站，与服务端 timerSettings 的模式切换点完全一致：crossfire_2v2/aff_poii/free_debate/neg_closing；环 32.8px vs 普通点 25.6px，margin-top -3.6px 心共线；已过环=底色芯+主题色环+主题色号，未来环=灰环） |
| D9 当前站 | PASS（换乘环样式+脉冲移至 ::after 伪元素（元素光环保留断带）；站名胶囊主题色底白字/暗色亮蓝底深字，胶囊距站点边界各 4.8px 不出界） |
| D10 行为不变 | PASS（点击切换 evaluate 派发正常、横滚 375px 下 scrollW 1093>375 且首站左缘 2px 不裁切、aria/disabled 保留） |
| 几何 | PASS（相邻站名最小间隙 9.6px，含胶囊无重叠） |
| 视觉判定 | PASS（明暗两特写：粗带点骑线、大环识别度、当前胶囊对比、高亮止于当前站，逐项确认） |

## 过程记录（缺陷与坑）

1. **已过换乘环被填死**：`.st-step--passed .st-dot` 的实心背景覆盖了环芯——
   补 `.st-step--passed.st-step--interchange .st-dot { background: var(--st-dot) }` 修复。
2. **Windows Vite chokidar 漏听**：JSX 编辑后服务端仍发旧模块（CSS 六次编辑全部生效、
   单次 JSX 编辑漏掉），`fetch('/src/...jsx', {cache:'no-store'})` 校验发现，touch 文件唤醒。
   验收纪律补充：**reload 前先 no-store 校验服务端源码为新版本**。
3. 脉冲从元素 box-shadow 移到伪元素：否则动画会覆盖光环（光环承担"断带"功能不能丢）。

**判定：PASS**（真机清单：手机明暗两主题的粗带/大环观感）
