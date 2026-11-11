# S-02 赛制模板管理 交互设计 PageSpec（注册用户视角）

| 属性 | 值 |
|------|-----|
| 模块编码 | S-02（应用域：支撑业务域） |
| 文档性质 | 逆向归档：系统已上线，本文档如实反映现有实现（组件/交互/文案均为现网事实，非理想化重设计） |
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 用户类型 | 注册用户（计时操作员/管理员共用本页；管理员代管差异见 §8.4） |
| 业务类型 | 主数据（master_data：模板属主 CRUD，无审批/状态机） |
| 页面类型 | config 单页多 Card（含局部 code 交互：阶段排序 HTML5 拖拽 + PID 弹层；无独立列表页/详情页） |
| 上游依据 | S-02 API 设计 v1.0；S-02 PRD v1.0；FL v1.0 §2.2.1.2（菜单：模板设置 / 队名配置） |
| 实现锚点 | `src/DebateSetting.jsx`（1377 行，页面唯一实现）、`src/services/ConfigurationService.js`、`src/services/GalleryService.js`（发布侧）、`src/utils/settingsScope.js`、`src/config/configConstants.js`、`src/services/configurationShared.js` |
| 行为验证 | `bunx playwright test e2e/gallery.e2e.js e2e/records.e2e.js e2e/admin-deeplink.e2e.js` → 7 passed（2026-11-11，本机执行；其中 admin-deeplink 2 例直接回归本页深链行为） |

> **栈适配声明**：d4 分册的组件映射表（ScmListPage/modalSelect 等）为 vue3-engine 参考实现（📎 scm 示例），本栈（react-vite-web）无等价映射表，本文按实际 React 19 + MUI 组件如实归档，章节结构遵循 d4 输出校验的 9 节框架。
>
> **交互确认说明**：分册 Step 4 的 7 项交互确认（元信息/查询条件/表格列/operList/表单分组/详情 Card/页面类型）在本流水线无人工环节，以「现有实现即确认结论」替代——各确认项结论即本文 §1（元信息与页面类型）、§4（列表呈现）、§5（表单分组与字段归属）、§2（操作集合与可用性）的如实归档内容。

## 1. 模块元信息

| # | 项 | 值 | 锚点/说明 |
|---|----|----|----------|
| 1.1 | 模块编码 | S-02 | API 档同编码；交互面与 API 接口对应关系见 §2 |
| 1.2 | 页面 | 模板设置页 `/settings`（路由名 SettingsPage，实现 `src/DebateSetting.jsx`） | `src/App.jsx:38-45`（ProtectedRoute 包裹，未登录访问被弹回 `/login?next=`） |
| 1.3 | 用户与入口 | 注册用户登录后经计时台 AppBar「设置」进入；广场复制成功后 `navigate('/settings')` 直达 | `src/GalleryPage.jsx:123`；计时台入口 `src/TimerControlPage.jsx`（另册） |
| 1.4 | 业务类型 | master_data（保存即生效，无审批流） | S-02 API 档表头「功能类型」 |
| 1.5 | 页面类型 | config（单页 9 Card 纵向布局 + 底部动作区）；局部 code 交互两处：阶段排序拖拽（§5.9）、PID 弹层（§5.6） | 页面结构总览见 §5.0 |

**页面 Card 总览**（`src/DebateSetting.jsx:741-1370`，自上而下）：

| # | Card | i18n 标题（zh-Hans） | 归属 |
|---|------|---------------------|------|
| C1 | 模板管理 | 模板管理 | S-02（§5.1） |
| C2 | 大屏共享与发布 | 共享此模板（`share.title`） | 共享=S-02 CFG-SHARE；发布开关/署名=S-03 语义（详设见 S-03 PageSpec §5，本文 §5.2 仅记布局） |
| C3 | 时长设置 | 时长设置 | S-02（§5.3） |
| C4 | 计时模式 | 计时模式 | S-02（§5.4） |
| C5 | 队名 | 队名 | S-02（§5.5） |
| C6 | PID 时间线 | PID 时间线 | S-02 模板级装饰（§5.6） |
| C7 | 提示音 | 提示音 | C-01-04 告警域（`SoundSettingsPanel`，设备本地偏好，不随模板保存；另册，本文不展开） |
| C8 | 添加计时项目 | 添加计时项目 | S-02（§5.7） |
| C9 | 调整顺序 | 调整顺序 | S-02（§5.9） |

## 2. Action 定义

> 核心原则（d4 §3.1）：前端维护完整按钮集合，可见性/禁用由状态控制；本页无后端 `operList`（无列表行操作），按钮可用性规则如下表「前置/禁用」列。

| 编码 | 名称 | 触发交互 | 前置/禁用 | 调用接口 | 成功反馈 | 失败反馈 | 锚点 |
|------|------|---------|----------|---------|---------|---------|------|
| A01 | 切换模板 | 模板下拉 Select onChange | 与当前同名则忽略；**dirty 时先弹确认**（`settings.confirmSwitchTemplate`，warning 色），拒绝则中止 | CFG-GET（选项列表来自初始化时的 CFG-LIST，切换不重查列表） | 载入并记忆（localStorage `selectedConfigurationName`，仅非代管时写入） | notify error `无法加载模板"{{name}}"` | `DebateSetting.jsx:266-281`（载入 `:216-232`） |
| A02 | 创建模板 | 「创建模板」contained 按钮 | 名称为空 → notify warning `请输入模板名称`；与现有列表重名 → notify warning `该模板名称已存在`（前端拦截；服务端 (ownerId,name) 唯一索引兜底） | CFG-SAVE（PUT，以新名 upsert 当前编辑内容）→ CFG-LIST（刷新列表）→ CFG-GET（载入新模板） | 载入新模板 + notify success `模板"{{name}}"已创建` | notify error `创建失败：{{message}}`；网络异常 `创建模板失败，请重试` | `DebateSetting.jsx:283-328` |
| A03 | 删除模板 | 「删除模板」outlined error 按钮 | **默认模板（`默认配置`）禁用**（title 提示 `默认模板不可删除`）；点击先弹确认（error 色，`确定要删除模板"{{name}}"吗？此操作不可撤销。`） | CFG-DELETE → CFG-LIST（刷新）→ CFG-GET（载入「默认配置」或列表首项） | 自动切换并 notify success `模板"{{name}}"已删除，已切换到"{{next}}"` | notify error `删除失败：{{message}}`；异常 `删除模板失败，请重试` | `DebateSetting.jsx:330-371`；禁用 `:772-777` |
| A04 | 保存 | 底部「保存」contained success 大按钮 | 无 dirty 门槛（随时可存） | CFG-SAVE（PUT 当前模板名） | markClean 快照 + notify success `模板"{{name}}"已保存！` | notify error `保存失败：{{message}}`；异常 `保存设置失败，请重试` | `DebateSetting.jsx:489-514`，按钮 `:1360-1368` |
| A05 | 重置为默认 | 底部「重置为默认」outlined 按钮 | 点击先弹确认（warning，`确定将当前编辑重置为内置默认内容吗？尚未保存的修改会丢失。`） | 无接口（回填前端打包内置 JSON `debateTimeSettings.json`/`debateTimerSettings.json`） | 9 项状态回填内置值；**不 markClean**——重置后为 dirty，需再点「保存」才落库（实现行为如实记录） | 确认拒绝即中止 | `DebateSetting.jsx:516-532,1352-1359` |
| A06 | 添加计时项目 | C8 卡「添加项目」contained 按钮 | **至少一种语言名称非空**，否则 notify warning `请至少填写一种语言的名称` | 无接口（仅本地 state，随 A04 一并保存） | 追加到 stageOrder 末尾；三语输入框/时长(回 60)/模式(回 single) 清空复位 | — | `DebateSetting.jsx:534-555` |
| A07 | 删除计时项目 | C4 卡每阶段行内 delete IconButton（error 色） | 点击先弹确认（error，`确定要删除计时项目"{{name}}"吗？`，名称按当前语言解析） | 无接口（本地 state） | 从 debateStages/timerSettings/stageLabels/stageGrace/stageAutoAdvance/stagePid/stageOrder 全部移除 | 确认拒绝即中止 | `DebateSetting.jsx:557-589`，按钮 `:977-985` |
| A08 | 拖拽排序 | C9 卡 ListItem HTML5 drag（draggable + dragstart/over/leave/drop/end）；备选行内 ↑/↓ IconButton（首/末项各自禁用） | 无 | 无接口（本地 stageOrder） | drop 后重排 stageOrder；拖拽中行高亮 `action.selected`、悬停目标行 `action.hover` | — | `DebateSetting.jsx:591-642`，列表 `:1211-1280` |
| A09 | 阶段字段编辑 | C3 时长数字输入 / C4 模式 Select、宽限数字输入、自动推进 Switch | 时长 0–3600（`htmlInput min/max`）；宽限输入经 clamp 到 0–300（`DebateSetting.jsx:458-461`）；模式枚举 single/double/free | 无接口（本地 state） | 实时写入 state，带 dirty | — | `DebateSetting.jsx:450-465,900-1014` |
| A10 | PID 装饰选择 | C6 卡模板级（车标图标组 / 线路色板）；C4 卡行内 TrainRounded IconButton 打开 Popover（阶段级 图标/站型） | 模板级 marker 8 选 1（首项 train=默认，选中即存 `''`）；线色 7 选 1（首项深蓝=默认，选中即存 `''`）；阶段级图标「自动」+18 图标、站型 auto/interchange/normal（auto 存 `''`）；空值条目从 stagePid 删除 | 无接口（本地 state） | 即时选中态（边框/主色高亮） | — | 模板级 `:1051-1109`；Popover `:1287-1344`；`updateStagePid :467-481`；图标注册表 `src/config/pidIcons.js:26-45` |
| A11 | 大屏共享开关/轮换/复制链接 | C2 卡 Switch + 「复制链接」「轮换」按钮 | Switch busy（shareBusy）或未选中模板时禁用；开启前 URL 区不渲染（显示 `share.hint` info Alert） | CFG-SHARE（`{enabled}` / `{enabled:true,rotate:true}`） | 回填 shareEnabled/shareToken；复制链接：剪贴板写入 + notify success；剪贴板失败降级弹 alert 展示 URL | notify error（服务端 message） | `DebateSetting.jsx:405-448,811-857`；URL 组装 `origin/display/{token}` `:401-403` |
| A12 | 发布到广场（S-03 语义，接口挂本域路由） | C2 卡内 Switch（label 随态：`发布到模板广场`/`已在模板广场公开`） | busy（visibilityBusy）或未选中模板时禁用 | **VISIBILITY** `POST /api/configurations/:name/visibility` `{public}`（经 `GalleryService.updateVisibility`） | 回填 isPublic | notify error（服务端 message） | `DebateSetting.jsx:373-382,858-878` |
| A13 | 署名（可选，S-03 语义） | 已发布态出现的 TextField，blur 提交 | maxLength 20；trim 后与上次提交值相同则跳过 | VISIBILITY `{public:true, creditName}`（空串=清为匿名） | notify success `署名已更新` | notify error（服务端 message） | `DebateSetting.jsx:384-399,879-891` |
| A14 | 前往广场 | C2 卡「🌐 模板广场」按钮 | 无 | 无（路由跳转 `/gallery`） | — | — | `DebateSetting.jsx:892-894` |
| A15 | 帮助 | AppBar ? IconButton | 无 | 无 | 弹 alert 对话框（`settings.helpAlert`：修改后需点保存/计时页自动更新/未保存切换会确认） | — | `DebateSetting.jsx:706-717` |
| A16 | 退出登录 | AppBar「退出登录」按钮 | 无 | POST /api/auth/logout | `logout()` 后 `navigate('/login')` | — | `DebateSetting.jsx:718-726` |

**初始化序列**（页面挂载，`DebateSetting.jsx:241-264`）：

```
CFG 播种（initializeDefaultConfigurations：「默认配置」缺失则用内置 JSON 静默创建）
→ CFG-LIST 拉模板名列表（失败回落 [默认配置]）
→ pickInitialTemplate 选初始模板：?name= 深链 > localStorage 记忆 > 「默认配置」> 列表首项
   （请求名不在列表中时静默穿透，src/utils/settingsScope.js:26-37）
→ CFG-GET 载入（失败 → applyLocalFallback 内置值兜底 + 选中名回「默认配置」）
```

## 3. 字典 Key 清单

> 本栈无服务端字典端点（vue3-engine 的 `POST /{domain}/dict/batch` 不适用）；枚举选项为前端常量 + i18n 文案。

| 字典 Key | 选项 | 来源 | 消费点 |
|---------|------|------|--------|
| stageTimingMode | `single` / `double` / `free` | 服务端枚举（S-02 API §3.4）；选项文案 `settings.singleTimer`/`doubleTimer`/`freeTimer` | C4 模式 Select `:961-963`、C8 新建模式 Select `:1186-1188`、C9 副文本 `:1270-1274` |
| pidStationType | `auto` / `interchange` / `normal` | `src/config/pidIcons.js` + 文案 `settings.pidStation_*` | PID Popover 站型按钮组 `:1329-1341` |
| pidLineColor | `#1e3a5f` `#c62828` `#2e7d32` `#ef6c00` `#6a1b9a` `#00695c` `#455a64`（7 色白名单，首色默认） | `src/config/pidIcons.js:62-69`（与服务端白名单镜像） | C6 线路色板 `:1086-1106` |
| pidIconId | 18 个图标 id（`train mic volume question_answer reply forum summarize pause flag timer compare_arrows bell gavel school groups trophy record_voice_over schedule`），格式 `^[a-z0-9_]{1,32}$`；模板级 marker 子集 `MARKER_IDS` 8 个 | `src/config/pidIcons.js:26-45,58-61`（append-only 注册表） | C6 车标组、Popover 图标组 |
| i18n 命名空间 | `settings.*`（106 keys）、`share.*`、`common.*`（cancel/confirm/delete/ok）、`timer.affirmative|negative`（队名占位）、`admin.editingOtherUser`、`auth.logout` | `src/locales/{zh-Hans,en,fr-CA}.json` | 全页文案，无硬编码 JSX 文案（除 A14 按钮 emoji 前缀 🌐） |
| 阶段显示名解析 | 预置阶段 → i18n `stages.<id>`；自定义阶段 → `stageLabels[id][当前语言]` 缺失按 `en→zh-Hans→fr-CA` 回落，再退 stageId 本身 | `src/utils/stageDisplayName.js:15-26` | C3/C4/C9 显示名、A07 确认弹窗 |

## 4. 列表页（适配说明：本模块无表格列表页）

模板「列表」在本页呈现为 **C1 卡内下拉 Select**（`当前模板`），非表格页——如实归档的栈/规模适配：

| 维度 | 实现 |
|------|------|
| 数据源 | CFG-LIST `GET /api/configurations`：`{name,createdAt,updatedAt,shareEnabled}` 全量返回，**无分页**（量级数十，S-02 API §4.4） |
| 排序 | 服务端 `updatedAt:-1` 降序（最近使用在前） |
| 列呈现 | 仅 `name` 作为 MenuItem 文本（`DebateSetting.jsx:762-764`）；createdAt/updatedAt/shareEnabled 不展示 |
| 查询条件 | 无（无搜索/筛选） |
| 行操作(operList) | 无行级操作；模板级操作（删除/保存/共享/发布）在页面动作区与 C2 卡 |
| 列表页跳详情 | 不适用（选中即载入编辑，同一页内） |
| admin 代管列表 | `?ownerId=` 使 CFG-LIST 代读目标用户模板（仅 admin 生效，非 admin 携带 403） |

## 5. 表单页（字段级规格）

**表单形态**：独立页面（字段数远超 5，Dialog 不适用——符合 d4 §3.2 阈值规则）。**无逐字段即时保存**：全部编辑仅入本地 state，统一由 A04「保存」提交；页面离开无路由守卫，仅「切换模板」动作有 dirty 确认（实现行为如实记录）。

**dirty 检测机制**：`savedSnapshotRef` 保存最近一次载入/保存时刻的 9 字段 JSON 快照（debateStages/timerSettings/stageLabels/stageOrder/stageGrace/stageAutoAdvance/teamNames/stagePid/pidOptions），`isDirty()` 逐字节对比（`DebateSetting.jsx:79-151`）。

### 5.0 字段总表

| Card | 字段 | 组件 | 约束 | 存储字段 |
|------|------|------|------|---------|
| C1 | 新模板名称 | TextField | maxLength 60；trim；前端查重 | 路径段 `:name` |
| C3 | 阶段时长（每阶段） | TextField type=number + 右侧 m:ss Chip 尾饰 | 0–3600（min/max） | `debateStages[stageId]` |
| C4 | 阶段模式（每阶段） | Select | single/double/free | `timerSettings[stageId]` |
| C4 | 宽限秒数（每阶段） | TextField type=number | 0–300，输入 clamp | `stageGrace[stageId]` |
| C4 | 自动推进（每阶段） | Switch（small） | boolean | `stageAutoAdvance[stageId]` |
| C5 | 正方队名 / 反方队名 | TextField ×2 | maxLength 20；占位 `timer.affirmative`/`timer.negative` | `teamNames.aff/neg` |
| C6 | 车标 / 线路色 | IconButton 组 ×2 | MARKER_IDS 8 选 1；LINE_COLORS 7 选 1 | `pidOptions.marker/lineColor`（默认值存 `''`） |
| C8 | 三语名称 | TextField ×3（中/英/法） | 各 maxLength 40；至少一项非空 | `stageLabels[custom_xxx]` |
| C8 | 时长 / 模式 | number TextField / Select | 1–3600 / 枚举；默认 60 / single | `debateStages` / `timerSettings` |
| C2 | 共享开关 / 署名 | Switch / TextField | 署名 maxLength 20 | shareEnabled/shareToken（CFG-SHARE）；creditName（VISIBILITY） |

### 5.1 C1 模板管理（`DebateSetting.jsx:743-809`）

- 布局：`当前模板` Select（fullWidth）+「删除模板」按钮同行（xs 纵排）；`新模板名称` TextField（maxLength 60，占位 `例如：校内赛 / 联赛赛制`）+「创建模板」按钮同行；底部 info 提示条（`templateHint`：创建=按当前编辑内容复制一份；未保存切换会确认；默认模板不可删）。
- 交互语义：创建不弹确认直接落库；删除与切换必须确认；三操作均同步刷新 Select 选项。

### 5.2 C2 大屏共享与发布（`DebateSetting.jsx:811-898`）

- 共享区：Switch（label 随态 `share.enabled/disabled`）→ 开启后展示只读 URL TextField（`{origin}/display/{encodeURIComponent(shareToken)}`）+「复制链接」（剪贴板，失败降级 alert 展示 URL）+「轮换」按钮；关闭态展示 `share.hint` 提示条。
- 发布区（分隔线之下）：发布 Switch + （已发布时）署名 TextField（maxLength 20，占位 `留空则匿名`，blur 提交）+「🌐 模板广场」跳转按钮。
- **联动注记（实现行为，跨档引用 S-02 API §1.3 / S-03 API §1.3）**：CFG-SAVE 为整档替换，**保存已发布模板会抹除 isPublic/creditName/galleryCopyCount**（模板从广场退场、热度清零）；本页保存动作对此**无专项预警**，发布开关以服务端返回为准（下次载入显示未发布）。共享凭证 shareEnabled/shareToken 不受保存影响。

### 5.3 C3 时长设置（`:901-938`）— 每阶段一卡（Grid xs12/sm6/md4），数字输入 + m:ss 换算 Chip 尾饰。

### 5.4 C4 计时模式（`:941-1014`）— 每阶段一卡：模式 Select + PID 弹层按钮 + 删除按钮同行；下行宽限秒数 + 自动推进 Switch。

### 5.5 C5 队名（`:1017-1049`）— 正/反两输入，留空用默认称谓；随 A04 保存进模板。

### 5.6 C6 PID 时间线（`:1052-1109`）+ Popover（`:1287-1344`）— 模板级车标/线色；阶段级经 C4 行内按钮弹 Popover（图标：自动+18 项；站型：自动/换乘站/普通站）。选中默认项等价于存 `''`（服务端不落库，S-02 API §3.4 pidStationType 注记）。

### 5.7 C8 添加计时项目（`:1124-1201`）— 三语名称（各 40 字）+ 时长（默认 60s，1–3600）+ 模式（默认单计时）+「添加项目」；自定义 stageId 形如 `custom_<Date.now36>`（`:73-75`）。

> **多语言阶段名实现注记**：三语名称输入**仅存在于新建环节时**——页面对**已有阶段无改名/改三语名入口**（`setStageLabels` 全部调用点为新建追加/载入回填/重置，`grep` 核实仅 `DebateSetting.jsx` 三处）；预置阶段名走 i18n `stages.<id>`。需改名只能删除重建该阶段。PRD §2.1.2.1「阶段名支持多语言」的写入口径以本实现为准。

### 5.8 提示音 Card（`:1112-1121`）— `SoundSettingsPanel`（C-01-04 域，设备本地偏好，不随模板保存；本册不展开）。

### 5.9 C9 调整顺序（`:1204-1285`）— 全阶段 List：序号 Chip（primary）+ 拖拽把手 + 名称（多语言解析）+ 副文本（m:ss · 模式）；行可拖（HTML5 DnD，拖拽行 `action.selected` 高亮、目标行 `action.hover`）；行内 ↑/↓ 精确移动（首/末禁用）；底部提示条（拖拽快速调序/箭头精确移动）。

### 5.10 底部动作区（`:1346-1369`）— 「重置为默认」（outlined）+「保存」（contained success，大号），xs 纵排/sm 横排居中。

### 5.11 保存载荷（A04 实发内容）

`buildConfigurationPayload`（`src/services/configurationShared.js:9-43`）：`schemaVersion:2 + name + debateStages + timerSettings + stageOrder + stageLabels`，extras 五项（stageGrace/stageAutoAdvance/teamNames/stagePid/pidOptions）为空则省略键；teamNames 空侧剔除。**不含** isPublic/creditName/galleryCopyCount/shareToken/shareEnabled（后果见 §5.2 注记）。

## 6. 详情页（裁剪：不适用）

本模块无独立详情页：模板「详情」即本编辑页自身（选中即载入）。模板快照的消费方详情见 S-04 比赛记录明细（另册）。

## 7. 路由定义

| 路由 | 页面 | 守卫 | 查询参数 | 锚点 |
|------|------|------|---------|------|
| `/settings` | DebateSetting | ProtectedRoute（未登录 → `/login?next=/settings`） | `?name=`（深链预选模板，优先级高于本地记忆）；`?ownerId=`（admin 代管深链，见 §8.4） | `src/App.jsx:38-45`；优先级 `src/utils/settingsScope.js:26-37` |
| 页内跳转 | 返回计时台 `/`（AppBar 返回钮）；广场 `/gallery`；登录 `/login`（退出后）；管理台 `/admin`（仅 admin） | — | — | `DebateSetting.jsx:672,723,893,693` |

路由表集中声明于 `src/App.jsx`，页面经 `React.lazy` 懒加载（`App.jsx:9`）。

## 8. 全局一致性

### 8.1 反馈组件（全站统一，`src/context/FeedbackContext.jsx`）

| 组件 | 行为 | 锚点 |
|------|------|------|
| notify | Snackbar 底部居中，filled Alert，autoHide 4000ms，clickaway 不关 | `FeedbackContext.jsx:139-154` |
| confirm | Promise 化 Dialog：取消（inherit）/确定（contained，autoFocus）；可配 confirmColor（warning/error）与确认钮文案 | `:156-185` |
| alert | 单钮 Dialog（`common.ok` 知道了），Promise 化 | `:187-208` |

### 8.2 请求与会话

- axios 实例 `withCredentials`（Cookie 会话）；`validateStatus:()=>true` 使服务层以 `data.success` 判定成败（`src/services/apiClient.js:12-19`）。
- **401 全局弹回**：非公开路径（`/login`、`/display`、`/gallery` 之外）收到 401 → `window.location.assign('/login?next=<当前路径+查询>')`（`apiClient.js:21-30`）。
- 错误消息透传：服务层把服务端 message 拼入本地前缀（`toServiceError`，`apiClient.js:32-40`），最终经 notify 展示。

### 8.3 多语言与主题

- react-i18next 三语（zh-Hans/en/fr-CA）；每页 AppBar 内嵌 `LanguageSwitcher`；文案零硬编码（A14 按钮的 🌐 前缀是唯一例外，如实记录）。
- MUI ThemeProvider 暗色模式：AppBar 内太阳/月亮 IconButton 切换（`useColorMode`），AppBar 亮色 primary/暗色 paper 双形态（`DebateSetting.jsx:651-665`）。

### 8.4 admin 代管差异（同页行为，注册用户不可见）

- `?ownerId=` 仅 admin 生效；admin 编辑**本人**模板时经 `normalizeOwnerScope` 归一为普通访问（无横幅、记忆照写，`src/utils/settingsScope.js:11-19`）；代管**他人**时页面顶部渲染 warning 横幅（`admin.editingOtherUser`，`DebateSetting.jsx:732-736`），且 localStorage 记忆**不写**（`:221-223`）。
- E2E 回归：`e2e/admin-deeplink.e2e.js:72-82` 两例（本人无横幅+深链预选 / 他人保留横幅）——本次执行通过。

### 8.5 SSE 不订阅（实现注记）

模板变更 SSE（CFG-STREAM `change` 事件）由**计时台**订阅重载（`src/timer/useDebateConfig.js:143`）；**本设置页不订阅**——多端同时编辑设置页不互相同步（各页编辑内容独立，保存后事件驱动计时台刷新）。如实归档。

### 8.6 其他全局项

- PWA：`OfflineBanner` 全局断网横幅（`src/App.jsx:23`）；页面挂载时 body 加 `settings-body` 类（`DebateSetting.jsx:234-239`）。
- 响应式：Card 内动作行统一 `direction={{xs:'column',sm:'row'}}`；阶段卡 Grid `xs12/sm6/md4`。
- 可访问性：AppBar 工具区 `role="toolbar"` + aria-label；各 IconButton 带 aria-label/Tooltip（`DebateSetting.jsx:686-717`）；无 data-testid，E2E 以 role/name 查询定位。
- 页面标题 `辩论计时器设置`（`settings.pageTitle`）。

## 9. 文档版本与变更记录

**变更类型词汇表**：同引擎分册（initial / interaction_changed / field_added 等）。版本号 `vMAJOR.MINOR`。

| 版本 | 日期 | 变更类型 | 变更说明 | 目标节 |
|------|------|---------|---------|--------|
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：16 Action、9 Card 字段级规格、dirty 快照机制、深链优先级、admin 代管差异成文；如实注记三处实现行为：已有阶段无改名入口（§5.7 注记）、已发布模板保存退场无预警（§5.2）、设置页不订阅 SSE（§8.5） | §2/§5/§8 |

### 输出校验记录（机械自检，逆向归档如实记录）

> d4 §「交互质量检查清单」引用的 141 项明细文件（scm-frontend-spec/checklist.md）未随本引擎 payload 分发（已核查设计分册目录仅 SKILL.md + d1~d4 共 5 文件），本记录按 d4 分册给出的 9 节框架逐节自检：

| # | 项 | 结果 |
|---|----|------|
| M1 | 9 节结构完整（元信息/Action/字典/列表/表单/详情/路由/全局一致/版本） | ✅（§4 列表页为适配说明、§6 详情页裁剪标注） |
| M2 | 每个 Action 有接口映射 + 成功/失败反馈 + 锚点 | ✅ §2 表 16 行 |
| M3 | 字典/枚举有来源 | ✅ §3（服务端枚举引用 S-02 API §3.4；图标/色板指向前端注册表） |
| M4 | 字段级约束完整（长度/范围/默认值） | ✅ §5.0 总表 + 各 Card 节 |
| M5 | 路由与守卫 | ✅ §7（App.jsx 锚点） |
| M6 | 全局组件复用一致性（反馈/主题/i18n/401） | ✅ §8 |
| M7 | 变更记录含本次行 | ✅ §9 v1.0 initial |
| M8 | 逆向注记与 API 档差异说明互相引用 | ✅ §5.2 ↔ S-02 API §1.3 / S-03 API §1.3 |
