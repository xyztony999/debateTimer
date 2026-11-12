# S-04 比赛记录与复盘 交互设计 PageSpec（注册用户视角）

| 属性 | 值 |
|------|-----|
| 模块编码 | S-04（应用域：支撑业务域） |
| 文档性质 | 逆向归档：系统已上线，本文档如实反映现有实现（组件/交互/文案均为现网事实，非理想化重设计） |
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 用户类型 | 注册用户（列表/明细/导出/删除本人记录）；计时操作员（记录**保存入口**在计时台与遥控器，属 C-01 视角，另册）；管理员代读见 §8.4 |
| 业务类型 | 台账报表类（append-only：只增删、无编辑入口——与 API 档 D1 一致） |
| 页面类型 | 列表页（卡片列表）+ 详情页（汇总 Chip + 阶段明细表） |
| 上游依据 | S-04 API 设计 v1.0；S-04 PRD v1.0；FL v1.0 §2.2.1.4（菜单：比赛记录 / 记录导出） |
| 实现锚点 | `src/RecordsPage.jsx`（165 行）、`src/RecordDetailPage.jsx`（217 行）、`src/services/MatchLogService.js`、`src/utils/matchRecordCsv.js`（CSV 客户端组装）、`src/App.jsx:46-61` |
| 行为验证 | `bunx playwright test e2e/records.e2e.js …` → 7 passed（2026-11-11，本机执行；records 2 例覆盖列表卡片+超时 Chip、明细表+双侧超时标记+CSV/JSON 按钮） |

> **栈适配声明**：同 S-02 册——vue3-engine 组件映射为 📎 参考实现，本册按实际 React 19 + MUI 组件如实归档。
>
> **交互确认说明**：分册 Step 4 的 7 项交互确认在本流水线无人工环节，以「现有实现即确认结论」替代——结论即本册 §1（元信息）、§4（列表：无查询条件、卡片流）、§2（操作集合与删除确认）、§6（详情区块与明细表列）的如实归档内容。

## 1. 模块元信息

| # | 项 | 值 | 锚点/说明 |
|---|----|----|----------|
| 1.1 | 模块编码 | S-04 | API 档同编码 |
| 1.2 | 页面 | 比赛记录列表 `/records`（`src/RecordsPage.jsx`）；记录明细 `/records/:id`（`src/RecordDetailPage.jsx`） | `src/App.jsx:46-61`（两路由均 ProtectedRoute） |
| 1.3 | 入口 | 计时台 AppBar「记录」（`records.short`）；明细页返回钮回列表 | 列表入口锚点见 TimerControlPage（另册）；返回 `RecordDetailPage.jsx:77` |
| 1.4 | 业务类型 | 台账报表（记录本身无状态流转；采集/保存动作属计时台册） | S-04 API §4.2 |
| 1.5 | 页面类型 | 列表页=卡片流（非表格）；详情页=只读汇总+明细表（无编辑——append-only） | 记录无编辑/补录入口（S-04 API §1.2） |

## 2. Action 定义

| 编码 | 名称 | 页面 | 触发交互 | 前置/禁用 | 调用接口 | 成功反馈 | 失败反馈 | 锚点 |
|------|------|------|---------|----------|---------|---------|---------|------|
| A01 | 列表加载 | /records | 页面挂载自动 | 无 | ML-LIST `GET /api/match-logs`（limit 20，savedAt 降序游标） | 渲染卡片流 | error 态：Alert `加载失败` + 「重试」 | `RecordsPage.jsx:51-64,102-106` |
| A02 | 加载更多 | /records | 列表底部 outlined 按钮（仅 `nextBefore` 非空渲染） | busy 时禁用并显示 `…` | ML-LIST `?before=<savedAt>` | 追加渲染 | 同 A01 error 态 | `RecordsPage.jsx:146-158` |
| A03 | 重试 | /records | error 态「重试」按钮 | 无 | ML-LIST（复位重查） | 回到 ok 态 | 维持 error 态 | `RecordsPage.jsx:103-106` |
| A04 | 打开明细 | /records | 卡片 CardActionArea 点击 | 无 | 无预取：路由跳转 `/records/:id` | 明细页挂载自动加载 | — | `RecordsPage.jsx:115-117` |
| A05 | 明细加载 | /records/:id | 页面挂载自动 | 无 | ML-DETAIL `GET /api/match-logs/:id` | 渲染汇总+表格 | 404 → warning `记录不存在` + 返回列表钮；其他 → error `加载失败` + 返回列表钮 | `RecordDetailPage.jsx:37-54,110-124` |
| A06 | CSV 导出 | /records/:id | AppBar「CSV」按钮（FileDownloadIcon） | 无（明细已加载才有 AppBar actions） | **无服务端调用**：客户端由 ML-DETAIL 响应组装（BD-6：服务器绝不组装用户来源文本） | 触发浏览器下载 `<文件名>.csv`（Blob + a[download]） | — | `RecordDetailPage.jsx:130-137`；`matchRecordCsv.js:47-55` |
| A07 | JSON 导出 | /records/:id | AppBar「JSON」按钮 | 同上 | ML-EXPORT `GET /api/match-logs/:id/export?format=json`（`window.open` 新标签，noopener；服务端附件直出 nosniff + Content-Disposition） | 浏览器下载 `<文件名>.json` | 新标签呈现错误响应 | `RecordDetailPage.jsx:138-145`；`MatchLogService.js:90-93`；服务端语义 S-04 API §4.4 |
| A08 | 删除记录 | /records/:id | AppBar「删除」按钮（error.light 色 + DeleteOutlinedIcon） | 点击先弹确认（error 色，`删除后不可恢复，确认删除这条比赛记录？`，确认钮文案 `删除`） | ML-DELETE `DELETE /api/match-logs/:id` | `navigate('/records', {replace:true})` 回列表（物理删除无回收站） | notify error（服务端 message，如 403 删他人） | `RecordDetailPage.jsx:56-70,146-154`；确认组件 `FeedbackContext.jsx:156-185` |
| A09 | 返回列表 | /records/:id | AppBar 返回钮 / 错误态返回按钮 | 无 | 无 | `navigate('/records')` | — | `RecordDetailPage.jsx:75-81,118-120` |

**无编辑 Action**：记录 append-only（S-04 API I1），明细页不提供任何编辑/补录控件——如实归档，与「复盘发现误差只能删了重采」的产品语义一致（API 档 D1）。

## 3. 字典 Key 清单

| 字典 Key | 值/选项 | 来源 | 消费点 |
|---------|--------|------|--------|
| stageTimingMode | single/double/free | S-04 API §3.4（校验严格枚举）；展示层映射 `free→settings.freeTimer`、`double→settings.doubleTimer`、其余→`settings.singleTimer` | 明细表「模式」列 `RecordDetailPage.jsx:196` |
| recordSide | aff/neg | S-04 API §3.4；仅作字段词根，UI 无独立切换 | 表列头动态队名 |
| 队名回退 | `record.teamNames?.aff \|\| t('timer.affirmative')`、`neg \|\| t('timer.negative')`（快照缺失时用默认称谓） | `RecordsPage.jsx:66-70`；`RecordDetailPage.jsx:126-127` | 列表标题/明细表头/超时 Chip |
| i18n 命名空间 | `records.*`（30 keys：title/short/empty/loadFailed/retry/loadMore/stageCount/overruns/plannedTotal/actualTotal/truncated/subtitle/backToList/deleteConfirmTitle/deleteConfirm/notFound/stage/mode/planned/actualAff/actualNeg/overrun/saved/savedAt/save/saveHint/saveFailed…）、`common.delete`、`timer.affirmative/negative`、`settings.*Timer` | `src/locales/{zh-Hans,en,fr-CA}.json` | 全页文案 |
| 时间格式 | 明细数值列 `m:ss`（`mmss`，负值钳 0）；时刻 `toLocaleString()`/`toLocaleDateString()`（浏览器 locale，非 i18n 受控——如实记录） | `RecordDetailPage.jsx:21-26`；`RecordsPage.jsx:18-23` | 全页 |

## 4. 列表页（/records 卡片流）

| 维度 | 实现 | 锚点 |
|------|------|------|
| 布局 | `Container maxWidth="md"`；`Stack spacing={2}` 单列卡片流 | `RecordsPage.jsx:97,112` |
| 数据源 | ML-LIST：`{items:[{id,configName,teamNames,startedAt,endedAt,savedAt,stageCount,overrunCount,truncated?}], nextBefore}`（列表项不含 stages/summary） | S-04 API §4.4 ML-LIST |
| 查询条件 | **无**（无搜索/筛选/日期范围——实现如此，如实记录） | — |
| 卡片表面 | variant="outlined"，圆角 16px + hover 上浮/阴影/描边（与广场卡片共用 `recordCardSx`，源码注释标注「PageSpec S-04 v1.1 G1」表面一致） | `RecordsPage.jsx:25-36` |
| 卡片内容 | 左区：`configName · 正方 vs 反方`（h6 noWrap）+ caption `savedAt.toLocaleString() · {{n}} 个阶段`；右区：`overrunCount>0` → warning Chip（WhatshotIcon，`超时 {{n}} 次`）；否则 outlined ✓ Chip | `:113-145` |
| 排序 | savedAt 降序（服务端） | S-04 API §4.4 |
| 空态 | info outlined `还没有比赛记录。完成一场比赛后，在计时页点击「保存记录」。` | `:107-110` |
| 错误态/加载态 | error Alert + 重试 / 居中 CircularProgress | `:98-106` |
| admin 代读 | `?ownerId=` 透传 ML-LIST（仅 admin 生效；注册用户传参被服务端忽略恒查本人——与 S-02 的 403 显式拒绝不同，如实归档） | `RecordsPage.jsx:44`；S-04 API §3.1 |

## 5. 表单页（裁剪：不适用）

本模块无表单页：记录由计时台采集保存（append-only），明细页只读。记录**保存**交互（手动快照按钮/会话结束自动保存）属计时台视角（C-01/S-04-02），另册归档；本册仅覆盖查询/对比/导出/删除（FL §2.2.1.4 注册用户菜单范围）。

## 6. 详情页（/records/:id 只读明细对比）

### 6.1 AppBar

- 标题：`{configName} · {正方} vs {反方}`（noWrap）+ BrandMark；返回钮回列表。
- 动作区（标题右侧、语言/主题切换左侧）：`CSV`（继承色）/ `JSON`（继承色）/ `删除`（error.light 色）三按钮，均 small + startIcon。

锚点：`RecordDetailPage.jsx:72-96,128-156,160`。

### 6.2 汇总区（Card：outlined，圆角 16px）

| 区块 | 内容 | 锚点 |
|------|------|------|
| CardHeader | title `每场比赛的阶段实绩与超时复盘`（`records.subtitle`）；subheader `{startedAt.toLocaleString()} → {endedAt.toLocaleString()}` | `:163-166` |
| Chip 行 | `计划总计 m:ss`（outlined）/ `实际总计 m:ss`（outlined）/ `超时 {{n}} 次`（>0 warning 色，否则 default）/ `已截断`（仅 `record.truncated` 时渲染——服务端 >64 阶段截断标记） | `:168-178` |

### 6.3 阶段明细表（`Table size="small"`）

| 列 | 对齐 | 内容 | 锚点 |
|----|------|------|------|
| # | — | 行序号（index+1） | `:182,194` |
| 阶段 | — | `stage.label`（保存时刻当前语言快照名，非实时解析） | `:183,195` |
| 模式 | — | stageTimingMode → 三语文案映射（§3） | `:184,196` |
| 计划 | 右 | `mmss(plannedSeconds)` | `:185,197` |
| `{正方}` 实际 | 右 | `mmss(actualAffSeconds)`；列头动态插入队名 | `:186,198` |
| `{反方}` 实际 | 右 | 单计时阶段显示 `—`；双计时/自由辩论显示 `mmss(actualNegSeconds)` | `:187,199-201` |
| 超时 | 居中 | 按侧渲染 error Chip：`{正方} ×n` / `{反方} ×n`；双方均 0 显示 `—` | `:188,202-206` |

### 6.4 异常态

| 态 | 呈现 | 锚点 |
|----|------|------|
| 加载中 | AppBar（列表标题）+ 居中 CircularProgress | `:98-109` |
| 不存在/无权 | warning Alert `记录不存在`（服务端非法 id/不存在/非本人统一 404 `Match record not found`，S-04 API D5）+ 「返回列表」按钮 | `:110-124` |
| 加载失败 | error Alert `加载失败` + 返回按钮 | 同上 |
| 删除确认 | confirm Dialog：title `删除比赛记录`、message `删除后不可恢复，确认删除这条比赛记录？`、确认钮 error 色 `删除` | `:56-63` |

### 6.5 导出文件名与内容（导出语义细节）

- 文件名（CSV 与 JSON 同规则，客户端与服务端各自实现）：`match-YYYYMMDD-HHmm-<configName>`（时间取 startedAt 回落 savedAt）→ 非 `[A-Za-z0-9_.-]` 字符替换 `_` → 截断 80 → `.csv|.json`。客户端 `matchRecordCsv.js:39-45`；服务端 `S-04 API §4.4 exportFilename`。
- CSV 内容（`buildMatchRecordCsv`，`matchRecordCsv.js:19-37`）：UTF-8 **BOM 前缀**（Excel 中文兼容）+ 表头 `[index,stage,mode,planned,actual_aff,actual_neg,overrun_aff,overrun_neg,entered_at,exited_at]` + 逐阶段行（m:ss 时长、`x{n}` 超时、ISO 时刻）；**公式注入防护**：首字符 `=+-@\t\r` 加 `'` 前缀；含逗号/引号/换行的单元格引号包裹 + 双写引号；行尾 CRLF。
- JSON 导出为服务端附件直出，响应体即 ML-DETAIL 同构包络（`{success:true,data:toDetail}`）；URL 上 `?format=json` 为客户端语义参数，服务端仅出 JSON（S-04 API §4.4「仅 JSON 附件」，如实归档）。

## 7. 路由定义

| 路由 | 组件 | 守卫 | 参数 | 锚点 |
|------|------|------|------|------|
| `/records` | RecordsPage | ProtectedRoute | `?ownerId=`（仅 admin 代读生效） | `src/App.jsx:46-53` |
| `/records/:id` | RecordDetailPage | ProtectedRoute | 路径段 id = 记录 ObjectId | `src/App.jsx:54-61` |
| 页内跳转 | 列表→明细（卡片点击）；明细→列表（返回钮/删除成功 replace 跳转）；401 全局弹回 `/login?next=` | — | — | §2 A04/A08/A09；`apiClient.js:21-30` |

## 8. 全局一致性

### 8.1 反馈组件 — 同 S-02 册 §8.1；本模块使用 confirm（删除）与 notify（删除失败）；列表/明细错误态为页内 Alert + 重试/返回按钮。

### 8.2 请求与会话 — 同 S-02 册 §8.2（Cookie 会话、`validateStatus` 全放行、401 弹回）；服务层 `notFound` 标记驱动明细页 warning 态（`MatchLogService.js:57-63`）。

### 8.3 多语言与主题 — 同 S-02 册 §8.3（LanguageSwitcher + 暗色切换在两页 AppBar；`toLocaleString` 跟随浏览器 locale，与 i18n 语言选择独立——如实记录）。

### 8.4 角色差异汇总

| 能力 | 注册用户 | 管理员 |
|------|---------|--------|
| 列表（本人） | ✓ | ✓ |
| `?ownerId=` 代读列表/明细 | ✗（参数被忽略） | ✓ |
| 删除本人记录 | ✓ | ✓ |
| 删除他人记录 | —（查询层面已隔离，404） | 403 `Cannot delete another user's match record`（读写不对称，S-04 API D4） |
| 导出 | 本人记录 CSV/JSON | 任意记录可代读导出 |

（S-04 API §3.3 权限矩阵如实归档；注册用户视角的可见行为=仅本人数据。）

### 8.5 其他全局项

- 卡片表面与广场页共用（hover/圆角一致，两处源码注释互引「PageSpec S-04 v1.1 G1」——现有代码中的历史标注，如实保留）。
- 响应式：AppBar actions 在窄屏随 Toolbar 收缩（无专项 xs 布局，Table 横向滚动由 MUI 默认容器承载——如实记录）。
- 可访问性：AppBar 图标钮 title；无 data-testid，E2E 以 role/name 定位（`e2e/records.e2e.js:59-85`）。
- 页面标题 `比赛记录`（`records.title`）/ 明细 AppBar 标题动态拼接 + BrandMark。

## 9. 文档版本与变更记录

**变更类型词汇表**：同引擎分册。版本号 `vMAJOR.MINOR`。

| 版本 | 日期 | 变更类型 | 变更说明 | 目标节 |
|------|------|---------|---------|--------|
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：9 Action、列表卡片流/明细表字段级规格、CSV 客户端组装语义（BOM+公式防护）、JSON 附件导出、删除确认与 replace 跳转成文；实现事实注记：列表无查询条件（§4）、无编辑入口（§2 尾注）、`toLocaleString` 不受 i18n 控制（§3/§8.3） | §2/§4/§6 |

### 输出校验记录（机械自检，逆向归档如实记录）

> 同 S-02 册说明：141 项 FX 明细文件未随引擎 payload 分发，按 9 节框架逐节自检。

| # | 项 | 结果 |
|---|----|------|
| M1 | 9 节结构完整 | ✅（§5 表单页裁剪标注） |
| M2 | Action 接口映射 + 反馈 + 锚点 | ✅ §2 表 9 行 |
| M3 | 字典/枚举有来源 + 展示映射 | ✅ §3 |
| M4 | 列表/详情字段级完整（含空态/错误态/加载态/删除确认） | ✅ §4/§6 |
| M5 | 导出语义（文件名/CSV 组装/附件头）与服务端档一致 | ✅ §6.5 ↔ S-04 API §4.4 |
| M6 | 路由与守卫 | ✅ §7 |
| M7 | 全局组件复用一致性 + 角色差异 | ✅ §8 |
| M8 | 变更记录含本次行 | ✅ §9 v1.0 initial |
