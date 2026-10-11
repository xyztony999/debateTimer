# API 设计文档 — S-04 模板广场（gallery）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 待评审 |
| 模块编码 | S-04（支撑业务域） |
| 日期 | 2026-10-11 |
| 输入 | PRD template-gallery.md v1.0 |

## 1. 模块设计概述

### 1.1 背景与目标

公开赛制模板的发布/浏览/复制/下架。目标：零新集合——广场是 `configurations.isPublic`
的横切只读视图 + 一个 owner 写开关。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 负责 | 可见性开关、匿名广场读（列表/详情，脱敏投影）、管理员下架 |
| 不负责 | 复制落库（走既有 PUT /api/configurations/:name）；导入（脚本 --public） |
| 隐私 | 广场响应**绝不**包含 ownerId/username/shareToken（CB-1/CB-4） |

### 1.3 设计决策

| # | 决策 | 理由 |
|---|------|------|
| CD-1 | isPublic 布尔横切，不建新集合 | 广场无独立生命周期 |
| CD-2 | 复用 toDisplayResponse + 派生摘要 | 与分享详情同构，少一条投影逻辑 |
| CD-3 | 复制无服务端端点 | 前端读详情→保存，天然身份隔离 |
| CD-4 | unpublish 走 gallery 命名空间而非 configurations | 管理动作与 owner 动作分离 |

### 1.4 领域对象 / 1.5 上下文映射

配置聚合根（既有，+isPublic）；权限域遵奉；模板域遵奉（保存端点复用）。

## 2. 跨聚合根设计

不适用。

## 3. 应用/基础设施层设计

- 新路由 `server/routes/gallery.js`：`/api/gallery`（匿名读）+ `/api/gallery/:id/unpublish`（admin）
- visibility 开关并入 configurations 路由（auth+owner+CSRF）
- 索引：`{isPublic:1, updatedAt:-1}` partial（isPublic:true）
- 错误码：401（匿名写）、403（非 owner/admin）、404（不存在或未发布）

## 4. 详细设计

### 4.1 字段

配置文档 +`isPublic: boolean`（缺省 false）。`toConfigResponse` 透出 `isPublic`（owner 视角）。

### 4.2 接口清单

| # | 接口 | 方法 | 路径 | 权限 | 用户类型 |
|---|------|------|------|------|---------|
| 1 | 发布开关 | POST | `/api/configurations/:name/visibility` | auth+owner | [操作员] |
| 2 | 广场列表 | GET | `/api/gallery?limit&before` | 匿名 | [操作员][观众] |
| 3 | 广场详情 | GET | `/api/gallery/:id` | 匿名 | [操作员][观众] |
| 4 | 强制下架 | POST | `/api/gallery/:id/unpublish` | auth+admin | [管理员] |

**#1** 请求 `{public: boolean}`；行为：更新 isPublic+updatedAt 并 SSE 广播配置变更（owner 频道）。
响应 `{isPublic}`。重复设置幂等。

**#2** 响应 `data:{items:[{id,name,stageCount,totalSeconds,modeSummary,updatedAt}],nextBefore}`；
modeSummary 由 timerSettings 统计（如 `single×12 · double×3 · free×1`）。

**#3** 按 `{_id, isPublic:true}` 查询；响应 `data = toDisplayResponse(doc) + {id, stageCount, totalSeconds}`；非公开一律 404（不区分不存在与未发布）。

**#4** 按 `{_id, isPublic:true}` 查询后置 false；响应 `{unpublished:true}`；幂等。

### 4.3 领域事件与集成

无新事件；visibility 变更经既有配置 change 广播通知 owner 在线端刷新。

## 5. 模块清单汇总

| 项 | 值 |
|----|-----|
| 新端点 | #1–#4（复用配置集合） |
| 集合/索引 | configurations +`{isPublic:1, updatedAt:-1}` partial |
| 脚本 | import-configurations.js +`--public`；presets/ 三份样例赛制 |

## 6. 更新记录

| 类型 | 目标 | 说明 |
|------|------|------|
| initial | S-04 | visibility 开关 + gallery 匿名读 + admin 下架 |
| field_added | 配置文档 | +isPublic |
| interface_added | #1–#4 | |

> PageSpec：`/gallery` 列表（卡片：名称/阶段数/总时长/模式构成/更新时间）+ 详情抽屉
> （阶段表 + 「复制到我的模板」）；设置页模板管理卡 + 发布开关；登录页 next 支持
> /gallery/:id。详见 `interaction/operator/S-04-gallery/S-04-gallery.md`。
