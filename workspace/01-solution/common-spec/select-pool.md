# 选择池（select-pool）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 上游 | enum-pool.md v1.0（业务枚举）；本册只登记**下拉/选择器类可选项**（id + 三语标签 + 消费组件） |

## 1. 文档定位

| 定位 | 说明 |
|------|------|
| 本文档做什么 | 汇总 UI 下拉框/选择器/调色板的选项集：选项 id、三语显示文案来源、消费组件、数据落点，供 D3/D4 界面与接口设计引用 |
| 本文档不做什么 | 不登记纯业务状态枚举（见 enum-pool.md）；不定义新选项 |
| 文案规则 | 选项 id 与翻译解耦——id 是稳定 wire 值，文案一律走 i18n 词条（`src/locales/{en,zh-Hans,fr-CA}.json`） |

## 2. 选择池清单

### SP-01 铃声方案（soundOption）

| id | zh-Hans | en | fr-CA | 来源 |
|----|---------|----|----|------|
| `split` | 提示铃 | Alert bell | Cloche d’alerte | 选项集 `src/services/soundPrefs.js:9-14`（SOUND_OPTIONS，含音频资源 import `:1-4`） |
| `notify` | 长鸣 | Long beep | Bip long | 同上 |
| `timeup` | 单响铃 | Single ding | Ding simple | 同上 |
| `chime` | 双音铃 | Two-tone chime | Carillon | 同上 |

- **文案来源**：`src/locales/zh-Hans.json:183-188`、`src/locales/en.json:183-188`、`src/locales/fr-CA.json:183-188`（`soundOption` 词条组）。
- **消费组件**：`src/components/SoundSettingsPanel.jsx`（每告警节点一行：方案下拉 + 音量 + 试听）。
- **落点**：本设备偏好 `localStorage['timer.soundPrefs']`（`src/services/soundPrefs.js:35`），按节点 `{ sound, volume }`；每节点缺省方案 `split/timeup/notify`（`DEFAULT_SOUND_PREFS` `soundPrefs.js:16-20`）；不随会话/模板同步。非法 id 加载时回落缺省（`soundPrefs.js:61-68`）。

### SP-02 告警节点行（节点 × 方案 × 音量矩阵的选择维度）

| 节点 id | 语义 | 缺省方案 | 来源 |
|---------|------|---------|------|
| `warn30` | 30 秒提醒 | `split` | `ALERT_NODES` `src/services/soundPrefs.js:7`；缺省 `:16-20` |
| `timeUp` | 时间到 | `timeup` | 同上 |
| `mustStop` | 必须停 | `notify` | 同上 |

- 音量滑杆：整数 0–100，越界钳制（`soundPrefs.js:67`）。
- 试听走 `previewSound(soundId, volume)`（`soundPrefs.js:129-134`）；30s 节点试音附带 27–30s 闪烁预览（引擎 `blinkOverride` `src/timer/engine.js:340-357,409-417`）。

### SP-03 TTS 节点开关（ttsNodes）

| 节点 id | 语义 | 缺省开关 | 来源 |
|---------|------|---------|------|
| `warn30` | 30 秒提醒播报 | 开 | `TTS_NODES` `src/services/soundPrefs.js:25`；`DEFAULT_TTS_PREFS` `:27-33` |
| `timeUp` | （某队）时间到播报 | 开 | 同上 |
| `mustStop` | （某队）必须停播报 | 开 | 同上 |
| `handover` | 自由辩论交棒播报 | 开 | 同上（仅 TTS，无铃声） |

- 总开关 `enabled` 缺省**关**（人工主持优先，`soundPrefs.js:22-24` 注释）；文案 `ttsTitle/ttsDesc` 见 `src/locales/fr-CA.json:189-190`（三语同组）。
- 播报语种随界面语言（EP-I18N-01），语音匹配档 exact/family/fallback（`src/services/speech.js:83-103`）。

### SP-04 计时模式选项（stageMode picker）

| id | 语义 | 图标 | 来源 |
|----|------|------|------|
| `single`（UI 数值 0） | 单计时 | TimerRounded | 数值枚举 `src/schema/TimerSetting.jsx:1-5`；图标 `src/components/StageIcon.jsx:34-41` |
| `double`（UI 数值 1） | 双计时 | CompareArrowsRounded | 同上 |
| `free`（UI 数值 2） | 自由辩论 | ForumRounded | 同上 |

- 消费组件：模板编辑（`src/DebateSetting.jsx` 阶段行模式选择，落库 `timerSettings[stageId]`）；服务端接受字符串三值 + 遗留数字 0/1（EP-TIMER-01 口径差异①）。

### SP-05 PID 图标（stagePid.icon）

18 个注册 id：`train` `mic` `volume` `question_answer` `reply` `forum` `summarize` `pause` `flag` `timer` `compare_arrows` `bell` `gavel` `school` `groups` `trophy` `record_voice_over` `schedule`——注册表 `src/config/pidIcons.js:27-48`（PID_ICONS/PID_ICON_IDS，append-only `:5-6`）；网格选择器与计时页 PID 时间线共用（`pidIcons.js:2-4` 注释）。

- 哨兵 `auto` = 交由阶段语义/模式回退（`pidIconElement` 对 `auto` 返回 null，`pidIcons.js:69-74`；服务端剥离 `auto` 不落库 `server/lib/configDocs.js:156-163`）。
- 落点：`stagePid[stageId].icon`（格式校验 `/^[a-z0-9_]{1,32}$/` `server/lib/configDocs.js:16,157`）。

### SP-06 当前站 marker（pidOptions.marker）

8 个子集 id：`train` `mic` `volume` `bell` `flag` `timer` `trophy` `record_voice_over`——`src/config/pidIcons.js:57-59`（MARKER_IDS，模板级选择器专用）。

- 落点：`pidOptions.marker`（`server/lib/configDocs.js:115-122`）。

### SP-07 线路颜色（pidOptions.lineColor）

| # | 色值 | 来源 |
|---|------|------|
| 1 | `#1e3a5f`（缺省 DEFAULT_LINE_COLOR） | 调色板 `src/config/pidIcons.js:62-66`；服务端白名单 `server/lib/configDocs.js:18-20` |
| 2 | `#c62828` | 同上 |
| 3 | `#2e7d32` | 同上 |
| 4 | `#ef6c00` | 同上 |
| 5 | `#6a1b9a` | 同上 |
| 6 | `#00695c` | 同上 |
| 7 | `#455a64` | 同上 |

- 白名单外一律 400（`configDocs.js:123-130`）。

### SP-08 PID 站点类型（station）

| id | zh 文案键 | 来源 |
|----|----------|------|
| `auto` | `settings.pidStation_auto` | 白名单 `server/lib/configDocs.js:17`；选择器 `src/DebateSetting.jsx:1326-1338`（选 auto 落空串，服务端剥离） |
| `interchange` | `settings.pidStation_interchange` | 同上 |
| `normal` | `settings.pidStation_normal` | 同上 |

### SP-09 界面语言切换（language switcher）

| id | 语言 | 来源 |
|----|------|------|
| `en` | English | `src/i18n.js:24-25`（supportedLngs/fallbackLng） |
| `fr-CA` | Français（加拿大） | `src/i18n.js:21` |
| `zh-Hans` | 简体中文 | `src/i18n.js:22` |

### SP-10 广场排序（sort）

| id | 语义 | 来源 |
|----|------|------|
| `updated` | 最近更新（缺省初值） | 服务端白名单 `server/routes/gallery.js:62-66`；UI 初值 `src/GalleryPage.jsx:53` |
| `copies` | 最多复制 | 同上 |

### SP-11 预置赛制导入（D-02 服务端脚本）

| 预置文件 | 模板名 | 来源 |
|----------|--------|------|
| `uomdc-standard.json` | UOMDC 标准赛制 | `server/scripts/presets/uomdc-standard.json:3`；导入脚本 `server/scripts/import-configurations.js` |
| `bp-sample.json` | 英国议会制 BP（样例） | `server/scripts/presets/bp-sample.json:3` |
| `oregon-sample.json` | 奥瑞冈制（样例） | `server/scripts/presets/oregon-sample.json:3` |

## 3. 与枚举池的边界

| 池 | 收录范围 | 例 |
|----|---------|-----|
| enum-pool.md | 业务状态/流转/wire 校验枚举 | `stageMode`、`phase`、会话生命周期、限流窗口 |
| 本册 | UI 可选项目录（id + 文案 + 组件 + 落点） | 铃声方案、图标注册表、调色板、排序项 |
| 两册重叠 | 选择项的 id 本身也是业务枚举时，双册同编号引用 | SP-04 → EP-TIMER-01；SP-08 → EP-CONFIG-02；SP-07 → EP-CONFIG-04 |

## 更新记录

| 版本 | 日期 | 更新说明 |
|------|------|---------|
| v1.0 | 2026-11-11 | 初始生成：11 组选择池全部核对源文件（选项集/文案/消费组件/落点），三语标签逐一比对 locale 词条 |
