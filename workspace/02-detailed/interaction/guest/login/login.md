# PageSpec — 登录页（访客视角）

| 属性 | 值 |
|------|-----|
| 文档性质 | 逆向归档：系统已上线，本文档如实反映现有实现（组件/文案/交互均为现网事实，非理想化重设计） |
| 版本 | v1.0 |
| 状态 | 稳定 |
| 最后更新 | 2026-11-11 |
| 用户类型 | 访客（主角色，FL §2.4.1.1「账号注册」+ 登录入口）；注册用户/管理员为次角色（同一页面登录，FL §2.2.1.1） |
| 覆盖页面 | `/login` 登录页（src/LoginPage.jsx，102 行，登录/注册双模式单表单）+ AuthShell 氛围壳（src/components/AuthShell.jsx） |
| 上游依据 | FL v1.0 §2.4.1.1 / §2.2.1.1；AA v1.0 §2.2.1.1（账号注册）/ §2.2.1.2（登录与登录态）/ §2.2.1.3（注册准入控制）；API 文档 api-S-01-auth.md（STATUS/REGISTER/LOGIN/LOGOUT）、api-D-02-settings.md（开关生效判定语义） |
| 实现锚点 | src/LoginPage.jsx、src/components/AuthShell.jsx、src/context/AuthContext.jsx、src/services/authService.js、src/App.jsx:26、src/utils（无，见 §7 深链） |
| 交互确认方式 | d4 分册 Step 4 七项确认在本流水线运行中无交互用户，以「逐项对代码核对」替代（逆向归档，确认记录见 §8.0） |

> 组件命名说明：本栈（react-vite-web）无 Scm* 组件映射（📎 vue3-engine 参考实现）；页面为 MUI 函数组件 + hooks（profiles/react-vite-web/skills/frontend-specs/SKILL.md）。

## 1. 模块元信息（FX-001~005）

| # | 项 | 值 |
|---|----|----|
| FX-001 | 模块编码/名称 | S-01 账号与准入（FL 菜单「注册」= S-01-01、「登录」= S-01-02）；页面归档 `guest/login` |
| FX-002 | 所属 App / 技术栈 | debate-timer SPA（React 19 + Vite + MUI），路由 `/login`，懒加载（src/App.jsx:10,26）；**公共路由**（不包 ProtectedRoute） |
| FX-003 | 业务类型 | master_data（聚合根=账号，api-S-01-auth.md「功能类型」）；注册准入为托管设置（D-02 app_settings，页面只读消费生效值） |
| FX-004 | 页面类型 | config（单卡居中表单页；AuthShell 全屏氛围底 + 居中 Card maxWidth 420，LoginPage.jsx:52） |
| FX-005 | 布局骨架 | AuthShell：全屏渐变底 + 双装饰圆环（aria-hidden，AuthShell.jsx:45-77）+ 卡片（圆角 20px，AuthShell.jsx:79-97）；卡头为品牌行（BrandMark+`timer.title`）+ LanguageSwitcher + 暗色切换（AuthShell.jsx:106-131）；正文为垂直 Stack 表单（spacing 2.5，LoginPage.jsx:53） |

## 2. Action 定义（FX-006~016）

| Action | 触发控件 | 接口（API 文档编码） | 服务函数 | 前端锚点 |
|--------|---------|---------------------|---------|---------|
| fetchStatus | 页面挂载（AuthProvider 全局，非本页显式调用） | GET /api/auth/status（S-01 STATUS，匿名） | authService.status → useAuth().status（AuthContext.jsx:35-44；authService.js:21-23） | LoginPage.jsx:29-33,83-98 消费 |
| login | 主提交按钮（mode='login'） | POST /api/auth/login（S-01 LOGIN，限流 20 次/15min/IP） | useAuth().login → authService.login（AuthContext.jsx:69-79；authService.js:29-34） | LoginPage.jsx:43-44 |
| register | 主提交按钮（mode='register'） | POST /api/auth/register（S-01 REGISTER，限流 10 次/60min/IP） | useAuth().register → authService.register（AuthContext.jsx:81-91；authService.js:36-41） | LoginPage.jsx:43-44 |
| switchMode | 底部文字按钮「已有账号？去登录 / 需要账号？去注册」 | 无接口——纯前端 setState（清错误后 toggle，LoginPage.jsx:87-90） | — | LoginPage.jsx:83-93 |
| logout | 无（本页无登出控件；登出在计时页/设置页/管理页 AppBar） | POST /api/auth/logout（S-01 LOGOUT） | useAuth().logout（AuthContext.jsx:93-100） | — |

成功后置行为：login/register 成功 → `setUser(result.data)` + `refreshStatus()`（AuthContext.jsx:74-77,86-89）→ LoginPage 因 `user` 置真重渲染为 `<Navigate to={safeNextPath(searchParams.get('next'))} replace>`（LoginPage.jsx:35-37）。状态请求带 `skipAuthRedirect` 标记，401 不触发 axios 拦截器跳转（authService.js:3；apiClient.js:22），登录页不会循环重定向。

## 3. 字典Key清单（FX-017~020）

| Key | 来源 | 消费位置 |
|-----|------|---------|
| EP-IDENT-02 `registrationOpen` / 派生 `hasUsers` | enum-pool.md §3.1；api-S-01-auth.md STATUS（`registrationState()` 快照，首用户短路恒开） | 页面形态机三分支（§4.2）+ 注册模式自动进入（LoginPage.jsx:29-33） |
| userRole（隐式） | enum-pool.md EP-IDENT-01 | 本页不展示角色；首注册必为 admin 的业务语义由注册页副标题文案表达（`auth.registerSubtitle`「第一个注册的账号会成为管理员。」，LoginPage.jsx:59；api-S-01-auth.md I2） |
| EP-I18N-01 `lng`（en/fr-CA/zh-Hans） | enum-pool.md §3.6 | AuthShell 卡头 LanguageSwitcher（AuthShell.jsx:117） |
| i18n 词条组 | src/locales/{zh-Hans,en,fr-CA}.json | `auth.loginTitle`「登录」/`auth.registerTitle`「创建管理员账号」/`loginSubtitle`「登录后可使用你自己的辩论模板。」/`registerSubtitle`/`username`/`password`/`usernameHint`「3–32 个字符：小写字母、数字、下划线」/`passwordHint`「至少 8 个字符」/`login`/`register`「创建账号」/`failed`「登录失败」/`haveAccount`「已有账号？去登录」/`needAccount`「需要账号？去注册」/`registrationClosed`「公开注册当前已关闭，请联系管理员开通账号。」；`timer.title`、`timer.darkDark/darkLight`（zh-Hans 值经本文档会话逐一核读） |

下拉数据源（d4 §3.6 对照）：本页无下拉/字典接口消费。

## 4. 列表页（FX-021~051）

**不适用**——无列表区块（单表单页）。d4 §3.1 推断规则不适用，整章裁剪。

## 5. 表单页（FX-052~112）

### 5.1 登录/注册双模式表单（LoginPage.jsx:51-99）

| # | 项 | 值 |
|---|----|----|
| FX-052 | 表单类型 | 单页表单（Stack component="form"）；登录与注册**共用同一组字段**，以本地 state `mode`（'login'\|'register'，默认 'login'）切换标题/按钮文案与 autoComplete（LoginPage.jsx:27,56,74,81）——**非两个路由、非 Dialog** |
| FX-053 | 字段清单 | ① username：TextField required，autoComplete="username"，helperText=`auth.usernameHint`（LoginPage.jsx:63-70）② password：TextField required type="password"，autoComplete 按 mode 切换 `new-password`/`current-password`，helperText=`auth.passwordHint`（LoginPage.jsx:71-79）③ 主按钮：Button variant="contained" size="large"，文案 `auth.register`（注册模式）/`auth.login`（登录模式），`disabled={submitting}`（LoginPage.jsx:80-82） |
| FX-054 | 客户端校验 | 仅 required；提交时 username trim（LoginPage.jsx:44）。格式规则（用户名 `^[a-z0-9_]{3,32}$`、密码 8–200）**依赖服务端**（api-S-01-auth.md §3.4 错误码表 400 行），helperText 仅作提示不作校验 |
| FX-055 | 提交行为 | submit：清错误 → submitting=true → 按 mode 调 login/register(username.trim(), password) → submitting=false；失败 `setError(result.message \|\| t('auth.failed'))`（LoginPage.jsx:39-49）；成功由 §2 后置行为接管跳转 |
| FX-056 | 错误展示 | 表单顶部 `Alert severity="error"`（LoginPage.jsx:62）；消息为服务端单一事实源英文串直显（如 `Invalid username or password`、`Registration is closed`、`Account is disabled`——api-S-01-auth.md §3.4），无 message 时回落 `auth.failed` |
| FX-057 | 模式自动进入 | useEffect：`status.registrationOpen && !status.hasUsers` → `setMode('register')`（LoginPage.jsx:29-33）——全新部署（空库+恒开）访客落到「创建管理员账号」形态（FL §2.4.1.1 备注「首个注册用户成为管理员」的界面表达） |
| FX-058 | 模式切换可见性 | 仅 `status.registrationOpen && status.hasUsers` 时渲染切换文字按钮（LoginPage.jsx:83-93）；注册关闭 + 已有用户时按钮不渲染，改渲染关闭提示（FX-061） |
| FX-059 | 提交中状态 | submitting 禁用主按钮（LoginPage.jsx:80） |
| FX-060 | 标题/副标题 | 按 mode 切换：登录模式 `loginTitle`/`loginSubtitle`；注册模式 `registerTitle`/`registerSubtitle`（LoginPage.jsx:55-60） |

### 5.2 注册关闭提示（LoginPage.jsx:94-98）

| # | 项 | 值 |
|---|----|----|
| FX-061 | 触发条件 | `status.hasUsers && !status.registrationOpen`（分支序：83 开关按钮 → 94 关闭提示 → 98 null） |
| FX-062 | 形态 | `Typography variant="caption"` 灰字居中，文案 `auth.registrationClosed`「公开注册当前已关闭，请联系管理员开通账号。」——**非 Alert、不可点击、无跳转**（与 FL S-01-01「关闭时提示联系管理员」对应的最简实现，如实登记） |
| FX-063 | 生效语义 | 页面消费的是 `/api/auth/status` 的**生效值**（首用户短路 > 管理台存储值 > env 回落，api-D-02-settings.md §3.4）；管理台翻转开关后，访客下次加载页面读到新值（无实时推送——api-D-02-settings.md §4.5「写设置不广播 SSE」） |
| FX-064 | 注册关闭时提交 | 表单仍可提交（本页不因关闭禁用注册提交——服务端 403 `Registration is closed` 兜底直显，api-S-01-auth.md REGISTER 错误表；e2e/registration-toggle.e2e.js:72-85 仅断言提示可见与切换按钮不渲染，未断言表单禁用——逆向如实登记） |

### 5.3 首绘瞬时态注记（逆向如实登记）

status 的 Context 缺省值为 `{hasUsers:true, registrationOpen:false}`（AuthContext.jsx:15,25），`/api/auth/status` 返回前页面按该缺省渲染——已部署系统的访客会短暂看到「注册关闭」提示后切换为实际形态。加载期 `loading=true` 不阻塞本页渲染（本页无 ProtectedRoute 包裹）。已登记为现状行为，非缺陷修复项。

### 5.4 不适用项

无分步表单（d4 §3.5）、无附件、无 modalSelect、无条件显隐字段（双模式仅切换文案与 autoComplete，字段集恒定）。

## 6. 详情页（FX-113~121）

**不适用**——无详情区块，整章裁剪。

## 7. 路由定义（FX-122~125）

| # | 项 | 值 |
|---|----|----|
| FX-122 | 路由声明 | `/login` → `React.lazy(() => import('./LoginPage'))`，**无守卫包裹**（src/App.jsx:10,26） |
| FX-123 | 深链回跳 | 支持任意公共/业务路径携 `?next=` 进入：`safeNextPath` 白名单——仅接受以单个 `/` 开头的站内路径，拒绝空值、外链与 `//` 开头，非法回落 `/`（LoginPage.jsx:12-17）；登录成功后 `<Navigate replace>` 跳转（LoginPage.jsx:35-37） |
| FX-124 | 入口 | ① axios 401 拦截器：非公共路径（/login、/display、/gallery 之外）任一业务请求 401 → `window.location.assign('/login?next=<当前路径+查询>')`（apiClient.js:8-10,21-30）② ProtectedRoute 未登录重定向（ProtectedRoute.jsx:13-16，含 `/admin`，携带 next）③ 登出后显式跳转（AdminPage.jsx:156-158 等）④ URL 直达 |
| FX-125 | 出口 | 登录/注册成功 → next 深链或 `/`；已登录访问本页立即重定向（LoginPage.jsx:35-37） |

## 8. 全局一致性（FX-126~137）

### 8.0 交互确认记录（d4 Step 4 七项，逆向归档以代码核对替代用户确认）

| 确认项 | 结论（代码事实） |
|--------|----------------|
| 1 模块元信息 | §1；页面类型 config（FX-004） |
| 2 查询条件 | 不适用（无列表，§4 裁剪） |
| 3 表格列 | 不适用 |
| 4 operList | 不适用；页面级 Action 见 §2 |
| 5 表单分组 | 单组双模式表单，无 Card 分组（§5.1）；表单类型独立页非 Dialog（字段 2 个+提交，d4「<5 字段 → Dialog」推断不适用——登录页本身就是轻量整页，逆向如实登记） |
| 6 详情 Card | 不适用 |
| 7 页面类型覆盖 | 无 hybrid/code 覆盖 |

### 8.1~8.12 一致性项

| # | 项 | 现网实现 |
|---|----|---------|
| FX-126 | i18n | 全文案走 `useTranslation`（LoginPage.jsx:20）；AuthShell 同（AuthShell.jsx:22）；三语词条组见 §3 |
| FX-127 | 错误反馈 | 表单级 Alert + 服务端英文消息直显（FX-056）；限流 429 消息经 unwrap 呈现（apiClient toServiceError / `Request failed (status)` 兜底，authService.js:5-18） |
| FX-128 | 加载反馈 | 主按钮 submitting 禁用（FX-059）；status 未返回期间按缺省值渲染（§5.3 注记） |
| FX-129 | 暗色模式 | AuthShell 底色/渐变/阴影/边框全量按 darkMode 双分支（AuthShell.jsx:45-97）；暗色为默认适配（frontend-rules.md R4，经 useColorMode 跟随系统+手动切换） |
| FX-130 | 语言切换 | 卡头 LanguageSwitcher + 暗色切换并置（AuthShell.jsx:117-130） |
| FX-131 | 会话安全 | 会话 Cookie httpOnly（dt_session，api-S-01-auth.md §3.1）——本页不触碰 token；登录态判定全依赖 /me（AuthContext.jsx:46-53） |
| FX-132 | 无障碍 | autoComplete 语义属性（FX-053）；装饰圆环 aria-hidden（AuthShell.jsx:54,66）；品牌行 Typography 层级 h1（LoginPage.jsx:55） |
| FX-133 | 响应式 | AuthShell 卡宽 maxWidth 420，内边距 xs/sm 两档（LoginPage.jsx:52；AuthShell.jsx:42,97）；全屏居中布局 |
| FX-134 | 离线 | OfflineBanner 全局挂载（App.jsx:23）；status 请求失败时 status 维持缺省值（AuthContext.jsx:40-42 仅 success 才 setStatus）——离线时页面呈现关闭提示形态，如实登记 |
| FX-135 | 跳转安全 | next 白名单校验（FX-123，防开放重定向：拒绝 `//` 与非 `/` 开头） |
| FX-136 | XSS/注入面 | 无 URL 参数直插 DOM；服务端消息经 React 文本节点渲染 |
| FX-137 | 与 API 文档一致性 | §2 四项 Action 与 api-S-01-auth.md STATUS/REGISTER/LOGIN/LOGOUT 一一对应；页面消费的字段（hasUsers/registrationOpen/publicUser）与 API 响应结构逐字段对读无出入 |

## 9. 文档版本与变更记录（FX-138~141）

**版本号规则**：`vMAJOR.MINOR`；Action 集/页面形态机不兼容变更升 MAJOR。
**变更类型词汇**：`initial` / `structural` / `action_added|changed|removed` / `field_added|changed|removed` / `copy_changed` / `route_changed`。

| 版本 | 日期 | 变更类型 | 变更说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：登录页双模式单表单（login/register 共字段）、页面形态机三分支（注册开放可切换/关闭提示/空库自动入注册）、next 深链白名单回跳、首绘瞬时态注记（§5.3），依现有实现成文 |

### 输出自检记录（d4 输出校验：机械自检表 + FX 逐条核查，本会话执行）

| # | 项 | 结果 |
|---|----|------|
| M1 | 九章节结构完整（🔒 1/2/3/7/8/9 章全存在；5 章实设；4/6 章裁剪标注） | ✅ |
| M2 | 每个 Action 有接口编码对应且 API 编码在对应 API 文档中存在 | ✅ §2 对照表逐条对读（STATUS/LOGIN/REGISTER/LOGOUT，api-S-01-auth.md §4.4 接口清单） |
| M3 | 字典 Key 均在 enum-pool.md 有定义 | ✅ EP-IDENT-02、EP-IDENT-01、EP-I18N-01（§3 逐条核对池文件） |
| M4 | 占位符残留 | ✅ 无 |
| M5 | 变更记录含本次更新行 | ✅ §9 initial 行 |
| FX 抽核 | FX-057/FX-058/FX-061/FX-064/FX-123 逐条对照 LoginPage.jsx/e2e 行号 | ✅ 引用行号均经本会话 Read 核实 |
