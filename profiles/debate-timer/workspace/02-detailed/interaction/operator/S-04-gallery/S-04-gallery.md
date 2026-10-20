# PageSpec — S-04 模板广场（/gallery 列表 + 详情 + 复制；设置页发布开关）

| 属性 | 值 |
|------|-----|
| 版本 | v1.1 |
| 日期 | 2026-10-11 |
| 用户类型 | 操作员 / 匿名访客（浏览）；管理员（下架） |
| 页面类型 | `config`（列表/详情） |

## 1. 路由

| 路由 | 组件 | 访问 |
|------|------|------|
| `/gallery` | `src/GalleryPage.jsx`（新） | 公开（同 /display 免登录） |
| `/gallery/:id` | 同上页内详情抽屉 | 公开 |
| `/settings` | DebateSetting 增强 | 认证 |

导航入口：设置页模板管理卡「🌐 模板广场」链接；登录页注册成功后引导可发现（不加自动跳转）。

## 2. 广场列表（GalleryPage）

- 布局：顶部标题 + 语言/主题切换（复用 LanguageSwitcher/ColorMode）；卡片网格
- 卡片：模板名 / 阶段数 / 总时长（mm:ss 或 x 分 y 秒）/ 模式构成（Chip 组）/ 更新时间
- 交互：点击卡片 → 展开详情抽屉（Dialog）：阶段表（名称/模式/时长）+ 底部按钮
  - 已登录：`复制到我的模板`（可编辑名称，预填「源名 (副本)」）
  - 未登录：`登录后复制` → `/login?next=/gallery/:id`
- 分页：`加载更多`（nextBefore）；三态：加载 Skeleton / 错误 Alert+重试 / 空态引导

## 3. 设置页增量

模板管理卡新增一行：
- `Switch`「发布到广场」+ 状态文案（已发布/未发布）；切换调 visibility 接口，
  失败回滚开关并 notify（R3）
- 默认模板同样可发布（owner=首个管理员账号）

## 4. 管理员下架（最小实现）

管理页（AdminPage）模板列表行新增「下架」按钮（仅 isPublic=true 行显示）→ 确认 → unpublish。

## 5. Action 定义

| Action Key | 行为 | 接口 |
|-----------|------|------|
| gallery/list | 拉取列表（游标） | GET #2 |
| gallery/detail | 拉取详情 | GET #3 |
| visibility/update | 发布/取消发布 | POST #1 |
| gallery/copy | 读详情→saveConfiguration 保存副本 | GET #3 + PUT 配置（既有） |
| gallery/unpublish | 管理员下架 | POST #4 |

## 6. 字典 Key（i18n 三语言）

gallery.title / gallery.empty / gallery.stageCount / gallery.totalDuration / gallery.updatedAt /
gallery.copy / gallery.copyName / gallery.copied / gallery.loginToCopy / gallery.offlineSource /
gallery.unpublish / gallery.unpublished / settings.publishToGallery / settings.published /
gallery.modeSummary 单双自由沿用 settings.*Timer。

## 7. 全局一致性

- 匿名页 API 走 skipAuthRedirect（同 display）；接口地址经 `GalleryService`（R2）
- 明暗主题（R4）；复制成功后跳 `/settings` 并加载新模板

## 8. 版本与变更记录

| 版本 | 日期 | 说明 |
|------|------|------|
| v1.0 | 2026-10-11 | 初稿 |
| v1.1 | 2026-10-12 | 视觉对齐计时器控制台：AppBar 化 + 卡片现代化（见 §9） |

## 9. v1.1 增量：视觉对齐计时器控制台（2026-10-12）

**背景**：用户反馈——①广场样式未对齐重构后的计时器（仍为遗留 hero 横幅 + 自制按钮行）；②返回按钮等未做现代化排版。

**设计决策**：

| # | 决策 | 内容 |
|---|------|------|
| G1 | AppBar 化 | 顶部改为与 TimerControlPage 同款 MUI AppBar（sticky/primary 深蓝）：左 `←` IconButton 返回（登录→/，匿名→/login）+ "🌐 模板广场" h6 标题；右 LanguageSwitcher(onDark) + 主题切换 IconButton（LightMode/DarkMode 图标，替代 emoji） |
| G2 | 卡片现代化 | hover 上浮 2px + 阴影加深 + 边框 primary 强调（对齐 tb-box/st-step 交互语言）；圆角 16px 对齐；chips 与 meta 排版不变 |
| G3 | 遗留清理 | `.gallery-page`/`.settings-header` 不再用于广场（RecordsPage 仍用 settings-header，CSS 保留） |

**不变项**：Action/API/i18n 零变更；详情 Dialog 结构保留；匿名浏览与登录复制流程不变。

**验收标准**：

- [ ] AppBar 视觉与计时器控制台一致（同色/同高/图标按钮风格）
- [ ] 卡片 hover 有上浮+边框强调反馈；圆角与计时器卡片一致
- [ ] 返回按钮为图标按钮且语义正确（登录态→计时器，匿名→登录）
- [ ] 暗色/浅色两主题正常；触屏无回归
- [ ] lint/test/build 全绿

> FX 适配说明同前。
