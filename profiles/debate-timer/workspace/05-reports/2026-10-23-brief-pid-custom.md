# 合并简报 — pid-custom：PID 图标自定义（A+B+C+D）+ 配对入口形态修正

| 属性 | 值 |
|------|-----|
| 日期 | 2026-10-23 |
| 输入 | 用户反馈×2：①遥控器「连接电脑」配对入口不应出现在电脑端；②模板设置增加 PID 图标自定义 |
| 用户选定 | A 站型自定义 + B 站点图标自定义 + C 当前站车标自定义 + D 线路主题色（全选）；E 站名缩写/F 隐藏站不做 |
| 范围 | 需求①=C-02-01 交互修正（零 API）；需求②=S-01 新 L4（BA v1.4 / AA v2.1 / FL v1.8）；零新端点（配置流承载） |

## D0 决策

### 需求① 配对入口形态（D-1）

「连接电脑（输入配对码）」菜单项仅遥控器形态（`remoteMode`：竖屏 ≤600px）渲染；桌面/横屏隐藏。窄竖窗自动进入遥控形态可见——语义自洽。

### 需求② PID 自定义（P-1~P-5）

| # | 决策 |
|---|------|
| P-1 | 配置 schema v4：阶段级 `stagePid[stageId] = { icon?, station? }`；模板级 `pidOptions = { marker?, lineColor? }`；全部可选缺省=现状 |
| P-2 | 站型 station ∈ `auto`（现状：与上一阶段模式变化）/ `interchange`（强制换乘大环）/ `normal`（强制普通） |
| P-3 | 图标=内置注册表 `src/config/pidIcons.js`（稳定字符串 ID → MUI 组件，约 18 个；含 train/mic/volume/question_answer/reply/forum/summarize/pause/flag/timer/compare_arrows/bell/gavel/school/groups/trophy/record_voice_over/schedule）；不做上传；`icon:'auto'` 或缺省=现有语义映射 |
| P-4 | 车标 marker ∈ 注册表子集（train/mic/bell/flag/timer/trophy/record_voice_over/volume），默认 train（现状） |
| P-5 | 线色 lineColor ∈ 预设色板白名单（navy #1e3a5f[现状]/#c62828/#2e7d32/#ef6c00/#6a1b9a/#00695c/#455a64）；实现=时间线容器内联覆盖 `--st-route` |

## PRD 要点

- 目标：让每套赛制的 PID 讲自己的故事（关键环节强调、品牌线色、语义车标）而不动计时行为
- 不做什么：图标上传、任意色值（仅色板）、隐藏站（F，破坏进度语义）、站名缩写（E，后续）
- 验收：自定义站型覆盖自动环判定；自定义图标在卡片/详情/PID 三处一致；车标与线色即时生效并随配置同步到大屏配置流；旧配置零感知；快照协议零变更

## API 增量（api-stage-enhancements v1.2）

`pickConfigFields` 白名单 +`stagePid`/`pidOptions`：
- stagePid：键须存在于 debateStages；icon ≤32 字符 `[a-z0-9_]`；station ∈ stationType
- pidOptions：marker 同 icon 校验；lineColor ∈ LINE_COLORS 白名单
- `toConfigResponse`/`toDisplayResponse` 透传两键
- 枚举池登记：`pidStationType`（auto/interchange/normal）、`pidLineColor`（7 色板）

## 交互增量（C-01-08/S-01 PageSpec 附记）

- 设置页阶段编辑行 +「🚇」按钮 → 弹出小面板：图标网格（含"自动"）+ 站型三选 + 迷你预览
- 设置页新「PID 时间线」卡片：车标选择（8 个）+ 线色色板 + 迷你时间线预览
- 控制端 PID：站型/图标/车标/线色按配置渲染（`--st-route` 内联覆盖）
- 大屏：配置经 toDisplayResponse 同步（PID 目前仅控制端渲染，大屏如后续加 PID 自动继承）

## Gate 1（内联）

三文档增量同步 ✓；PRD 完备（两值对象字段，语义/校验/缺省明确）✓；API=配置白名单扩展与字段表一致 ✓；Action=既有保存通道（extras）✓；枚举登记无冲突 ✓ → **PASS**。

WARN：①图标注册表初版清单可后续扩充（ID 稳定，不破坏旧数据）；②需求①真机验证（桌面隐藏/手机可见/窄竖窗切换）。
