# PageSpec — 账号与安全（注册用户与管理员视角）

| 属性 | 值 |
|------|-----|
| 文档性质 | 前瞻设计【R20】：本篇全部为待代码阶段实现的交互规格，不是现网实现 |
| 版本 | v1.0 |
| 状态 | 设计稿 |
| 最后更新 | 2026-11-24 |
| 用户类型 | 注册用户（自愿两步验证、本人登录记录、隐私说明确认）；管理员（强制绑定两步验证、隐私说明确认） |
| 覆盖页面 | ① `/gate` 登录后引导页（新页面）② `/settings` 设置页底部新增的「账号与安全」区块（两张卡：两步验证、我的登录记录） |
| 上游依据 | FL v1.2 §2.2.1.1 / §2.2.2.1 / §2.3.1.1；AA v1.2 §2.2.1.4 / §2.2.1.5 / §2.4.4；S-01 PRD v1.1 §5.5、§5.6、§5.7；API 文档 api-S-01-auth.md v1.1（ME/TOTP-STATUS/TOTP-SETUP/TOTP-CONFIRM/TOTP-DISABLE/PRIVACY-NOTICE/PRIVACY-CONSENT）、api-P-04-audit.md（AUDIT-LOGINS） |
| 规划落点 | `src/GatePage.jsx`；`src/components/account/`（`TotpEnrollPanel`、`TotpCard`、`MyLoginsCard`、`PrivacyNoticeBody`）；`src/services/accountService.js`；`src/App.jsx`（路由）；`src/DebateSetting.jsx`（区块挂载） |
| 交互确认方式 | d4 分册 Step 4 的七项确认以「用户裁定 + 设计默认取舍」替代：依据用户裁定 D44、D46、D50，以及 R20 §11.1 的 Q1、Q8。确认记录见 §8.0 |

> 组件命名说明：本栈为 MUI 函数组件 + hooks（profiles/react-vite-web/skills/frontend-specs/SKILL.md）。引导页与登录页共用 AuthShell 氛围壳与隐私说明正文组件。

## 1. 模块元信息

| # | 项 | 值 |
|---|----|----|
| FX-001 | 模块编码/名称 | 页面归属 S-01 账号与准入（S-01-04 两步验证、S-01-05 隐私告知与同意）与 P-04 审计日志（本人登录记录）；归档 `registered-user/S-01-account` |
| FX-002 | 所属 App / 技术栈 | debate-timer SPA（React 19 + Vite + MUI）。`/gate` 为新增路由，懒加载；`/settings` 为既有路由（ProtectedRoute），本篇只规定其底部新增区块 |
| FX-003 | 业务类型 | master_data（账号聚合上的设置项与只读记录） |
| FX-004 | 页面类型 | `/gate`：config（AuthShell 单卡，按待办步骤切换视图）。设置页区块：config（两张卡加一个绑定弹窗）；局部 code 交互一处——二维码由按需加载的库在本地生成 |
| FX-005 | 布局骨架 | `/gate`：AuthShell 卡（maxWidth 480），卡头含语言切换与暗色切换，正文为当前步骤的视图，底部为步骤按钮。设置页区块：位于「底部动作区」之后、页面末尾，两张 Card 纵向排列，有自己的小标题 |

## 2. Action 定义

### 2.1 引导页 `/gate`

| 编码 | 名称 | 触发 | 前置条件 | 调用接口 | 成功反馈 | 失败反馈 |
|------|------|------|---------|---------|---------|---------|
| A01 | resolveGate | 页面挂载、每次步骤完成后 | 无 | 无（读取 `useAuth().user.pending`） | 按 `pending` 决定停留或跳转（§4.1） | — |
| A02 | fetchNotice | 进入隐私说明确认步骤 | 无 | GET /api/privacy/notices/current?lng= | 渲染说明全文 | 卡内错误文案 + 重试 |
| A03 | acceptPrivacy | 「我已阅读并同意」 | 说明全文已加载 | POST /api/privacy/consent/accept `{version}` | 更新 `user.pending`，进入下一步或跳转 | 409：重新拉取说明并提示已更新；其他：直显消息，可重试 |
| A04 | declineAndLogout | 「不同意并退出」 | 无 | POST /api/auth/logout | 跳转 `/login` | 直显消息 |
| A05 | fetchTotpStatus | 进入强制绑定步骤 | 无 | GET /api/auth/totp/status | 得到 `needsPassword` | 卡内错误文案 + 重试 |
| A06 | startEnroll | 密码确认后点「继续」，或无需密码时自动 | 无 | POST /api/auth/totp/setup `{password?}` | 得到 otpauth 链接与密钥，进入扫码视图 | 密码不正确：表单内提示；503：卡内提示；其他：直显消息 |
| A07 | confirmEnroll | 输入 6 位动态口令后点「确认」 | 已 `startEnroll` | POST /api/auth/totp/confirm `{code}` | 进入恢复码视图 | 口令错误：表单内提示；尝试次数已用尽（429）：表单内提示并禁用确认，不按口令错误处理（FX-147a）；绑定超时：回到扫码视图重新开始 |
| A08 | finishEnroll | 勾选「我已保存恢复码」后点「完成」 | 已勾选 | GET /api/auth/me（`refresh()`） | 按 `pending` 跳转 | 刷新失败：直显消息，可重试 |
| A09 | logout | 卡内「退出登录」 | 无 | POST /api/auth/logout | 跳转 `/login` | 直显消息 |

### 2.2 设置页「账号与安全」区块

| 编码 | 名称 | 触发 | 前置条件 | 调用接口 | 成功反馈 | 失败反馈 |
|------|------|------|---------|---------|---------|---------|
| B01 | fetchTotpStatus | 区块挂载；每次绑定或关闭成功后 | 无 | GET /api/auth/totp/status | 卡片状态（§5.1） | 卡内错误文案 + 重试 |
| B02 | openEnroll | 「开启两步验证」或「重新绑定」 | `available` 为 true | 先 POST /api/auth/totp/setup（必要时先输密码，同 A06） | 弹窗内进入扫码视图 | 同 A06 |
| B03 | confirmEnroll | 弹窗内输入 6 位动态口令 | 已 `startEnroll` | POST /api/auth/totp/confirm | 弹窗内显示恢复码（仅一次） | 同 A07 |
| B04 | closeEnroll | 恢复码视图点「我已保存，关闭」 | 已勾选已保存 | 无 | 关闭弹窗；重新拉取状态；页面提示 `account.totp.bindDone` | — |
| B05 | disableTotp | 「关闭两步验证」→ 确认 → 输入密码 → 提交 | `enabled` 为 true 且非管理员 | POST /api/auth/totp/disable `{password}` | 关闭弹窗；重新拉取状态；页面提示 `account.totp.turnedOff` | 密码不正确：弹窗内提示；其他：直显消息 |
| B06 | listMyLogins | 区块挂载；点「上一页」「下一页」 | 无 | GET /api/audit/logins/list?page=&pageSize=20 | 表格与分页信息 | 卡内错误文案 + 重试 |
| B07 | copyToClipboard | 「复制」（密钥）、「复制全部恢复码」 | 无 | 无（浏览器剪贴板） | 页面提示已复制 | 剪贴板不可用时回退为选中文本，不报错 |

Action 后置统一行为：两步验证状态在每次绑定或关闭成功后都重新拉取（B01）；页面提示走全局 `useFeedback().notify`；错误优先用本地词条按 `code` 表达，没有对应词条时直显服务端消息。

## 3. 字典 Key 清单

| Key | 来源 | 消费位置 |
|-----|------|---------|
| EP-IDENT-07 `authGate`（privacy_consent / totp_enroll） | enum-pool.md | 引导页的步骤判定（§4.1） |
| EP-IDENT-06 `totpChannel` | enum-pool.md | 不直接显示；绑定成功后的审计事件取值由服务端决定 |
| EP-AUDIT-01 的子集（login_succeeded、login_failed、totp_succeeded、totp_failed、recovery_code_used） | enum-pool.md §3.7 | 「我的登录记录」的事件列 |
| EP-AUDIT-02 `auditResult` | enum-pool.md | 「我的登录记录」的结果列 |
| EP-AUDIT-03 `loginFailureReason` | enum-pool.md | 「我的登录记录」失败行的说明 |
| EP-I18N-01 `lng` | enum-pool.md | 隐私说明的语言参数；卡头语言切换 |
| i18n 词条组（新增） | src/locales/{zh-Hans,en,fr-CA}.json | `privacy.gate.*`、`account.totp.*`、`account.logins.*`、`audit.login.*`、`audit.loginReason.*`，取值见 §5.4 |

下拉数据源：无下拉。

## 4. 引导页 `/gate`

### 4.1 进入、停留与离开

| # | 项 | 值 |
|---|----|----|
| FX-121 | 数据来源 | `useAuth().user.pending`。它来自应用启动时的 `/me`，或登录、注册、二次验证成功的响应。页面不重复请求 |
| FX-122 | 离开规则一 | `loading` 结束后 `user` 为空 → `<Navigate to="/login?next=<本页 next 参数>">` |
| FX-123 | 离开规则二 | `pending` 为空数组 → `<Navigate to={safeNextPath(next)} replace>`。**`next` 为 `/gate` 自身时回落 `/`**，避免与登录页的跳转形成循环 |
| FX-124 | 停留与步骤 | `pending` 非空 → 停留。`pending[0]` 为 `privacy_consent` 时渲染隐私说明确认；否则为 `totp_enroll` 时渲染强制绑定。步骤顺序与服务端一致（S-01 API §3.5） |
| FX-125 | 步骤完成后的刷新 | 隐私确认用响应里的 `pending` 更新本地 `user`；绑定完成调用 `refresh()` 重取 `/me`。之后回到 FX-122、FX-123 判定 |
| FX-126 | 存量会话 | 已登录用户加载新前端时，`/me` 返回的 `pending` 非空 → `ProtectedRoute` 把任何受保护路由重定向到 `/gate?next=<原路径>`。引导页的行为与「刚登录」完全相同 |
| FX-127 | 页面骨架 | AuthShell 卡：卡头（品牌、语言切换、暗色切换）；正文为当前步骤；底部为步骤按钮；再下一行是文字按钮「退出登录」（A09） |
| FX-128 | 防御 | 若 `pending` 含未知取值，按「无法处理」显示错误与「退出登录」，不白屏 |

`ProtectedRoute` 的改动：在现有「未登录 → /login」「非管理员 → /」两条判定之后增加一条——`user.pending?.length > 0` → `<Navigate to={/gate?next=<当前路径与查询>} replace />`。管理员后台 `/admin` 同样适用。

### 4.2 步骤一：隐私说明确认

| # | 项 | 值 |
|---|----|----|
| FX-131 | 标题与副标题 | `privacy.gate.title` / `privacy.gate.subtitle` |
| FX-132 | 正文 | 内嵌 `PrivacyNoticeBody` 组件（与登录页弹窗同一组件）：标题、版本与生效日期、运营者、引言、分节条目，全部纯文本。容器最大高度 55vh、可滚动，滚动条始终可见 |
| FX-133 | 加载态 | 正文区显示 `auth.privacyLoading`；主按钮禁用 |
| FX-134 | 加载失败 | 正文区显示 `auth.privacyLoadFailed` 与「重试」（A02）；主按钮禁用。说明展示不出来就不接受同意 |
| FX-135 | 主按钮 | `privacy.gate.accept`；点击后禁用直至 A03 返回 |
| FX-136 | 次按钮 | 文字按钮 `privacy.gate.decline`，其下 `privacy.gate.declineHint`。点击调用 A04 |
| FX-137 | 不要求滚动到底 | 不以「是否读完」作为同意的前提条件，只要求说明已成功展示 |
| FX-138 | 服务端返回 409（`PRIVACY_NOTICE_UPDATED`） | 清空缓存、重新执行 A02、主按钮恢复禁用直到新版本加载完成；顶部提示 `auth.privacyUpdated` |
| FX-139 | 语言 | 卡头切换语言后重新执行 A02，按钮状态回到加载态 |

### 4.3 步骤二：管理员强制绑定

进入时执行 A05。之后的视图在组件内按状态切换：`password`（条件出现）→ `enroll` → `codes`。

| # | 项 | 值 |
|---|----|----|
| FX-141 | 副标题 | `account.totp.enrollTitle`；其下说明 `account.totp.enrollRequired` |
| FX-142 | A05 加载与失败 | 加载：卡内线性进度；失败：错误文案 + 重试。`available` 为 false 时理论上不会进入本步骤（服务未配置主密钥时待办步骤不含 `totp_enroll`），作防御：显示 `account.totp.unavailable` 与「继续」，点击后执行 A08 |
| FX-143 | 密码确认视图 | 仅当 `needsPassword` 为 true（会话创建已超过 10 分钟，典型的是部署前就已登录的管理员）。一个 `type="password"` 的输入框，说明 `account.totp.passwordPrompt`，主按钮「继续」→ A06（带 `password`）。密码不正确：表单内提示 `account.totp.wrongPassword`。`needsPassword` 为 false 时跳过本视图，直接执行 A06（不带 `password`） |
| FX-144 | 扫码视图 · 步骤 1 | 说明 `account.totp.step1`。二维码：宽高 200，`img` 元素，alt 为 `account.totp.enrollTitle`。二维码下方两个等价的备用方式：① 链接 `account.totp.openInApp`，`href` 为 otpauth 链接（手机上点击直接拉起验证器）；② `account.totp.manualKey` 与分组显示的 Base32 密钥（8 组、每组 4 字符、空格分隔、等宽字体），右侧「复制」按钮（B07，复制时去掉空格） |
| FX-145 | 二维码的生成 | 组件挂载时 `import('qrcode-generator')`，用 otpauth 链接生成 Data URL，赋给 `img.src`。**不使用 `innerHTML` 渲染 SVG 字符串**。库加载或生成失败时显示 `account.totp.qrFailed`，步骤 1 的两个备用方式仍可用。二维码库只在本视图加载，不进入登录页与首页的首屏代码 |
| FX-146 | 扫码视图 · 步骤 2 | 说明 `account.totp.step2`。6 位数字输入框（`inputMode="numeric"`、`autocomplete="one-time-code"`、autoFocus、maxLength 6）与主按钮「确认」→ A07。非 6 位数字时按钮禁用 |
| FX-147 | 口令错误（401） | 表单内提示 `account.totp.codeWrong`，输入框清空并重新聚焦，可重试。该接口与登录二次验证共用同一账号的失败计数（默认 15 分钟 5 次，S-01 API §4.4「TOTP-CONFIRM」） |
| FX-147a | 尝试次数已用尽（429） | 表单内 Alert：`account.totp.tooMany`，`{{minutes}}` 取响应头 `Retry-After` 换算（不足 1 分钟按 1 计；读不到响应头时取默认窗口 15 分钟）。确认按钮禁用，其下提供「重试」——只恢复表单的可提交状态，是否放行仍由服务端决定。「退出登录」保持可用。不显示为「口令错误」 |
| FX-148 | 绑定超时（400，`SETUP_EXPIRED`） | 提示 `account.totp.setupExpired`，回到步骤 1 并重新执行 A06（生成新密钥） |
| FX-149 | 恢复码视图 | 说明 `account.totp.step3`。10 个恢复码，等宽字体列表，形如 `XXXXX-XXXXX`。按钮「复制全部恢复码」（B07）。下方勾选框 `account.totp.saved`，勾选后主按钮「完成」才可用 → A08 |
| FX-150 | 恢复码只显示一次 | 关闭或刷新后无法再次查看。界面不做「稍后再说」 |
| FX-151 | 其他设备下线 | 绑定成功后服务端销毁该账号除当前会话外的全部会话。恢复码视图用一行说明 `account.totp.otherDevicesOut` 告知 |
| FX-152 | 完成后的去向 | A08 取回的 `pending` 为空 → 按 FX-123 跳转。若服务端在绑定期间又发布了新的隐私说明版本，`pending` 会含 `privacy_consent`，页面回到步骤一 |

### 4.4 状态与反馈矩阵（引导页）

| 状态 | 表现 |
|------|------|
| 任一请求进行中 | 触发按钮禁用；不使用全屏遮罩 |
| 请求失败且可重试 | 就地错误文案 + 「重试」或恢复按钮可用 |
| 服务端 503（未配置主密钥） | 就地提示 `account.totp.unavailable`，保留「退出登录」 |
| 绑定确认的尝试次数已用尽（429） | 就地提示 `account.totp.tooMany`，确认按钮禁用并提供「重试」，保留「退出登录」（FX-147a） |
| 请求失败且不可重试 | 直显服务端消息，保留「退出登录」 |
| 页面被刷新 | 一切从 FX-122 重新判定；待确认的绑定密钥已失效，回到步骤一或重新开始 |

## 5. 设置页「账号与安全」区块

### 5.1 「两步验证」卡

区块以 `React.lazy` 引入，挂在 `DebateSetting` 页面末尾（底部动作区之后）。挂载时执行 B01。

| 条件 | 显示 |
|------|------|
| B01 加载中 | 卡内线性进度 |
| B01 失败 | `common.loadFailed` + 「重试」 |
| `available === false` | 说明 `account.totp.unavailable`；没有任何操作按钮 |
| `available === true`，`enabled === false` | 状态标签「未开启」；说明 `account.totp.cardDesc`；主按钮「开启两步验证」（B02） |
| `enabled === true`，`recoveryCodesRemaining > 0` | 状态标签「已开启」；`account.totp.recoveryLeft`（`{{count}}`）；按钮「重新绑定」（B02）；`enforced === false` 时另有「关闭两步验证」（B05） |
| `enabled === true`，`recoveryCodesRemaining === 0` | 同上一行，另加警告提示 `account.totp.recoveryEmpty` |
| `enabled === true`，`enforced === true` | 同上，不显示「关闭两步验证」，改为一行说明 `account.totp.adminNoOff` |

- 「开启两步验证」与「重新绑定」打开同一个弹窗，内含与引导页共用的 `TotpEnrollPanel`（密码确认 → 扫码 → 恢复码），行为同 FX-143~FX-151。弹窗标题区分：首次为「绑定两步验证」，重新绑定时副标题为 `account.totp.rebindHint`。
- 恢复码视图的按钮为「我已保存，关闭」（B04）。关闭后重新拉取状态，并提示 `account.totp.bindDone`。
- 「关闭两步验证」：先经全局确认框（消息 `account.totp.turnOffConfirm`），再弹出一个带密码输入框的弹窗，提交 B05。成功后提示 `account.totp.turnedOff`。

### 5.2 绑定面板的复用

`TotpEnrollPanel` 是引导页与设置页共用的唯一实现，内部依次完成：取状态（可选）→ 密码确认 → `TOTP-SETUP` → 扫码与输入 → `TOTP-CONFIRM` → 恢复码。两处的差别只有两处：是否需要自带「取状态」（引导页需要），以及结束时的回调。

### 5.3 「我的登录记录」卡

| # | 项 | 值 |
|---|----|----|
| FX-171 | 数据源 | GET /api/audit/logins/list，`pageSize` 固定 20，`page` 从 1 起。服务端强制只返回当前账号的登录类事件 |
| FX-172 | 表头说明 | `account.logins.cardDesc` |
| FX-173 | 列 | ① 时间：按界面语言格式化为日期加时间，`title` 属性为完整时间戳 ② 事件：词条 `audit.login.<type>`；失败行在其下以小字显示 `audit.loginReason.<detail.reason>`（有则显示） ③ 结果：成功或失败 ④ 来源 IP：按接口返回值原样显示；为 `null` 时显示 `account.logins.noIp` |
| FX-174 | IP 的呈现 | 服务端已对失败事件脱敏（如 `203.0.113.*`），前端不做二次处理，也不尝试还原 |
| FX-175 | 排序 | 服务端按时间倒序，前端不排序 |
| FX-176 | 分页 | 底部「上一页」「下一页」与 `account.logins.pageInfo`。第一页禁用「上一页」；最后一页禁用「下一页」 |
| FX-177 | 空态 | `account.logins.empty` |
| FX-178 | 加载与错误 | 首次加载显示线性进度；翻页时表格半透明且按钮禁用；失败显示 `common.loadFailed` + 「重试」 |
| FX-179 | 不提供的操作 | 无导出、无删除、无筛选 |

### 5.4 新增界面词条（三语）

引导页：

| 键 | zh-Hans | en | fr-CA |
|----|---------|----|-------|
| `privacy.gate.title` | 请阅读并确认隐私说明 | Please read and confirm the Privacy Notice | Veuillez lire et confirmer l’avis de confidentialité |
| `privacy.gate.subtitle` | 我们更新了隐私说明，确认后才能继续使用。确认之前，你的操作记录不包含来源 IP。 | We updated the Privacy Notice; confirm it to continue. Until you do, your activity records won’t include your source IP. | Nous avons mis à jour l’avis de confidentialité ; confirmez-le pour continuer. D’ici là, vos relevés d’activité n’incluent pas votre adresse IP source. |
| `privacy.gate.accept` | 我已阅读并同意 | I have read and agree | J’ai lu et j’accepte |
| `privacy.gate.decline` | 不同意并退出 | Disagree and sign out | Refuser et se déconnecter |
| `privacy.gate.declineHint` | 退出后账号会保留。再次登录时仍需确认说明才能使用。 | Your account stays. You’ll be asked to confirm the notice again next time you sign in. | Votre compte est conservé. Vous devrez confirmer l’avis à votre prochaine connexion. |

两步验证：

| 键 | zh-Hans | en | fr-CA |
|----|---------|----|-------|
| `account.totp.cardTitle` | 两步验证 | Two-step verification | Vérification en deux étapes |
| `account.totp.cardDesc` | 登录时在密码之外，再输入验证器应用生成的动态口令。 | Sign in with your password plus a code from your authenticator app. | Connectez-vous avec votre mot de passe et un code généré par votre application d’authentification. |
| `account.totp.statusOn` | 已开启 | On | Activée |
| `account.totp.statusOff` | 未开启 | Off | Désactivée |
| `account.totp.enrollTitle` | 绑定两步验证 | Set up two-step verification | Activer la vérification en deux étapes |
| `account.totp.enrollRequired` | 管理员账号必须开启两步验证，完成绑定后才能继续使用。 | Administrator accounts must use two-step verification. Finish setting it up to continue. | Les comptes administrateurs doivent utiliser la vérification en deux étapes. Terminez l’activation pour continuer. |
| `account.totp.rebindHint` | 重新绑定会生成新的密钥和新的恢复码，旧的全部作废。 | Rebinding generates a new key and new recovery codes; the old ones stop working. | La réactivation génère une nouvelle clé et de nouveaux codes de récupération ; les anciens cessent de fonctionner. |
| `account.totp.turnOn` | 开启两步验证 | Turn on | Activer |
| `account.totp.rebind` | 重新绑定 | Rebind authenticator | Changer d’application |
| `account.totp.turnOff` | 关闭两步验证 | Turn off | Désactiver |
| `account.totp.adminNoOff` | 管理员账号必须开启两步验证，不能关闭。换手机时请用「重新绑定」。 | Administrator accounts must keep two-step verification on. Use “Rebind authenticator” when you change phones. | Les comptes administrateurs doivent conserver la vérification en deux étapes. Utilisez « Changer d’application » si vous changez de téléphone. |
| `account.totp.recoveryLeft` | 剩余恢复码 {{count}} 个 | {{count}} recovery codes left | {{count}} codes de récupération restants |
| `account.totp.recoveryEmpty` | 恢复码已用完。请重新绑定，生成新的恢复码。 | No recovery codes left. Rebind to generate new ones. | Plus aucun code de récupération. Réactivez pour en générer de nouveaux. |
| `account.totp.passwordPrompt` | 为确认是你本人操作，请输入登录密码。 | To confirm it’s you, enter your sign-in password. | Pour confirmer qu’il s’agit bien de vous, saisissez votre mot de passe. |
| `account.totp.wrongPassword` | 密码不正确。 | Wrong password. | Mot de passe incorrect. |
| `account.totp.step1` | 1. 用验证器应用扫码，或手动输入密钥。 | 1. Scan the QR code with your authenticator app, or enter the key manually. | 1. Scannez le code QR avec votre application d’authentification, ou saisissez la clé manuellement. |
| `account.totp.openInApp` | 在手机上点此添加到验证器 | Tap here on your phone to add it to your authenticator | Touchez ici sur votre téléphone pour l’ajouter à votre application |
| `account.totp.manualKey` | 手动输入密钥 | Manual entry key | Saisie manuelle de la clé |
| `account.totp.copy` | 复制 | Copy | Copier |
| `account.totp.copied` | 已复制 | Copied | Copié |
| `account.totp.qrFailed` | 二维码生成失败。你仍然可以手动输入密钥。 | Couldn’t generate the QR code. You can still enter the key manually. | Impossible de générer le code QR. Vous pouvez toujours saisir la clé manuellement. |
| `account.totp.step2` | 2. 输入验证器应用当前显示的 6 位动态口令，确认绑定。 | 2. Enter the 6-digit code currently shown in your authenticator app to confirm. | 2. Saisissez le code à 6 chiffres actuellement affiché dans votre application pour confirmer. |
| `account.totp.confirm` | 确认 | Confirm | Confirmer |
| `account.totp.codeWrong` | 动态口令不正确。请检查手机时间是否准确后重试。 | Incorrect code. Check that your phone’s clock is correct and try again. | Code incorrect. Vérifiez que l’heure de votre téléphone est juste et réessayez. |
| `account.totp.setupExpired` | 绑定已超时，请重新开始。 | Setup timed out. Please start again. | La configuration a expiré. Recommencez. |
| `account.totp.tooMany` | 尝试次数过多，请在 {{minutes}} 分钟后再试。 | Too many attempts. Try again in {{minutes}} minutes. | Trop de tentatives. Réessayez dans {{minutes}} minutes. |
| `account.totp.step3` | 3. 保存恢复码。每个只能使用一次，丢失验证器时用它登录。此页面只显示这一次。 | 3. Save your recovery codes. Each works once; use them to sign in if you lose your authenticator. This is the only time they’re shown. | 3. Enregistrez vos codes de récupération. Chacun sert une seule fois ; utilisez-les pour vous connecter si vous perdez votre application. Ils ne sont affichés que cette fois. |
| `account.totp.copyAllCodes` | 复制全部恢复码 | Copy all codes | Copier tous les codes |
| `account.totp.saved` | 我已保存恢复码 | I’ve saved my recovery codes | J’ai enregistré mes codes de récupération |
| `account.totp.otherDevicesOut` | 绑定后，你在其他设备上的登录会失效。 | After setup, you’ll be signed out on your other devices. | Après l’activation, vous serez déconnecté de vos autres appareils. |
| `account.totp.finish` | 完成 | Done | Terminer |
| `account.totp.savedClose` | 我已保存，关闭 | Saved, close | Enregistré, fermer |
| `account.totp.bindDone` | 两步验证已开启 | Two-step verification is on | La vérification en deux étapes est activée |
| `account.totp.turnOffConfirm` | 关闭后，登录只需要密码。确定关闭两步验证吗？ | After turning it off, signing in needs only your password. Turn off two-step verification? | Après désactivation, la connexion ne nécessite que votre mot de passe. Désactiver la vérification en deux étapes ? |
| `account.totp.turnedOff` | 两步验证已关闭 | Two-step verification is off | La vérification en deux étapes est désactivée |
| `account.totp.unavailable` | 服务器尚未配置两步验证，暂时无法开启。 | Two-step verification isn’t configured on this server yet, so it can’t be turned on. | La vérification en deux étapes n’est pas encore configurée sur ce serveur et ne peut pas être activée. |

我的登录记录：

| 键 | zh-Hans | en | fr-CA |
|----|---------|----|-------|
| `account.sectionTitle` | 账号与安全 | Account and security | Compte et sécurité |
| `account.logins.cardTitle` | 我的登录记录 | My sign-in history | Historique de mes connexions |
| `account.logins.cardDesc` | 最近 184 天内与你的账号有关的登录记录。失败记录的来源 IP 隐去了最后一段。 | Sign-in activity on your account from the last 184 days. The last part of the IP is hidden for failed attempts. | Activité de connexion de votre compte sur les 184 derniers jours. La dernière partie de l’adresse IP est masquée pour les tentatives échouées. |
| `account.logins.time` | 时间 | Time | Date et heure |
| `account.logins.event` | 事件 | Event | Événement |
| `account.logins.result` | 结果 | Result | Résultat |
| `account.logins.ip` | 来源 IP | Source IP | Adresse IP source |
| `account.logins.noIp` | 未记录 | Not recorded | Non enregistrée |
| `account.logins.empty` | 还没有登录记录。 | No sign-in activity yet. | Aucune connexion enregistrée. |
| `account.logins.prev` | 上一页 | Previous | Précédente |
| `account.logins.next` | 下一页 | Next | Suivante |
| `account.logins.pageInfo` | 第 {{page}} / {{pages}} 页，共 {{total}} 条 | Page {{page}} of {{pages}}, {{total}} entries | Page {{page}} sur {{pages}}, {{total}} entrées |
| `common.loadFailed` | 加载失败 | Couldn’t load | Échec du chargement |
| `common.retry` | 重试 | Try again | Réessayer |
| `audit.result.success` | 成功 | Success | Succès |
| `audit.result.failure` | 失败 | Failed | Échec |

事件与原因标签：

| 键 | zh-Hans | en | fr-CA |
|----|---------|----|-------|
| `audit.login.login_succeeded` | 登录成功 | Signed in | Connexion réussie |
| `audit.login.login_failed` | 登录失败 | Sign-in failed | Échec de la connexion |
| `audit.login.totp_succeeded` | 两步验证通过 | Two-step code accepted | Code à deux étapes accepté |
| `audit.login.totp_failed` | 两步验证失败 | Two-step code rejected | Code à deux étapes refusé |
| `audit.login.recovery_code_used` | 使用了恢复码 | Recovery code used | Code de récupération utilisé |
| `audit.loginReason.invalid_credentials` | 用户名或密码错误 | Wrong username or password | Nom d’utilisateur ou mot de passe erroné |
| `audit.loginReason.account_disabled` | 账号已被禁用 | Account disabled | Compte désactivé |

文案遵循 frontend-rules R6：直白说清结果与下一步，不用感叹号，不堆砌 emoji。

## 6. 详情页（裁剪：不适用）

没有详情路由。恢复码视图是绑定流程内的一个视图，不是可再次进入的详情页。

## 7. 路由定义

| # | 项 | 值 |
|---|----|----|
| FX-181 | 路由声明 | `/gate` → `React.lazy(() => import('./GatePage'))`，元素 `<GatePage />`，**不包 ProtectedRoute**（会话与待办的判定在组件内，FX-122~FX-124） |
| FX-182 | 路由位置 | 与 `/login` 一样视为公开路由：`apiClient` 的 401 拦截器对 `/gate` 不跳转。会话失效时由 FX-122 导向登录页 |
| FX-183 | 入口 | ① 登录、注册、二次验证成功且 `pending` 非空（login PageSpec v1.1 FX-125）② `ProtectedRoute` 对任何受保护路由的重定向（FX-126），携带 `next` 为原路径与查询 |
| FX-184 | 出口 | `pending` 清空后跳 `safeNextPath(next)`；`next` 缺省或为 `/gate` 自身时跳 `/`（FX-123）；退出登录跳 `/login` |
| FX-185 | `/settings` | 路由不变（既有 ProtectedRoute）。本篇只在该页末尾新增区块 |

## 8. 全局一致性

### 8.0 交互确认记录（d4 Step 4 七项）

| 确认项 | 结论 |
|--------|------|
| 1 模块元信息 | §1；两处页面类型均为 config，局部 code 交互为二维码生成 |
| 2 查询条件 | 「我的登录记录」无筛选，只有分页 |
| 3 表格列 | §5.3 FX-173：时间、事件、结果、来源 IP |
| 4 operList | 不适用；页面级 Action 见 §2 |
| 5 表单分组 | 引导页按步骤分视图；设置页把绑定流程放进弹窗 |
| 6 详情 Card | 不适用 |
| 7 页面类型覆盖 | 无 hybrid 覆盖 |

### 8.1 一致性项

| # | 项 | 实现 |
|---|----|------|
| FX-186 | i18n | 全部文案走 `useTranslation`，三语词条见 §5.4；无硬编码 JSX 文案 |
| FX-187 | 错误反馈 | 就地 Alert 或表单内提示；优先按 `code` 用词条表达；无词条时直显服务端消息；可重试的失败都给出「重试」 |
| FX-188 | 加载反馈 | 每个请求都有进行中态（按钮禁用或线性进度），没有静默等待 |
| FX-189 | 暗色模式 | 全部使用 MUI 主题变量；二维码以白底黑码放在固定白色圆角容器内，不随主题反色 |
| FX-190 | 语言切换 | 引导页卡头的语言切换会重新请求隐私说明；恢复码与密钥不受语言影响 |
| FX-191 | 会话安全 | 密钥与恢复码只在内存与界面上存在，离开视图即丢弃；不写 localStorage、不进 URL、不输出到控制台 |
| FX-192 | 无障碍 | 6 位输入框 autoFocus 与 `autocomplete="one-time-code"`；二维码 `img` 有 alt；勾选框可键盘操作；弹窗焦点落入、Esc 关闭（进行中的请求除外） |
| FX-193 | 响应式 | 引导页卡宽 480；恢复码列表在窄屏单列；登录记录表在窄屏横向滚动 |
| FX-194 | 离线 | OfflineBanner 全局挂载；请求失败按错误态处理 |
| FX-195 | 跳转安全 | `next` 沿用 `safeNextPath` 白名单（login PageSpec v1.1 FX-123）；`/gate` 自身回落 `/` |
| FX-196 | XSS/注入面 | 隐私说明按纯文本渲染；二维码用 Data URL 赋给 `img.src`，不使用 `innerHTML`；otpauth 链接来自服务端，只作为 `href` 使用，协议固定为 `otpauth:` |
| FX-197 | 体积 | `/gate`、账号安全区块、二维码库三者都是独立代码块，按需加载；不进入首页与登录页的首屏（R20 §9.6） |
| FX-198 | 与 API 文档一致性 | §2 的 Action 与 api-S-01-auth.md v1.1 的 ME、TOTP-STATUS、TOTP-SETUP、TOTP-CONFIRM、TOTP-DISABLE、PRIVACY-NOTICE、PRIVACY-CONSENT 及 api-P-04-audit.md 的 AUDIT-LOGINS 一一对应；消费字段与接口响应逐字段对读 |

## 9. 文档版本与变更记录

**版本号规则**：`vMAJOR.MINOR`；步骤集合或路由不兼容变更升 MAJOR。
**变更类型词汇**：`initial` / `structural` / `action_added|changed|removed` / `field_added|changed|removed` / `copy_changed` / `route_changed`。

| 版本 | 日期 | 变更类型 | 变更说明 |
|------|------|---------|---------|
| v1.0 | 2026-11-24 | initial | R20 新增：登录后引导页 `/gate`（隐私说明确认、管理员强制绑定）与设置页「账号与安全」区块（两步验证卡、我的登录记录卡）；共用的绑定面板；三语词条 |

### 输出自检记录（d4 输出校验：机械自检表 + FX 逐条核查）

| # | 项 | 结果 |
|---|----|------|
| M1 | 九章节结构完整（🔒 1/2/3/7/8/9 章全存在；4、5 章实设；6 章裁剪标注） | ✅ |
| M2 | 每个 Action 有接口编码对应且 API 编码在对应 API 文档中存在 | ✅ §2 逐条对读 api-S-01-auth.md v1.1 §4.4 与 api-P-04-audit.md §4.4；A01、B07 明确标注「无接口」 |
| M3 | 字典 Key 均在 enum-pool.md 有定义 | ✅ EP-IDENT-06/07、EP-AUDIT-01/02/03、EP-I18N-01（enum-pool.md v1.2） |
| M4 | 占位符残留 | ✅ 无（`{{count}}` 等是 i18n 插值占位） |
| M5 | 路由与守卫 | ✅ §7 |
| M6 | 全局组件复用一致性（反馈、主题、i18n、401） | ✅ §8 |
| M7 | 变更记录含本次行 | ✅ §9 v1.0 initial |
| FX 核查 | FX-143（`needsPassword`）、FX-147、FX-148（`SETUP_EXPIRED`）、FX-151（其他设备下线）、FX-123（`/gate` 自身回落）逐条对照 S-01 API v1.1 §4.4 | ✅ |
