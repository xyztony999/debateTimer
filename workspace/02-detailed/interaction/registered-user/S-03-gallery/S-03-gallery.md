# S-03 模板广场 交互设计 PageSpec（注册用户视角）

| 属性 | 值 |
|------|-----|
| 模块编码 | S-03（应用域：支撑业务域） |
| 文档性质 | 逆向归档：系统已上线，本文档如实反映现有实现（组件/交互/文案均为现网事实，非理想化重设计） |
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 用户类型 | 注册用户（发布/复制/署名）；访客可匿名浏览（浏览面同一页，无登录门槛）；下架属管理员（另册引用） |
| 业务类型 | 内容分发（无自有聚合根：S-02 模板之上的公开匿名投影 + 发布标志写侧 + 复制计数行为） |
| 页面类型 | hybrid（卡片列表页 + 详情 Dialog + 深链路由驱动弹层） |
| 上游依据 | S-03 API 设计 v1.0；S-03 PRD v1.0；FL v1.0 §2.2.1.3（菜单：广场·发布 / 广场·复制）、§2.4.1.2（访客浏览） |
| 实现锚点 | `src/GalleryPage.jsx`（335 行）、`src/services/GalleryService.js`、发布入口 `src/DebateSetting.jsx:858-898`（S-02 页承载）、`src/App.jsx:28-29` |
| 行为验证 | `bunx playwright test e2e/gallery.e2e.js …` → 7 passed（2026-11-11，本机执行；gallery 3 例覆盖列表/搜索/详情弹层） |

> **栈适配声明**：同 S-02 册——vue3-engine 组件映射为 📎 参考实现，本册按实际 React 19 + MUI 组件如实归档。
>
> **交互确认说明**：分册 Step 4 的 7 项交互确认在本流水线无人工环节，以「现有实现即确认结论」替代——结论即本册 §1（元信息：hybrid 大厅页）、§4（查询条件=搜索+排序、卡片列）、§2（操作集合）、§5（详情 Dialog 区块）的如实归档内容。

## 1. 模块元信息

| # | 项 | 值 | 锚点/说明 |
|---|----|----|----------|
| 1.1 | 模块编码 | S-03 | API 档同编码 |
| 1.2 | 页面 | 模板广场 `/gallery` + 详情深链 `/gallery/:id`（实现 `src/GalleryPage.jsx`，路由双注册同组件） | `src/App.jsx:28-29`；`:id` 存在时自动打开详情 Dialog |
| 1.3 | 访问门槛 | **公开页面**（无 ProtectedRoute）：GAL-LIST/GAL-DETAIL 匿名可调（`skipAuthRedirect:true`）；复制/发布需登录 | `src/App.jsx:28-29`；`src/services/GalleryService.js:19,39`；鉴权矩阵 S-03 API §3.3 |
| 1.4 | 业务类型 | 内容分发（投影只读 + 二元可见性） | S-03 API 档表头 |
| 1.5 | 页面类型 | hybrid：列表（卡片网格）+ 详情 Dialog（路由 `/gallery/:id` 驱动，深链可直达） | d4 §2.2「大厅页面默认 hybrid」 |

**「发布」入口位置（实现事实）**：发布/撤回/署名的 UI **不在本页**，承载于模板设置页 C2 卡（Switch + 署名 TextField，`src/DebateSetting.jsx:858-898`）——与 FL 菜单「广场·发布」归 S-03 语义一致，交互字段级规格见 S-02 PageSpec §5.2，接口语义见 S-03 API §4.4 VISIBILITY。本页覆盖 FL 菜单「广场·复制」及访客「广场浏览」。

## 2. Action 定义

| 编码 | 名称 | 触发交互 | 前置/禁用 | 调用接口 | 成功反馈 | 失败反馈 | 锚点 |
|------|------|---------|----------|---------|---------|---------|------|
| A01 | 搜索 | 搜索框输入（placeholder `搜索模板名…`，SearchIcon 前饰） | **300ms 防抖**后以 trim 文本发起；变更即重查（游标复位） | GAL-LIST `?q=` | 结果即时刷新 | 页面级 error 态（A05 重试） | `GalleryPage.jsx:51-52,71-74` |
| A02 | 排序切换 | ToggleButtonGroup 互斥两钮：`最新`(ScheduleIcon)/`最热`(WhatshotIcon) | 空值点击忽略（`value && setSort`） | GAL-LIST `?sort=updated\|copies`（缺省 updated 不传参） | 列表重查刷新 | 同上 | `GalleryPage.jsx:53,185-197` |
| A03 | 加载更多 | 列表底部 outlined 按钮（仅 `nextBefore` 非空时渲染） | 无禁用态（records 册同位按钮有 loading 态，本页无——如实记录差异） | GAL-LIST `?before=<nextBefore>` | 追加渲染（不清空已有） | 页面级 error 态 | `GalleryPage.jsx:45,248-257` |
| A04 | 打开详情 | 卡片 CardActionArea 点击 | 无 | 无预取：路由跳转 `/gallery/:id`，由深链 effect 触发 GAL-DETAIL | Dialog 打开（loading→loaded） | `detailState='missing'` → StatusPage notFound | `GalleryPage.jsx:100-102,77-98` |
| A05 | 关闭详情 | Dialog onClose / 「取消」按钮 | 无 | 无 | 清 detail + 路由回 `/gallery` | — | `GalleryPage.jsx:104-108,310` |
| A06 | 复制到我的模板 | Dialog 底部 contained 按钮（ContentCopyIcon） | **仅登录用户渲染**；名称为空 → 行内 error Alert `请输入模板名称`（不弹 notify）；busy 时禁用并显示 `…` | 组合三步：GAL-DETAIL → CFG-SAVE（S-02 接口，见 §5.4）→ GAL-COPY 计数（fire-and-forget，失败 console.warn 静默） | **`navigate('/settings')` 直达模板设置页**（复制产物即当前编辑模板） | 行内 error Alert（服务端 message 或 `复制失败`） | `GalleryPage.jsx:110-127,311-319`；组合 `GalleryService.js:104-128` |
| A07 | 登录后复制 | Dialog 底部 contained 按钮（未登录态渲染，文案 `登录后复制`） | 仅 `!user` 渲染 | 无（路由跳转） | → `/login?next=/gallery/:id`（登录成功回跳本详情） | — | `GalleryPage.jsx:320-327` |
| A08 | 发布/撤回（设置页承载） | 见 S-02 PageSpec §5.2 A12 | — | VISIBILITY | — | — | `DebateSetting.jsx:373-382` |
| A09 | 署名（设置页承载） | 见 S-02 PageSpec §5.2 A13 | — | VISIBILITY | — | — | `DebateSetting.jsx:384-399` |
| A10 | 下架（管理员，另册） | 管理台行内按钮 + `gallery.unpublishConfirm` 确认 | admin 鉴权 | GAL-UNPUBLISH `{unpublished:boolean}`（幂等，重复下架 200 不报错） | — | — | `src/AdminPage.jsx:342-353`；接口 S-03 API §4.4 |

**初始化序列**：挂载即 `load({q:query, sort})`（GAL-LIST）；首屏 loading 态（`GalleryPage.jsx:43,55-68,129-135`）。

## 3. 字典 Key 清单

| 字典 Key | 值/选项 | 来源 | 消费点 |
|---------|--------|------|--------|
| gallerySort | `updated` / `copies`（服务端白名单，未知回落 updated） | S-03 API §3.4；前端 ToggleButton 值硬编码同值 | A02 |
| visibilityState | unpublished/published（存储为 isPublic 布尔） | S-03 API §3.4 | 发布 Switch（设置页） |
| stageTimingMode | single/double/free | S-02 §3.4；仅以派生串 `modeSummary`（如 `single×8 · free×1`）呈现，本页无逐阶段模式选择 | 卡片/详情副文本 |
| i18n 命名空间 | `gallery.*`（17 keys：title/search/sortUpdated/sortCopies/stageCount/credit/copy/copyName/copySuffix/copyFailed/loginToCopy/empty/noMatch/loadFailed/unpublish/unpublishConfirm/publicChip）、`records.loadMore/retry`、`common.cancel`、`settings.templateNameRequired` | `src/locales/{zh-Hans,en,fr-CA}.json` | 全页文案 |
| 阶段显示名 | 详情阶段名：当前语言 → `zh-Hans` → `en` → stageId 本身 | `GalleryPage.jsx:29-34`（本页独立实现，与 `stageDisplayName.js` 回落链略异——如实记录：此处无 i18n 预置名回退） | 详情阶段行 |

## 4. 列表页（广场卡片网格）

| 维度 | 实现 | 锚点 |
|------|------|------|
| 布局 | `Container maxWidth="md"`；Grid 两列（xs12/sm6），spacing 2 | `GalleryPage.jsx:163,209-211` |
| 数据源 | GAL-LIST：`{items, nextBefore}`，默认 limit 20，游标分页无跳页 | S-03 API §4.4 |
| 查询条件 | 搜索框 1 个（q，防抖 300ms）+ 排序组 1 个（updated/copies） | §2 A01/A02 |
| 卡片表面 | variant="outlined"，圆角 16px，hover 上浮 2px + 阴影 + 边框转 primary.main（与记录页共用同款 surface，`GalleryPage.jsx:212-225`） | — |
| 卡片内容 | `name`（h6 noWrap）；Chip×3：`{{n}} 个阶段`（filled）/ 总时长（outlined，`Xm` 或 `Xm Ys`，`formatDuration :23-27`）/ 复制热度（outlined + WhatshotIcon，`copies\|\|0`）；caption 行：`modeSummary · updatedAt.toLocaleDateString()` + （有署名时）` · 贡献者：{{name}}` | `:227-243` |
| 匿名性 | 卡片/详情全链路无归属人字段；`creditName` 是唯一可选署名（属主未填则完全匿名） | S-03 API §4.1 I5 |
| 空态 | 有搜索词 → info outlined `没有匹配的模板`；无搜索词 → `广场还没有公开模板。发布你的赛制，或在服务器用导入脚本预置。` | `:204-207` |
| 错误态 | error Alert `加载失败` + 「重试」按钮（`records.retry`） | `:199-203` |
| 加载态 | 首屏整页居中 CircularProgress | `:129-135` |
| 429 限流 | 服务端 120/min/IP 共享桶（S-03 API §3.2）；前端无专项提示，命中时按错误态呈现（`gallery.loadFailed`）——如实记录 | — |

## 5. 详情页（Dialog + 深链）

### 5.1 打开机制

`/gallery/:id` 路由驱动 Dialog（`open={Boolean(id)}`，maxWidth="sm" fullWidth）：深链直达、卡片点击经路由进入（历史栈一致）；关闭一律 `navigate('/gallery')`（`GalleryPage.jsx:77-108,262`）。三态：loading（Dialog 内小号 spinner）/ missing（`StatusPage variant="notFound"`：未发布与不存在统一 404，不泄露存在性）/ loaded。

### 5.2 内容区块

| 区块 | 内容 | 锚点 |
|------|------|------|
| 标题 | 模板名（DialogTitle） | `:271` |
| 摘要 Chip×3 | 阶段数 / 总时长 / 复制热度（同卡片） | `:273-277` |
| 署名 | `贡献者：{{name}}` caption（仅属主署名时渲染） | `:278-282` |
| 阶段清单 | 逐阶段行：名称（多语言回落）+ 时长（m:ss）；顺序按 `stageOrder`（缺省按 debateStages 键序） | `:283-294` |
| 复制名称 | TextField（label `新模板名称`，仅登录用户渲染），默认值 `原名 (副本)`（`gallery.copySuffix` trim 拼接，深链打开时同样预填） | `:89,295-304` |
| 错误提示 | 行内 error Alert（复制失败/名称必填） | `:305-307` |

### 5.3 复制组合语义（客户端三步，S-03 API §4.3 如实归档）

```
① GAL-DETAIL 读全量展示字段（读活文档）
② CFG-SAVE 以登录者名义落库（PUT /api/configurations/<新名>）
   字段范围：debateStages/timerSettings/stageOrder/stageLabels
             + stageGrace/stageAutoAdvance/teamNames
   不随复制：stagePid/pidOptions（PID 装饰不带走）、共享/发布标志与热度
   （GalleryService.js:104-123，extras 仅三项增强字段——锚点核实）
③ GAL-COPY 计数上报（fire-and-forget；失败 console.warn 静默，不影响复制结果）
成功 → navigate('/settings')（模板设置页呈现复制产物）
```

幂等性：非幂等——重复复制产生多副本、同名自有模板被覆盖（upsert 语义，S-03 API §4.3）；页面无二次确认（实现行为如实记录）。

### 5.4 未登录态差异

复制名称输入框不渲染；底部按钮替换为「登录后复制」→ `/login?next=/gallery/:id`（登录后回跳自动重开本详情）；浏览/搜索/排序不受影响（匿名可浏览）。

## 6. 详情页（补充：非只读场景收口）

本页详情 Dialog 内嵌复制动作（§5.3），非纯只读详情——已在 §5 完整归档，无另设编辑面。广场内**无编辑**（PRD §3.2 边界）。

## 7. 路由定义

| 路由 | 组件 | 守卫 | 参数 | 锚点 |
|------|------|------|------|------|
| `/gallery` | GalleryPage | 无（公开） | — | `src/App.jsx:28` |
| `/gallery/:id` | GalleryPage（同组件，`:id` 驱动详情 Dialog） | 无（公开） | 路径段 id = 模板 ObjectId（24-hex）；非法 id 服务端按 404（`Template not found`） | `src/App.jsx:29`；S-03 API §3.1 |
| 页内跳转 | 返回钮：登录用户 → `/`，访客 → `/login`；复制成功 → `/settings`；关闭详情 → `/gallery`；未登录复制 → `/login?next=` | — | — | `GalleryPage.jsx:144,123,107,323` |

## 8. 全局一致性

### 8.1 反馈组件 — 同 S-02 册 §8.1（FeedbackContext 三件套）；本页仅使用行内 Alert + StatusPage，无 notify/confirm 调用（复制失败走 Dialog 内 Alert）。

### 8.2 请求与会话

- 广场请求 `skipAuthRedirect:true`（匿名页不触发 401 弹回，`GalleryService.js:19,39`；`apiClient.js:8-10` 公开路径清单含 `/gallery`）。
- 服务层返回 `{success, status, notFound?}`，页面以 `notFound`（404）区分「不存在/未发布」与加载失败（`GalleryPage.jsx:91-93`）。

### 8.3 多语言与主题 — 同 S-02 册 §8.3（LanguageSwitcher + 暗色切换在本页 AppBar，`GalleryPage.jsx:152-159`）；AppBar 与计时台同款带 BrandMark（`:139-161`，源码注释标注「PageSpec S-04 v1.1 G1」表面一致性约束）。

### 8.4 访客/注册用户同页差异汇总

| 能力 | 访客 | 注册用户 |
|------|------|---------|
| 浏览/搜索/排序/加载更多/详情 | ✓ | ✓ |
| 复制名称输入 + 复制按钮 | ✗（渲染「登录后复制」） | ✓ |
| 发布/署名入口 | ✗ | ✓（在模板设置页 C2 卡） |
| 下架 | ✗ | ✗（仅管理员，管理台） |

### 8.5 其他全局项

- 响应式：搜索/排序行 xs 纵排 sm 横排；卡片 xs12/sm6；Dialog maxWidth sm。
- 可访问性： AppBar 图标钮带 title；无 data-testid，E2E 以 role/name/placeholder 定位（`e2e/gallery.e2e.js:15-62`）。
- 页面标题 `模板广场`（`gallery.title`）+ BrandMark 品牌标。

## 9. 文档版本与变更记录

**变更类型词汇表**：同引擎分册。版本号 `vMAJOR.MINOR`。

| 版本 | 日期 | 变更类型 | 变更说明 | 目标节 |
|------|------|---------|---------|--------|
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：10 Action、卡片列表/详情 Dialog 字段级规格、复制客户端三步组合（含不随复制字段）、访客/登录态差异成文；实现事实注记：发布入口在设置页（§1）、复制成功直达设置页（§2 A06）、加载更多无 busy 态（§2 A03） | §1/§2/§5 |

### 输出校验记录（机械自检，逆向归档如实记录）

> 同 S-02 册说明：141 项 FX 明细文件未随引擎 payload 分发，按 9 节框架逐节自检。

| # | 项 | 结果 |
|---|----|------|
| M1 | 9 节结构完整 | ✅（§6 为详情页收口说明） |
| M2 | Action 接口映射 + 反馈 + 锚点 | ✅ §2 表 10 行（A08/A09/A10 为跨册引用） |
| M3 | 字典/枚举有来源 | ✅ §3（gallerySort/visibilityState 引 S-03 API §3.4） |
| M4 | 列表/详情字段级完整（含空态/错误态/加载态） | ✅ §4/§5 |
| M5 | 路由双注册 + 深链语义 | ✅ §7 |
| M6 | 全局组件复用一致性 | ✅ §8 |
| M7 | 变更记录含本次行 | ✅ §9 v1.0 initial |
| M8 | 与 S-02 册/API 档交叉引用闭合 | ✅ §1 发布入口 ↔ S-02 §5.2 ↔ S-03 API §4.4；§5.3 ↔ S-03 API §4.3 |
