# PageSpec — S-04 模板广场（/gallery 列表 + 详情 + 复制；设置页发布开关）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
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

> FX 适配说明同前。
