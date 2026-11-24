# PageSpec — 登录页（访客视角）

| 属性 | 值 |
|------|-----|
| 文档性质 | v1.0 部分为逆向归档：如实反映现有实现。v1.1 增量以【R20】标注，属前瞻设计，待代码阶段实现 |
| 版本 | v1.1 |
| 状态 | 稳定（v1.0）+ 设计稿（v1.1 增量） |
| 最后更新 | 2026-11-24 |
| 用户类型 | 访客（主角色，FL §2.4.1.1「账号注册」+ 登录入口）；注册用户/管理员为次角色（同一页面登录，FL §2.2.1.1） |
| 覆盖页面 | `/login` 登录页（src/LoginPage.jsx，登录/注册双模式单表单）+ AuthShell 氛围壳（src/components/AuthShell.jsx）；【R20】页面内的隐私说明弹窗与二次验证步骤 |
| 上游依据 | FL v1.2 §2.4.1.1 / §2.2.1.1；AA v1.2 §2.2.1.1 / §2.2.1.2 / §2.2.1.3 / §2.2.1.4 / §2.2.1.5；API 文档 api-S-01-auth.md v1.1（STATUS/REGISTER/LOGIN/LOGOUT/ME/TOTP-VERIFY/TOTP-RECOVER/PRIVACY-NOTICE）；隐私说明正文草稿见 R20 §7 |
| 实现锚点 | src/LoginPage.jsx、src/components/AuthShell.jsx、src/context/AuthContext.jsx、src/services/authService.js、src/utils/authCopy.js、src/App.jsx |
| 交互确认方式 | d4 分册 Step 4 七项确认在本流水线运行中无交互用户，v1.0 以「逐项对代码核对」替代；v1.1 的【R20】增量依据用户已裁定的决策（R20 D44、D46、D50）与 S-01 PRD v1.1 §5.5、§5.6，确认记录见 §8.0 |

> 组件命名说明：本栈（react-vite-web）无 Scm* 组件映射（📎 vue3-engine 参考实现）；页面为 MUI 函数组件 + hooks（profiles/react-vite-web/skills/frontend-specs/SKILL.md）。
>
> 基线说明：注册页文案以 2026-11-24 已提交的热修复为准（提交 `7c94678`，`registerCopyKeys(hasUsers)` 在普通注册与首个管理员两套文案间选择）。v1.0 §3 所记 `registerTitle` 的取值是修复前的旧值，以 v1.1 为准。进入代码阶段前须重新读取 src/LoginPage.jsx、src/utils/authCopy.* 与三个语言文件的 `auth` 段。

## 1. 模块元信息（FX-001~005）

| # | 项 | 值 |
|---|----|----|
| FX-001 | 模块编码/名称 | S-01 账号与准入（FL 菜单「注册」= S-01-01、「登录」= S-01-02；【R20】隐私说明入口与注册同意归 S-01-05，二次验证步骤归 S-01-04）；页面归档 `guest/login` |
| FX-002 | 所属 App / 技术栈 | debate-timer SPA（React 19 + Vite + MUI），路由 `/login`，懒加载（src/App.jsx:10,26）；**公共路由**（不包 ProtectedRoute） |
| FX-003 | 业务类型 | master_data（聚合根=账号，api-S-01-auth.md「功能类型」）；注册准入为托管设置（D-02 app_settings，页面只读消费生效值） |
| FX-004 | 页面类型 | config（单卡居中表单页；AuthShell 全屏氛围底 + 居中 Card maxWidth 420，LoginPage.jsx:52）；【R20】页面内增加两个按需呈现的局部：隐私说明弹窗、二次验证步骤 |
| FX-005 | 布局骨架 | AuthShell：全屏渐变底 + 双装饰圆环（aria-hidden，AuthShell.jsx:45-77）+ 卡片（圆角 20px，AuthShell.jsx:79-97）；卡头为品牌行（BrandMark+`timer.title`）+ LanguageSwitcher + 暗色切换（AuthShell.jsx:106-131）；正文为垂直 Stack 表单（spacing 2.5，LoginPage.jsx:53） |

## 2. Action 定义（FX-006~016）

| Action | 触发控件 | 接口（API 文档编码） | 服务函数 | 前端锚点 |
|--------|---------|---------------------|---------|---------|
| fetchStatus | 页面挂载（AuthProvider 全局，非本页显式调用） | GET /api/auth/status（S-01 STATUS，匿名） | authService.status → useAuth().status（AuthContext.jsx:35-44；authService.js:21-23） | LoginPage 消费 |
| login | 主提交按钮（mode='login'） | POST /api/auth/login（S-01 LOGIN，限流 20 次/15min/IP） | useAuth().login → authService.login（AuthContext.jsx；authService.js） | LoginPage |
| register | 主提交按钮（mode='register'） | POST /api/auth/register（S-01 REGISTER，限流 10 次/60min/IP） | useAuth().register → authService.register | LoginPage；【R20】请求体增加 `agree`、`privacyVersion` |
| switchMode | 底部文字按钮「已有账号？去登录 / 需要账号？去注册」 | 无接口——纯前端 setState（清错误后 toggle） | — | LoginPage |
| logout | 无（本页无登出控件；登出在计时页/设置页/管理页 AppBar） | POST /api/auth/logout（S-01 LOGOUT） | useAuth().logout | — |
| 【R20】openPrivacyNotice | 「隐私说明」入口（位于表单之前）；注册模式勾选框标签内的链接 | GET /api/privacy/notices/current?lng=<界面语言>（PRIVACY-NOTICE，匿名，按 IP 限流） | privacyService.getNotice（新增） | 隐私说明弹窗（按需加载的组件） |
| 【R20】verifyTotp | 二次验证步骤的主按钮（输入 6 位动态口令） | POST /api/auth/totp/verify（S-01 TOTP-VERIFY） | authService.verifyTotp（新增） | 二次验证步骤（按需加载的组件） |
| 【R20】recoverWithCode | 二次验证步骤切换到恢复码后的主按钮 | POST /api/auth/totp/recover（S-01 TOTP-RECOVER） | authService.recoverWithCode（新增） | 同上 |

成功后置行为：login/register 成功 → `setUser(result.data)` + `refreshStatus()`（AuthContext）→ 若 `user.pending` 为空，LoginPage 因 `user` 置真重渲染为 `<Navigate to={safeNextPath(searchParams.get('next'))} replace>`；【R20】若 `user.pending` 非空，改为跳转 `/gate?next=<同一 next 参数>`，由引导页接手（S-01-account PageSpec §4）。状态请求带 `skipAuthRedirect` 标记，401 不触发 axios 拦截器跳转（authService.js；apiClient.js），登录页不会循环重定向。

【R20】LOGIN 的两种成功响应由 `AuthContext.login` 分支：`data.status === 'ok'` 走上文的会话用户流程；`data.status === 'totp_required'` 不写入 `user`，把 `data.ticket` 交给页面，页面切换到二次验证步骤。`ticket` 只保存在步骤组件的本地状态里，不写 localStorage、不进 URL。

【R20】`authService` 的 `unwrap` 需把失败响应里的 `code` 与 `data` 一并透出（现只返回 `message`），供页面按 `code` 分支、按 `data.attemptsRemaining` 显示剩余次数。

## 3. 字典Key清单（FX-017~020）

| Key | 来源 | 消费位置 |
|-----|------|---------|
| EP-IDENT-02 `registrationOpen` / 派生 `hasUsers` | enum-pool.md §3.1；api-S-01-auth.md STATUS（`registrationState()` 快照，首用户短路恒开） | 页面形态机三分支（§4.2）+ 注册模式自动进入 |
| userRole（隐式） | enum-pool.md EP-IDENT-01 | 本页不展示角色；首注册必为 admin 的业务语义只在没有用户时由 `auth.firstUserSubtitle` 表达 |
| EP-I18N-01 `lng`（en/fr-CA/zh-Hans） | enum-pool.md §3.6 | AuthShell 卡头 LanguageSwitcher；【R20】作为 PRIVACY-NOTICE 的 `lng` 参数 |
| 【R20】EP-IDENT-08 `loginStatus`（ok / totp_required） | enum-pool.md EP-IDENT-08 | LOGIN 响应分支（§2） |
| 【R20】EP-IDENT-07 `authGate` | enum-pool.md EP-IDENT-07 | `user.pending` 非空即跳转引导页 |
| i18n 词条组（既有） | src/locales/{zh-Hans,en,fr-CA}.json | `auth.loginTitle`/`registerTitle`/`firstUserTitle`/`loginSubtitle`/`registerSubtitle`/`firstUserSubtitle`/`username`/`password`/`usernameHint`/`passwordHint`/`login`/`register`/`failed`/`haveAccount`/`needAccount`/`registrationClosed`；`timer.title`、`timer.darkDark/darkLight` |
| 【R20】i18n 词条组（新增） | 同上三个语言文件 | `auth.privacy*`、`auth.totp.*`、`privacy.*`，取值见 §5.5、§5.6 |

下拉数据源（d4 §3.6 对照）：本页无下拉/字典接口消费。

## 4. 列表页（FX-021~051）

**不适用**——无列表区块（单表单页）。d4 §3.1 推断规则不适用，整章裁剪。

## 5. 表单页（FX-052~112）

### 5.1 登录/注册双模式表单（LoginPage.jsx）

| # | 项 | 值 |
|---|----|---|
| FX-052 | 表单类型 | 单页表单（Stack component="form"）；登录与注册**共用同一组字段**，以本地 state `mode`（'login'\|'register'，默认 'login'）切换标题/按钮文案与 autoComplete——**非两个路由、非 Dialog** |
| FX-053 | 字段清单 | ① username：TextField required，autoComplete="username"，helperText=`auth.usernameHint` ② password：TextField required type="password"，autoComplete 按 mode 切换 `new-password`/`current-password`，helperText=`auth.passwordHint` ③ 主按钮：Button variant="contained" size="large"，文案 `auth.register`（注册模式）/`auth.login`（登录模式） ④ 【R20】注册模式追加：同意勾选框（FormControlLabel + Checkbox，§5.5） |
| FX-054 | 客户端校验 | 仅 required；提交时 username trim。格式规则（用户名 `^[a-z0-9_]{3,32}$`、密码 8–200）**依赖服务端**（api-S-01-auth.md §3.4 错误码表 400 行），helperText 仅作提示不作校验。服务端错误消息为英文机器串直显（现状） |
| FX-055 | 提交行为 | submit：清错误 → submitting=true → 按 mode 调 login 或 register → submitting=false；失败 `setError(result.message || t('auth.failed'))`；成功由 §2 后置行为接管跳转 |
| FX-056 | 错误展示 | 表单顶部 `Alert severity="error"`；无 message 时回落 `auth.failed`。【R20】二次验证步骤的错误在步骤内部展示（§5.6） |
| FX-057 | 模式自动进入 | useEffect：`status.registrationOpen && !status.hasUsers` → `setMode('register')`——全新部署访客落到「创建管理员账号」形态（`registerCopyKeys(false)`） |
| FX-058 | 模式切换可见性 | 仅 `status.registrationOpen && status.hasUsers` 时渲染切换文字按钮；注册关闭 + 已有用户时改渲染关闭提示（FX-061）。【R20】切回登录模式时清空同意状态并关闭隐私说明弹窗 |
| FX-059 | 提交中状态 | submitting 禁用主按钮 |
| FX-060 | 标题/副标题 | 按 mode 切换：登录模式 `loginTitle`/`loginSubtitle`；注册模式取 `registerCopyKeys(status.hasUsers)` 返回的键（有用户时为普通注册文案） |
| 【R20】FX-059a | 主按钮的禁用条件 | `submitting`，或（注册模式且未勾选同意，或隐私说明尚未加载成功） |

### 5.2 注册关闭提示（LoginPage.jsx）

| # | 项 | 值 |
|---|----|----|
| FX-061 | 触发条件 | `status.hasUsers && !status.registrationOpen` |
| FX-062 | 形态 | `Typography variant="caption"` 灰字居中，文案 `auth.registrationClosed`——**非 Alert、不可点击、无跳转** |
| FX-063 | 生效语义 | 页面消费的是 `/api/auth/status` 的**生效值**（首用户短路 > 管理台存储值 > env 回落）；管理台翻转开关后，访客下次加载页面读到新值 |
| FX-064 | 注册关闭时提交 | 表单仍可提交（服务端 403 `Registration is closed` 兜底直显） |

### 5.3 首绘瞬时态注记（逆向如实登记）

status 的 Context 缺省值为 `{hasUsers:true, registrationOpen:false}`，`/api/auth/status` 返回前页面按该缺省渲染——已部署系统的访客会短暂看到「注册关闭」提示后切换为实际形态。加载期 `loading=true` 不阻塞本页渲染。已登记为现状行为，非缺陷修复项。

### 5.4 不适用项

无分步表单（d4 §3.5；【R20】二次验证步骤是同一表单内的视图切换，不是多路由分步表单）、无附件、无 modalSelect。【R20】注册模式多一个条件渲染的勾选框。

### 5.5 【R20】表单之前的隐私说明入口与注册同意

**位置**：卡片的正文顺序为「标题与副标题 → 隐私提示行 → 错误提示 → 用户名 → 密码 → 主按钮 → 模式切换」。隐私提示行在用户名输入框**之前**，登录与注册两种模式都显示。这是「未登录的失败尝试以事前告知覆盖」的界面落点（R20 D50、§5）。

| # | 项 | 值 |
|---|----|----|
| FX-065 | 隐私提示行 | `Typography variant="caption"` + 行内链接按钮。文案 `auth.privacyNoticeLine`，其后是入口 `auth.privacyNoticeLink`。入口是 `type="button"`，不会触发表单提交 |
| FX-066 | 隐私说明弹窗 | MUI Dialog（maxWidth sm，内容区最大高度 70vh 可滚动）。标题取接口返回的 `title`，其下依次渲染：版本与生效日期、运营者、`intro`、`sections[].heading` + `sections[].items[]`。全部按纯文本段落渲染，**不使用 HTML 注入**。右下角一个关闭按钮 |
| FX-067 | 弹窗内容加载 | 登录模式：点击入口时才请求。请求中弹窗内显示 `auth.privacyLoading`；失败显示 `auth.privacyLoadFailed` 与「重试」按钮（frontend-rules R3：加载与错误两态都要可见）。已加载过则直接展示，不重复请求 |
| FX-068 | 语言 | 请求参数 `lng` 取当前界面语言（`i18n.language`，取值不在三种支持语言内时传 `en`）。弹窗内可用卡头的语言切换器切换；切换后重新请求对应语言 |
| FX-069 | 注册模式的同意勾选框 | FormControlLabel，控件为 Checkbox，标签文本 `auth.privacyConsent`，标签内「隐私说明」四字是指向同一弹窗的链接。勾选状态默认为未选；切换到登录模式或切换到另一注册文案形态时重置为未选 |
| FX-070 | 勾选框的可用条件 | 进入注册模式时即预取说明全文；**预取成功之前勾选框禁用**，旁边显示 `auth.privacyLoading`；预取失败显示 `auth.privacyLoadFailed` 与「重试」，勾选框保持禁用。说明展示不出来就不接受同意 |
| FX-071 | 注册请求体 | `{ username, password, agree: <勾选状态>, privacyVersion: <已加载说明的 version> }`。未勾选时主按钮禁用，不会发出请求 |
| FX-072 | 服务端同意校验的失败分支 | 400：直显服务端消息并保持勾选状态。409 且 `code === 'PRIVACY_NOTICE_UPDATED'`：清空已缓存的说明并重新预取，取消勾选，提示 `auth.privacyUpdated` |

### 5.6 【R20】二次验证步骤

**触发**：LOGIN 返回 `data.status === 'totp_required'`。页面在同一张卡片内把「标题、用户名、密码、主按钮」整体替换为二次验证步骤；「返回登录」可回到口令步骤（用户名保留、密码清空）。步骤组件（含恢复码分支）放在**按需加载的独立代码块**里，只有走到这一步才下载（R20 §9.6 的体积约束）。

| # | 项 | 值 |
|---|----|----|
| FX-073 | 标题与副标题 | `auth.totp.title` / `auth.totp.subtitle` |
| FX-074 | 动态口令输入 | TextField：label `auth.totp.codeLabel`；`inputMode="numeric"`、`autocomplete="one-time-code"`、`autofocus`、maxLength 6；提交前去掉首尾空格。非 6 位数字时提交按钮禁用 |
| FX-075 | 主按钮 | `auth.totp.submit`；提交中禁用 |
| FX-076 | 恢复码分支 | 步骤内文字按钮 `auth.totp.useRecovery` 切换输入框：label `auth.totp.recoveryLabel`，`autocomplete="off"`，`spellcheck=false`；允许带或不带连字符。切换时清空另一分支的输入与错误 |
| FX-077 | 口令错误（401） | 表单内 Alert：动态口令 `auth.totp.invalid`，恢复码 `auth.totp.invalidRecovery`；`{{count}}` 取响应 `data.attemptsRemaining` |
| FX-078 | 次数用尽（429） | Alert：`auth.totp.tooMany`，`{{minutes}}` 取响应头 `Retry-After` 换算（不足 1 分钟按 1 计）。主按钮禁用，只保留「返回登录」；回到口令步骤重新登录后仍会被服务端拦下，直到窗口结束 |
| FX-079 | 凭据失效（400，`code === 'TICKET_INVALID'`） | 自动回到口令步骤，表单顶部提示 `auth.totp.expired` |
| FX-080 | 服务未就绪（503） | Alert 直显服务端消息；主按钮禁用，保留「返回登录」 |
| FX-081 | 成功 | 响应为会话用户结构，交给 `AuthContext` 写入 `user`，走 §2 的后置跳转。若恢复码分支的响应里 `recoveryCodesRemaining === 0`，登录后由设置页的「两步验证」卡提示重新绑定（S-01-account PageSpec §5.1） |
| FX-082 | 返回登录 | 文字按钮 `auth.totp.back`：丢弃 `ticket`，回到口令步骤 |
| FX-083 | 凭据的存放 | `ticket` 只在步骤组件的本地 state；不写 localStorage、不进 URL、不输出到控制台 |

### 5.7 【R20】新增界面词条（三语）

隐私相关：

| 键 | zh-Hans | en | fr-CA |
|----|---------|----|-------|
| `auth.privacyNoticeLine` | 为防止账号被盗用，我们会记录每次登录尝试的时间和来源 IP。 | To protect accounts, we record the time and source IP of every sign-in attempt. | Pour protéger les comptes, nous consignons l’heure et l’adresse IP source de chaque tentative de connexion. |
| `auth.privacyNoticeLink` | 查看隐私说明 | Privacy notice | Avis de confidentialité |
| `auth.privacyConsent` | 我已阅读并同意隐私说明 | I have read and agree to the Privacy Notice | J’ai lu et j’accepte l’avis de confidentialité |
| `auth.privacyLoading` | 正在加载隐私说明… | Loading the privacy notice… | Chargement de l’avis de confidentialité… |
| `auth.privacyLoadFailed` | 隐私说明加载失败。请重试，加载成功后才能勾选同意。 | Could not load the privacy notice. Try again; you can consent once it has loaded. | Impossible de charger l’avis de confidentialité. Réessayez ; vous pourrez consentir une fois qu’il sera chargé. |
| `auth.privacyUpdated` | 隐私说明已更新。请阅读最新版本后重新确认。 | The privacy notice has been updated. Please read the latest version and confirm again. | L’avis de confidentialité a été mis à jour. Lisez la dernière version et confirmez de nouveau. |
| `auth.privacyRetry` | 重试 | Try again | Réessayer |
| `auth.privacyVersion` | 版本 {{version}} · 生效日期 {{date}} | Version {{version}} · Effective {{date}} | Version {{version}} · En vigueur le {{date}} |
| `auth.privacyOperator` | 运营者：{{name}} | Operator: {{name}} | Responsable : {{name}} |
| `auth.privacyClose` | 关闭 | Close | Fermer |

二次验证相关：

| 键 | zh-Hans | en | fr-CA |
|----|---------|----|-------|
| `auth.totp.title` | 两步验证 | Two-step verification | Vérification en deux étapes |
| `auth.totp.subtitle` | 输入验证器应用中显示的 6 位动态口令。 | Enter the 6-digit code shown in your authenticator app. | Saisissez le code à 6 chiffres affiché dans votre application d’authentification. |
| `auth.totp.codeLabel` | 动态口令 | Code | Code |
| `auth.totp.submit` | 验证并登录 | Verify and sign in | Vérifier et se connecter |
| `auth.totp.useRecovery` | 无法使用验证器？改用恢复码 | Can’t use your authenticator? Use a recovery code | Impossible d’utiliser votre application ? Utilisez un code de récupération |
| `auth.totp.recoveryLabel` | 恢复码 | Recovery code | Code de récupération |
| `auth.totp.back` | 返回登录 | Back to sign-in | Retour à la connexion |
| `auth.totp.invalid` | 动态口令不正确，还可尝试 {{count}} 次。 | Incorrect code. {{count}} attempts left. | Code incorrect. {{count}} tentatives restantes. |
| `auth.totp.invalidRecovery` | 恢复码不正确或已使用，还可尝试 {{count}} 次。 | Incorrect or already-used recovery code. {{count}} attempts left. | Code de récupération incorrect ou déjà utilisé. {{count}} tentatives restantes. |
| `auth.totp.tooMany` | 尝试次数过多，请在 {{minutes}} 分钟后重新登录。 | Too many attempts. Sign in again in {{minutes}} minutes. | Trop de tentatives. Reconnectez-vous dans {{minutes}} minutes. |

文案遵循 frontend-rules R6：直白说清结果与下一步，不用感叹号，不堆砌 emoji，不直出系统术语。

## 6. 详情页（FX-113~121）

**不适用**——无详情区块，整章裁剪。

## 7. 路由定义（FX-122~125）

| # | 项 | 值 |
|---|----|----|
| FX-122 | 路由声明 | `/login` → `React.lazy(() => import('./LoginPage'))`，**无守卫包裹**（src/App.jsx） |
| FX-123 | 深链回跳 | 支持任意公共/业务路径携 `?next=` 进入：`safeNextPath` 白名单——仅接受以单个 `/` 开头的站内路径，拒绝空值、外链与 `//` 开头，非法回落 `/`；成功后 `<Navigate replace>` 跳转。【R20】该函数需被引导页复用，代码阶段把它从 LoginPage 提到 `src/utils/`（纯函数，带既有行为的单测） |
| FX-124 | 入口 | ① axios 401 拦截器：非公共路径任一业务请求 401 → `window.location.assign('/login?next=…')` ② ProtectedRoute 未登录重定向（含 `/admin`）③ 登出后显式跳转 ④ URL 直达。【R20】二次验证接口的调用带 `skipAuthRedirect`，其 401 不会触发拦截器跳转 |
| FX-125 | 出口 | 登录/注册成功 → next 深链或 `/`；已登录访问本页立即重定向。【R20】`user.pending` 非空时 → `/gate?next=<同一参数>`（引导页规格见 S-01-account PageSpec §4） |

## 8. 全局一致性（FX-126~137）

### 8.0 交互确认记录（d4 Step 4 七项确认）

| 确认项 | 结论 |
|--------|------|
| 1 模块元信息 | §1；页面类型 config（FX-004） |
| 2 查询条件 | 不适用（无列表，§4 裁剪） |
| 3 表格列 | 不适用 |
| 4 operList | 不适用；页面级 Action 见 §2 |
| 5 表单分组 | 单组双模式表单，无 Card 分组（§5.1）；【R20】追加条件渲染的同意勾选框、隐私说明弹窗与二次验证步骤（§5.5、§5.6）。依据用户裁定 D44、D46、D50 与 R20 §11.1 Q1、Q8 |
| 6 详情 Card | 不适用 |
| 7 页面类型覆盖 | 无 hybrid/code 覆盖 |

### 8.1~8.12 一致性项

| # | 项 | 实现 |
|---|----|------|
| FX-126 | i18n | 全文案走 `useTranslation`；AuthShell 同；三语词条组见 §3。【R20】新增词条三语齐备（§5.7），无硬编码 JSX 文案；说明正文的数字与日期用 `Intl` 按界面语言格式化 |
| FX-127 | 错误反馈 | 表单级 Alert + 服务端消息直显；限流 429 经 unwrap 呈现。【R20】二次验证步骤按 `code` 与 `data.attemptsRemaining` 分支（FX-077~FX-080）；隐私说明加载失败有错误与重试两态 |
| FX-128 | 加载反馈 | 主按钮 submitting 禁用；status 未返回期间按缺省值渲染（§5.3）。【R20】隐私说明加载中在弹窗内显示加载文案；注册模式下勾选框在加载完成前禁用 |
| FX-129 | 暗色模式 | AuthShell 底色/渐变/阴影/边框全量按 darkMode 双分支；【R20】弹窗与二次验证步骤沿用 MUI 主题，无单独配色 |
| FX-130 | 语言切换 | 卡头 LanguageSwitcher + 暗色切换并置；【R20】切换语言后隐私说明重新请求对应语言 |
| FX-131 | 会话安全 | 会话 Cookie httpOnly——本页不触碰令牌；登录态判定全依赖 /me。【R20】二次验证完成之前服务端没有会话；`ticket` 只在内存 |
| FX-132 | 无障碍 | autoComplete 语义属性；装饰圆环 aria-hidden；标题 Typography h1。【R20】同意勾选框为原生 Checkbox（role=checkbox，可由键盘操作）；隐私说明弹窗焦点落入弹窗、Esc 关闭；动态口令输入框 autofocus |
| FX-133 | 响应式 | 卡宽 maxWidth 420，内边距 xs/sm 两档；【R20】隐私提示行在窄屏自动换行；弹窗宽度跟随视口 |
| FX-134 | 离线 | OfflineBanner 全局挂载；status 请求失败时 status 维持缺省值。【R20】隐私说明加载失败按 FX-067、FX-070 处理（重试；注册模式下不能勾选） |
| FX-135 | 跳转安全 | next 白名单校验（防开放重定向）；【R20】引导页跳转沿用同一校验 |
| FX-136 | XSS/注入面 | 无 URL 参数直插 DOM；服务端消息经 React 文本节点渲染。【R20】隐私说明正文按纯文本渲染，不使用 `dangerouslySetInnerHTML` |
| FX-137 | 与 API 文档一致性 | Action 与 api-S-01-auth.md 的 STATUS/REGISTER/LOGIN/LOGOUT/TOTP-VERIFY/TOTP-RECOVER 及 P-04 API 的 PRIVACY-NOTICE 一一对应；页面消费字段（hasUsers/registrationOpen/会话用户结构/ticket/expiresIn/attemptsRemaining/说明结构）与 API 响应逐字段对读 |

### 8.13 现状注记（v1.1 登记，非本轮修复项）

| # | 缺口 | 影响 | v1.1 状态 |
|---|------|------|----------|
| G1 | 服务端错误消息为英文机器串直显（如 `Invalid username or password`），未按界面语言翻译 | 非中文用户界面下错误提示只有英文 | 未处理（不在本轮范围）。【R20】新增的二次验证失败提示由前端按 `code` 用词条表达，不走机器串直显；注册同意校验的 400/409 仍是机器串直显 |

## 9. 文档版本与变更记录（FX-138~141）

**版本号规则**：`vMAJOR.MINOR`；Action 集或页面形态机不兼容变更升 MAJOR。
**变更类型词汇**：`initial` / `structural` / `action_added|changed|removed` / `field_added|changed|removed` / `copy_changed` / `route_changed`。

| 版本 | 日期 | 变更类型 | 变更说明 |
|------|------|---------|---------|
| v1.1 | 2026-11-24 | field_added / action_added / copy_changed / route_changed | R20 增量设计：表单之前新增隐私提示行与隐私说明入口（弹窗，纯文本渲染）；注册模式新增必须勾选的同意项并在说明加载成功前禁用；新增二次验证步骤（动态口令与恢复码两个分支，按需加载）；登录成功且有待办步骤时跳转引导页；新增 20 条三语词条；登记注册页文案热修复后的基线 |
| v1.0 | 2026-11-11 | initial | 逆向归档首次生成：登录页双模式单表单（login/register 共字段）、页面形态机三分支（注册开放可切换/关闭提示/空库自动入注册）、next 深链白名单回跳、首绘瞬时态注记，依现有实现成文 |

### 输出自检记录（d4 输出校验：机械自检表 + FX 逐条核查）

| # | 项 | 结果 |
|---|----|------|
| M1 | 九章节结构完整（🔒 1/2/3/7/8/9 章全存在；5 章实设；4/6 章裁剪标注） | ✅ v1.1 在第 5 章内新增 5.5、5.6、5.7 三节，章节编号未变 |
| M2 | 每个 Action 有接口编码对应且 API 编码在对应 API 文档中存在 | ✅ §2 对照表逐条对读（STATUS/LOGIN/REGISTER/LOGOUT/TOTP-VERIFY/TOTP-RECOVER/PRIVACY-NOTICE 均见 api-S-01-auth.md v1.1 §4.4） |
| M3 | 字典 Key 均在 enum-pool.md 有定义 | ✅ EP-IDENT-02、EP-IDENT-01、EP-I18N-01、EP-IDENT-07、EP-IDENT-08（enum-pool.md v1.2） |
| M4 | 占位符残留 | ✅ 无（`{{count}}` 等是 i18n 插值占位，属词条语法，不是待填内容） |
| M5 | 变更记录含本次更新行 | ✅ §9 v1.1 行 |
| FX 核查 | FX-059a、FX-065~FX-083 逐条对照 S-01 PRD v1.1 §5.5、§5.6 与 api-S-01-auth.md v1.1 §4.4 | ✅ 剩余次数、429、凭据失效、503 的分支与接口错误码表一致 |
