# Gate 2 验证报告 — 代码→交付门控（迭代包 A 赛制增强）

**模块**：stage-enhancements　**栈**：react-vite-web（BE-xx 清单栈替换声明沿用）
**时间**：2026-10-11　**门禁**：lint 0 error（5 既有 warning）/ 40 tests 全过 / build ✓

## 引擎机制语义

| 语义 | 结果 | 证据 |
|------|------|------|
| 扫描必执行 | ✅ | R1–R5 复查：接口字面量仅 services/（新增 soundPrefs/TimerSessionService 均服务层）；异步反馈（宽限/推进为本地即时行为；保存失败 notify）；暗色样式补齐（grace-blinking/advance-banner/side-badge/sound-panel 均有 dark 变体）；lockfile 无变更 |
| 编译必过 | ✅ | build 成功 |
| E2E 必补 | ⚠️ | 沿用既有适配（无浏览器 E2E 基建）；宽限/推进真机验收列入建议 |
| 契约对齐 | ✅ | 见下 AL 表 |

## 测试增量

| 层 | 用例 |
|----|------|
| 服务端校验 | stageGrace 0–300/未知 stageId/超长队名 400 + 新字段落库回显（display 投影）；快照 phase/grace 一致性（grace⇔ms>0、越界、single 归一）|
| i18n | A 包 22+ 键三语言断言 |

## 前后端接口对齐

| # | 结果 | 说明 |
|---|------|------|
| AL-001/002 | ✅ | 零新端点；既有 PUT/GET 配置与快照载荷扩展一致 |
| AL-003 | ✅ | stageGrace/stageAutoAdvance/teamNames 前后端字段与缺省一致（空队名不落键） |
| AL-004 | ✅ | timerPhase 三值；快照 v2 按方并行字段（phaseAff/Neg+graceAff/NegMs）与文档 v1.1 修订一致 |
| AL-005 | ✅ | 400 校验消息经 notify 呈现 |

## 设计符合性抽查

- 宽限两段铃声：timeUp（新单响铃资产）/mustStop（长鸣）✓；宽限倒计时渲染 + graceHint ✓；快照相位同步（adoptSnapshot 消费 phase/graceMs）✓
- 提示音：4 方案×3 节点 + 音量 + 试听 + 恢复默认；localStorage；大屏页 🔊 入口（匿名本地）✓
- 队名：模板保存→控制端与大屏双计/自由布局标题（徽标+队名）✓
- 自动推进：彻底结束（含宽限）→ 3s 横幅倒计时 → 切换；键盘/按钮/下拉取消；末阶段不推进 ✓
- 回归：无新字段配置行为不变；旧快照缺 phase 走派生回退 ✓

## 总结

**判定**：**WARN → 可交付**（CRITICAL 0）

WARN：真机验证清单（移动端推进取消触控、宽限铃声在投影音箱的听感、timeup.wav 资产风格是否合意——资产可独立替换不动代码）。
