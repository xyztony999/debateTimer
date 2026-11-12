# PageSpec — 管理后台页（管理员视角）

| 属性 | 值 |
|------|-----|
| 文档性质 | 逆向归档：系统已上线，本文档如实反映现有实现（组件/文案/交互均为现网事实，非理想化重设计） |
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 用户类型 | 管理员（唯一可见/可操作角色；页面级双守卫，见 §7） |
| 覆盖页面 | `/admin` 管理后台（src/AdminPage.jsx，406 行，单页三卡布局） |
| 上游依据 | FL v1.0 §2.3（用户治理 D-01 / 配置治理 D-01 / 注册准入开关 S-01-03 / 广场下架 S-03-04）；AA v1.0 §2.3.1 / §2.3.2 / §2.2.1.3 / §2.2.3.4；API 文档 api-D-01-admin.md、api-D-02-settings.md、api-S-03-gallery.md（GAL-UNPUBLISH）、api-S-01-auth.md（LOGOUT） |
| 实现锚点 | src/AdminPage.jsx、src/services/adminService.js、src/services/GalleryService.js:76-92、src/components/ProtectedRoute.jsx、src/context/FeedbackContext.jsx、src/App.jsx:62-69 |
| 交互确认方式 | d4 分册 Step 4 七项确认在本流水线运行中无交互用户，以「逐项对代码核对」替代（逆向归档，确认记录见 §8.0） |

> 组件命名说明：本栈（react-vite-web）无 d4 分册中的 ScmListPage/ScmCardPage 组件映射（📎 该映射为 vue3-engine 参考实现），页面按本栈规约为 MUI 函数组件 + hooks（profiles/react-vite-web/skills/frontend-specs/SKILL.md「组件与状态」）。下文组件均以实际 MUI 组件名如实登记。

## 1. 模块元信息（FX-001~005）

| # | 项 | 值 |
|---|----|----|
| FX-001 | 模块编码/名称 | 页面归属多模块（FL 菜单组「用户治理 / 配置治理」= D-01、「注册准入开关」= S-01-03、「广场下架」= S-03-04），按页面归档为 `admin/admin-page`（input：FL §2.3；本页无独立模块编码，编码以 AA 为准挂在各域） |
| FX-002 | 所属 App / 技术栈 | debate-timer SPA（React 19 + Vite + MUI），路由 `/admin`，懒加载 `React.lazy`（src/App.jsx:11,62-69） |
| FX-003 | 业务类型 | master_data / 台账治理（承 api-D-01-admin.md「功能类型：台账+主数据治理」，无状态机单据、无审批流） |
| FX-004 | 页面类型 | config（三卡纵向堆叠 Card×3，非 hybrid：无 Tab 切换、无左树右表、无拖拽/画布/实时试算） |
| FX-005 | 布局骨架 | sticky AppBar（返回/标题/语言/暗色/退出）+ Container maxWidth="lg" + Stack spacing=3（AdminPage.jsx:127-168）；body 挂 `settings-body` 类（AdminPage.jsx:90,93） |

## 2. Action 定义（FX-006~016）

> 命名对应 d4「前端维护完整按钮集合及事件映射」。本系统后端**无 operList 返回值**（api-D-01-admin.md §1.3 DA-1：权限为路由级双中间件，前端按钮可见性/可用性由**前端本地规则**计算）——逆向归档如实登记，见 §4.4 operList。

| Action | 触发控件 | 接口（API 文档编码） | 服务函数 | 前端锚点 |
|--------|---------|---------------------|---------|---------|
| listUsers | 页面载入 / 各操作成功后 refresh | GET /api/admin/users（D-01 A1） | adminService.listUsers（adminService.js:3-13） | AdminPage.jsx:66-70 |
| createUser | 「创建用户」提交按钮 | POST /api/admin/users（D-01 A2） | adminService.createUser（adminService.js:15-25） | AdminPage.jsx:97-112 |
| updateUserDisabled | 行按钮「禁用/启用」 | PATCH /api/admin/users/:id（D-01 A3，body `{disabled}`） | adminService.updateUser（adminService.js:27-37） | AdminPage.jsx:230-240 |
| updateUserRole | 行按钮「设为管理员/设为用户」 | PATCH /api/admin/users/:id（D-01 A3，body `{role}`） | 同上 | AdminPage.jsx:241-253 |
| deleteUser | 行按钮「删除」→ 确认弹窗 | DELETE /api/admin/users/:id（D-01 A4） | adminService.deleteUser（adminService.js:39-49） | AdminPage.jsx:254-274 |
| listAllConfigurations | 页面载入 / refresh | GET /api/admin/configurations（D-01 A5） | adminService.listAllConfigurations（adminService.js:51-61） | AdminPage.jsx:66-70 |
| deleteConfiguration | 行按钮「删除」→ 确认弹窗 | DELETE /api/admin/configurations/:id（D-01 A6） | adminService.deleteConfigurationById（adminService.js:89-101） | AdminPage.jsx:356-375 |
| unpublishGalleryTemplate | 行按钮「下架」（仅公开模板）→ 确认弹窗 | POST /api/gallery/:id/unpublish（S-03 GAL-UNPUBLISH，复用非本域端点，api-D-01-admin.md §5.1） | GalleryService.unpublish（GalleryService.js:76-92） | AdminPage.jsx:335-355 |
| getRegistrationSetting | 页面载入 / refresh | GET /api/admin/settings/registration（D-02 S1） | adminService.getRegistrationSetting（adminService.js:63-73） | AdminPage.jsx:66-70 |
| updateRegistrationSetting | 「开放注册」Switch | PUT /api/admin/settings/registration（D-02 S2） | adminService.updateRegistrationSetting（adminService.js:75-87） | AdminPage.jsx:114-125,388-399 |
| editOnBehalf（跳转） | 行按钮「编辑」 | 无接口——路由深链 `/settings?ownerId=<ownerId>&name=<name>`（api-D-01-admin.md §5.1 管理页深链约定） | — | AdminPage.jsx:309-317 |
| openDisplay（跳转） | 行按钮「打开」（仅 shareToken 存在） | 无接口——新开 `/display/<shareToken>`（noopener,noreferrer，AdminPage.jsx:322-329） | — | AdminPage.jsx:318-334 |
| logout | AppBar「退出」按钮 | POST /api/auth/logout（S-01 LOGOUT） | useAuth().logout（AuthContext.jsx:93-100） | AdminPage.jsx:156-158 |

Action 后置统一行为：成功 → `refresh()` 全量重载三数据源（AdminPage.jsx:236,249,270,350,371）；失败 → `setError(message)` 页面级错误条（AdminPage.jsx:235,248,269,349,370）。错误消息为服务端英文机器串直显（api-D-01-admin.md §3.4；toServiceError 包装带前缀，apiClient.js:32-40）。

## 3. 字典Key清单（FX-017~020）

| Key | 来源 | 消费位置 |
|-----|------|---------|
| EP-IDENT-01 `role`（admin/user） | workspace/01-solution/common-spec/enum-pool.md §3.1 | 角色列 Chip 文案（AdminPage.jsx:223，i18n `admin.roleAdmin`/`admin.roleUser`）；创建表单角色 Select 选项（AdminPage.jsx:202-203，MenuItem 字面量 `user`/`admin`——选项集未入 select-pool，逆向如实登记） |
| EP-IDENT-03 `disabled`（true/false） | enum-pool.md §3.1 | 状态列文本（AdminPage.jsx:225-227，i18n `admin.disabled`/`admin.active`） |
| EP-IDENT-02 `registrationOpen`（true/false）+ `source`（env/admin） | enum-pool.md §3.1；api-D-02-settings.md §3.4 | 注册开关 Switch checked 与标签（AdminPage.jsx:391,396-398，i18n `admin.registrationOn`/`admin.registrationOff`）；`source`/`updatedAt`/`updatedBy` 字段已返回但**页面未展示**（逆向差异注记，见 §4.3） |
| EP-CONFIG-07 `shareEnabled`/`shareToken`/`isPublic` | enum-pool.md §3.4 | 投影链接列文本 + 广场公开 Chip（AdminPage.jsx:301-306，i18n `share.enabled`/`share.disabled`/`gallery.publicChip`）；「打开」按钮条件（AdminPage.jsx:318）；「下架」按钮条件（AdminPage.jsx:335） |
| i18n 词条组 | src/locales/{zh-Hans,en,fr-CA}.json | `admin.*`（title/subtitle/usersTitle/usersDesc/templatesTitle/templatesDesc/role/roleUser/roleAdmin/status/active/disabled/actions/createUser/enable/disable/makeAdmin/makeUser/delete/owner/editTemplate/confirmDeleteUser/confirmDeleteTemplate/editingOtherUser/registrationTitle/registrationDesc/registrationOn/registrationOff）、`share.status/enabled/disabled/openDisplay`、`gallery.unpublish/unpublishConfirm/publicChip`、`settings.confirmTitle/templateCurrent/backToTimer`、`common.delete`、`auth.username/password/logout`、`timer.darkDark/darkLight`（zh-Hans 值经本文档会话逐一核读） |

下拉数据源获取（d4 §3.6 对照）：本页无字典批量接口、无 modalSelect——角色下拉为静态两值 MenuItems，其余展示字段均为列表接口直接投影。

## 4. 列表页（FX-021~051）

本页含两个列表区块（MUI `Table size="small"`，无独立路由页）。

### 4.1 用户台账（「用户」Card，AdminPage.jsx:168-282）

| # | 项 | 现网实现 |
|---|----|---------|
| FX-021 | 数据源 | GET /api/admin/users 全量（无查询条件、无分页——量级约束，api-D-01-admin.md §3.2；响应按 createdAt 升序） |
| FX-022 | 查询条件 | **无**（d4 §3.1 推断规则不适用：A1 无参数，逆向如实登记） |
| FX-023 | 刷新机制 | 挂载即查（AdminPage.jsx:89-95）+ 每次写操作成功后全量 refresh（§2 Action 后置行为） |
| FX-024 | 列序 | 用户名 → 角色 → 状态 → 操作（右对齐，AdminPage.jsx:211-216）。与 d4 列序通则差异：无序号列/编码链接列（id 不出列，仅作 React key 与请求参数），逆向如实登记 |
| FX-025 | 列定义 | ① 用户名：text（TableCell 默认）② 角色：dict（Chip size="small"，AdminPage.jsx:222-224）③ 状态：dict（纯文本无颜色标记——d4 状态色表未启用，现网无 colorTag）④ 操作：action 右对齐 Stack（AdminPage.jsx:228-276） |
| FX-026 | 工具栏 | 无传统工具栏——创建入口为 Card 内**内联表单**（非 Dialog/独立页，见 §5.1），与 d4「表单类型：<5 字段 → Dialog」推断不符，逆向如实登记（AdminPage.jsx:172-207） |

### 4.2 模板台账（「全部模板」Card，AdminPage.jsx:284-382）

| # | 项 | 现网实现 |
|---|----|---------|
| FX-031 | 数据源 | GET /api/admin/configurations 全量（updatedAt 降序，api-D-01-admin.md A5；投影 AdminListItem：id/name/ownerId/ownerUsername/createdAt/updatedAt/shareEnabled/shareToken/isPublic） |
| FX-032 | 查询条件 | **无**（同 A1，全量台账） |
| FX-033 | 列序 | 模板名（列头 i18n `settings.templateCurrent`=「当前模板」）→ 所有者 → 投影链接 → 操作（AdminPage.jsx:289-294） |
| FX-034 | 列定义 | ① 模板名：text ② 所有者：text，`ownerUsername || ownerId` 兜底（AdminPage.jsx:300——ownerUsername 缺失落空串时回显 ownerId，对应 A5 规则）③ 投影链接：dict 文本（`share.enabled`/`share.disabled`）+ `isPublic` 时附加 Chip `gallery.publicChip`=「广场公开」（color="primary"，AdminPage.jsx:301-306）④ 操作：action 右对齐 |
| FX-035 | 行点击 | 无行级链接跳转——详情/编辑一律经操作列「编辑」按钮深链（AdminPage.jsx:309-317） |

### 4.3 逆向差异注记（台账展示面）

- AdminListItem 的 `createdAt`/`updatedAt` 字段已返回但**两列均未展示**；AdminUser 的 `createdAt` 同样未展示——如实现取舍（社团量级，PRD N1），非遗漏。
- D-02 S1 响应的 `source`（env/admin 来源标记）、`envDefault`、`updatedAt`、`updatedBy` 均未在「开放注册」Card 展示——开关卡只有 Switch + 动态标签（AdminPage.jsx:388-399）。来源语义现仅存于接口层（api-S-01-auth.md REG-GET）。
- e2e/registration-toggle.e2e.js:13-25 的 mock 载荷即上述完整字段结构（测试锚点）。

### 4.4 operList（行操作按钮集与可见性规则）

> d4 核心原则对照：本系统按钮可见性**不由后端 operList 控制**（D-01 错误体无 code、接口无 operList 字段），由前端本地规则计算；越权操作由服务端双中间件兜底（401/403）。

**用户行**（AdminPage.jsx:228-276）：

| 按钮 | 可见性 | 禁用条件（disabled 属性） | 确认弹窗 | 失败提示锚点 |
|------|--------|--------------------------|---------|-------------|
| 禁用/启用（互斥文案） | 恒显 | `row.id === user.id`（不可操作自己，AdminPage.jsx:232） | 无 | 服务端 400 `You cannot disable your own account` / `Cannot disable the last admin`（api-D-01-admin.md A3） |
| 设为管理员/设为用户（互斥文案） | 恒显 | `row.id === user.id && row.role === 'admin'`（AdminPage.jsx:243——自降级允许、仅挡「自己是最后管理员」由服务端守卫） | 无 | 400 `Cannot demote the last admin`（A3） |
| 删除（color="error"） | 恒显 | `row.id === user.id`（AdminPage.jsx:257） | ✅ `confirmDeleteUser`：title `settings.confirmTitle`，message 含用户名插值，confirmLabel `common.delete`，confirmColor error（AdminPage.jsx:259-264） | 400 `You cannot delete your own account` / `Cannot delete the last admin`（A4） |

**模板行**（AdminPage.jsx:307-377）：

| 按钮 | 可见性 | 禁用条件 | 确认弹窗 | 失败提示锚点 |
|------|--------|---------|---------|-------------|
| 编辑 | 恒显 | 无 | 无（直接 navigate 深链） | —（深链目标页自身处理，见 §6 注记） |
| 打开 | 仅 `row.shareToken` 真值（shareEnabled 时为真实 token，否则 null——api-D-01-admin.md §3.4） | 无 | 无 | — |
| 下架（color="warning"） | 仅 `row.isPublic`（AdminPage.jsx:335） | 无 | ✅ `gallery.unpublishConfirm`：message 含模板名插值，confirmColor warning（AdminPage.jsx:340-344） | 404（未公开/不存在统一）、403 非 admin（api-S-03-gallery.md §3.4） |
| 删除（color="error"） | 恒显 | 无 | ✅ `admin.confirmDeleteTemplate`：message 含模板名插值，confirmLabel `common.delete`，confirmColor error（AdminPage.jsx:360-365） | 400 `Invalid configuration id` / 404 `Configuration not found`（A6） |

确认弹窗为全局 `useFeedback().confirm` Promise 化 Dialog（FeedbackContext.jsx:52-68 起，resolve boolean）；用户删除/模板删除 confirmColor=error、下架 confirmColor=warning（差异如实登记）。

### 4.5 空态与异常态

- 列表空：Table body 渲染零行，**无专用空态文案**（AdminPage.jsx:218-279 无 empty 分支）——逆向如实登记。
- 加载中：无骨架/进度指示，首帧为空表（R3 的加载态在本页两个台账上缺失，属于现状而非规范要求，登记为已知改进项）。
- 错误：页面级 `Alert severity="error"` 常驻顶部（AdminPage.jsx:166），refresh 任一数据源失败即短路显示（AdminPage.jsx:71-82 顺序 users → configs → registration）。

## 5. 表单页（FX-052~112）

### 5.1 创建用户内联表单（用户 Card 顶部，AdminPage.jsx:172-207）

| # | 项 | 值 |
|---|----|----|
| FX-052 | 表单类型 | 内联 form（Stack component="form"，响应式 direction xs:column / md:row）——**非 Dialog、非独立页**（4 字段<5，d4 推断为 Dialog，现网为内联，逆向如实登记） |
| FX-053 | 字段清单 | ① username：TextField size="small" required，label `auth.username`（AdminPage.jsx:179-185）② password：TextField type="password" required，label `auth.password`（AdminPage.jsx:186-193）③ role：FormControl+Select minWidth 140，label `admin.role`，选项 user（`admin.roleUser`）/admin（`admin.roleAdmin`），默认 `user`（AdminPage.jsx:63,194-205）④ 提交按钮：Button type="submit" variant="contained"，文案 `admin.createUser`（AdminPage.jsx:206） |
| FX-054 | 客户端校验 | 仅 required（浏览器原生）；username 仅 trim（AdminPage.jsx:100）。格式规则 `^[a-z0-9_]{3,32}$`、密码 8–200 字符**依赖服务端校验**（api-D-01-admin.md A2 校验序 1-2），错误消息直显 |
| FX-055 | 提交行为 | handleCreate：POST A2 → 成功清空 username/password 并重置 role='user'（AdminPage.jsx:108-110）+ refresh；失败 setError 保持表单值 |
| FX-056 | 提交中状态 | **无 submitting 禁用**（与登录页对照差异，逆向如实登记）——重复提交现状依赖服务端幂等（409 `Username already taken`） |
| FX-057 | 业务语义 | admin 开账号绕过注册开关（A2 规则 5），表单无任何开关提示文案——如实现 |

### 5.2 开放注册开关（Card 3，AdminPage.jsx:384-401）

| # | 项 | 值 |
|---|----|----|
| FX-062 | 控件形态 | FormControlLabel + MUI Switch（单字段设置控件，非表单） |
| FX-063 | 受控时序 | **受控开关，PUT 成功才位移**：checked=Boolean(registration?.registrationOpen)；onChange 调 handleRegistrationToggle → PUT S2 → 成功 setRegistration(result.data)，失败 setError 且开关弹回存储态（AdminPage.jsx:114-125，源码注释 114-115 明示该语义；e2e/registration-toggle.e2e.js:64-69 断言 PUT body `{registrationOpen:true}` 且 UI 跟随响应） |
| FX-064 | 禁用条件 | `regBusy || !registration`（请求期间与数据未载入时禁用，AdminPage.jsx:392） |
| FX-065 | 标签文案 | `admin.registrationOn`「注册已开放」/ `admin.registrationOff`「注册已关闭」随值切换（AdminPage.jsx:396-398）；Card 副标题 `admin.registrationDesc`「允许访客在登录页自行注册账号（首个管理员账号不受影响）」（AdminPage.jsx:386） |
| FX-066 | 幂等性 | PUT 幂等（api-D-02-settings.md S2）；重复翻转同值无副作用 |

### 5.3 不适用项

无独立表单页/多步表单（d4 §3.5 分步表单不适用：本域无 >20 字段单据、无 generate-id/位标记诉求）；无附件上传；无 modalSelect。

## 6. 详情页（FX-113~121）

**不适用**——本页无详情路由/详情 Card（d4 §3.3 推断规则不适用）。用户与模板详情以两种替代形态存在，如实登记：

| 替代形态 | 说明 |
|---------|------|
| 模板代管编辑深链 | 「编辑」→ `/settings?ownerId=<id>&name=<name>`（AdminPage.jsx:311-314）。目标页 DebateSetting 以 `normalizeOwnerScope` 归一：admin 携**自己 id** 的深链等同普通访问（无横幅、保留模板记忆）；**他人 ownerId** 保留代管作用域并显示 warning 横幅 `admin.editingOtherUser`「你正在编辑其他用户的模板。」（DebateSetting.jsx:96-102,732-736；src/utils/settingsScope.js:11-19） |
| 大屏只读外跳 | 「打开」→ 新窗口 `/display/<shareToken>`（AdminPage.jsx:322-329），归 C-02 大屏观众视角，不在本文档展开 |

深链行为回归锚点：e2e/admin-deeplink.e2e.js:72-82（本人模板无横幅 + `?name=` 预选优先于最近使用记忆；他人 ownerId 横幅保留）。

## 7. 路由定义（FX-122~125）

| # | 项 | 值 |
|---|----|----|
| FX-122 | 路由声明 | `/admin` → `React.lazy(() => import('./AdminPage'))`，元素 `<ProtectedRoute adminOnly><AdminPage/></ProtectedRoute>`（src/App.jsx:11,62-69） |
| FX-123 | 访问守卫（两层） | ① 组件层：未登录 → `<Navigate to="/login?next=/admin">`；已登录非 admin → `<Navigate to="/">`（ProtectedRoute.jsx:13-20，loading 期返回 null）② HTTP 层：axios 401 拦截器 `/login?next=<当前路径>` 重定向（`/admin` 非公共路径，apiClient.js:8-10,21-30；api-D-01-admin.md §3.1「前端协同」） |
| FX-124 | 入口 | ① 计时页用户菜单（仅 admin 可见，TimerControlPage.jsx:474-479）② 设置页 AppBar「管理」按钮（DebateSetting.jsx:693）③ URL 直达 |
| FX-125 | 出口 | AppBar 返回箭头 → `/`（AdminPage.jsx:142-146）；「退出」→ logout 成功后 navigate `/login`（AdminPage.jsx:156-158） |

## 8. 全局一致性（FX-126~137）

### 8.0 交互确认记录（d4 Step 4 七项，逆向归档以代码核对替代用户确认）

| 确认项 | 结论（代码事实） |
|--------|----------------|
| 1 模块元信息 | §1；页面类型 config、业务类型台账治理（FX-003/004） |
| 2 查询条件 | 两台账均无查询条件（FX-022/032） |
| 3 表格列 | §4.1/§4.2 列序与列定义；createdAt/updatedAt 不展示（§4.3） |
| 4 operList | §4.4；可见性为前端本地规则而非后端 operList（本节头注记） |
| 5 表单分组 | 内联创建表单（非 Dialog）+ 独立开关卡（§5.1/5.2） |
| 6 详情 Card | 不适用，以深链代管编辑替代（§6） |
| 7 页面类型覆盖 | 无 hybrid/code 覆盖（FX-004） |

### 8.1~8.12 一致性项

| # | 项 | 现网实现 |
|---|----|---------|
| FX-126 | i18n | 全文案走 `useTranslation`（AdminPage.jsx:51），三语词条组见 §3；无硬编码 JSX 文案 |
| FX-127 | 错误反馈 | 页面级 Alert 常驻 + 服务端英文消息直显（§4.5）；confirm/notify 走全局 FeedbackContext |
| FX-128 | 加载反馈 | 开关卡 regBusy 禁用（FX-064）；两台账无加载指示（§4.5 已登记为现状缺口） |
| FX-129 | 暗色模式 | AppBar color 随 darkMode 切换（darkMode 时 paper 底+primary 文字，AdminPage.jsx:129-139）；toggleDarkMode 全局（useColorMode） |
| FX-130 | 语言切换 | AppBar 内 LanguageSwitcher（AdminPage.jsx:150，三语 EP-I18N-01） |
| FX-131 | 会话与安全 | 退出即销毁会话并跳登录页；被治理用户的会话失效由服务端保证（A3/A4 destroyUserSessions，api-D-01-admin.md DA-2）——前端无本地角色缓存残留问题（AuthContext 每次挂载 /me 重取，AuthContext.jsx:55-67） |
| FX-132 | 无障碍 | 返回箭头/暗色切换带 Tooltip 与 aria-label（AdminPage.jsx:142-146,151-155）；注册开关 e2e 断言 role="switch"（registration-toggle.e2e.js:59-60） |
| FX-133 | 响应式 | 创建表单 xs 纵排 / md 横排（AdminPage.jsx:175-176）；Container maxWidth lg |
| FX-134 | 离线 | OfflineBanner 全局挂载（App.jsx:23，P-03）；管理操作离线时经 toServiceError 报网络错误消息 |
| FX-135 | 跳转安全 | 打开大屏 `window.open(..., 'noopener,noreferrer')` + `opened.opener = null` 双保险（AdminPage.jsx:322-329） |
| FX-136 | XSS/注入面 | 模板名/用户名仅作 React 文本节点渲染（无 dangerouslySetInnerHTML）与 encodeURIComponent 拼接（AdminPage.jsx:312-313） |
| FX-137 | 与 API 文档一致性 | §2 十三项 Action 与 api-D-01-admin.md A1~A6、api-D-02-settings.md S1/S2、api-S-03-gallery.md GAL-UNPUBLISH、api-S-01-auth.md LOGOUT 一一对应，无未归档接口调用（adminService.js 全量 8 函数 + GalleryService.unpublish 均已对读） |

### 8.13 已知现状缺口（逆向归档如实登记，非本文档新增设计）

| # | 缺口 | 影响 |
|---|------|------|
| G1 | 用户行无「重置密码」入口 | A3 的 `password` 字段（api-D-01-admin.md A3 规则 5）无 UI 消费面——接口能力闲置，改密仅能经注册开关外的通道（现状无自助改密，api-S-01-auth.md §1.2 不做项） |
| G2 | 台账无 createdAt/updatedAt 列 | 排序依据不可见（FX-033 注记） |
| G3 | 注册开关无来源/审计展示 | S1 返回的 source/updatedAt/updatedBy 未呈现（§4.3 注记） |
| G4 | 台账无加载态与空态文案 | §4.5 |

## 9. 文档版本与变更记录（FX-138~141）

**版本号规则**：`vMAJOR.MINOR`；页面结构/Action 集不兼容变更升 MAJOR。
**变更类型词汇**：`initial` / `structural` / `action_added|changed|removed` / `field_added|changed|removed` / `copy_changed` / `route_changed`。

| 版本 | 日期 | 变更类型 | 变更说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：管理后台页三卡（用户台账/模板台账/注册开关）13 Action 对 9 接口（D-01×6、D-02×2、S-03 复用×1）+ 深链代管编辑与 LOGOUT；operList 前端本地规则、受控开关时序、已知缺口 G1~G4 依现有实现成文 |

### 输出自检记录（d4 输出校验：机械自检表 + FX 逐条核查，本会话执行）

| # | 项 | 结果 |
|---|----|------|
| M1 | 九章节结构完整（🔒 1/2/3/7/8/9 章全存在；4/5 章实设；6 章裁剪标注） | ✅ |
| M2 | 每个 Action 有接口编码对应且 API 编码在对应 API 文档中存在 | ✅ §2 对照表 13 行逐条对读（A1~A6/S1/S2/GAL-UNPUBLISH/LOGOUT） |
| M3 | 字典 Key 均在 enum-pool.md 有定义 | ✅ EP-IDENT-01/02/03、EP-CONFIG-07（§3 逐条核对池文件行号） |
| M4 | 占位符残留 | ✅ 无（全文无 `{placeholder}` 式待填槽） |
| M5 | 变更记录含本次更新行 | ✅ §9 initial 行 |
| FX 抽核 | FX-023/FX-034/FX-055/FX-063/FX-123 逐条对照 AdminPage.jsx/ProtectedRoute.jsx 行号 | ✅ 引用行号均经本会话 Read 核实 |
