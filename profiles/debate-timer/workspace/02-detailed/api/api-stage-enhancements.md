# API 设计文档 — 赛制增强（配置 schema v3 + 快照 v2）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 状态 | 待评审 |
| 模块编码 | C-01-06 / C-01-07 / C-01-05（扩展）/ S-01-02（扩展）/ S-01-06 / P-02-03 |
| 日期 | 2026-10-11 |
| 输入 | PRD stage-enhancements.md v1.0 + 领域模型增量 stage-enhancements-increment.md |

## 1. 模块设计概述

### 1.1 业务背景及目标

为赛制表达补齐四项能力：阶段宽限、节点化提示音、队名、自动推进。目标：零新端点——
全部经既有配置保存/读取与快照通道承载，服务端仅扩展字段校验。

### 1.2 边界说明

| 边界 | 说明 |
|------|------|
| 本变更负责 | 配置文档新字段的载荷/校验/响应投影；快照可选字段；枚举登记 |
| 不负责 | 宽限/推进的前端行为（C-01）；铃声资产与偏好 UI（P-02-03，本地） |
| 端点变更 | **无新增端点**；既有 `PUT/GET /api/configurations/:name`、`GET /api/display/:token`、`PUT …/session/state` 载荷扩展 |

### 1.3 设计决策

| # | 决策 | 理由 |
|---|------|------|
| AD-1 | 新配置字段全部可选、独立三键 | 缺省即 v1.0 行为；避免嵌套结构破坏既有扁平键约定（debateStages/timerSettings 同风格） |
| AD-2 | 宽限走配置、不走快照阶段配置下发 | 模板属实的属性随配置流；快照只携带运行态（相位+剩余） |
| AD-3 | 提示音偏好不进服务端 | 展示基座定位（同主题/语言），避免账户模型与迁移 |
| AD-4 | 快照扩展为可选键 | 发布语言向后兼容：旧显示端忽略未知键（BR/AB-7） |

### 1.4 领域对象总览

见领域模型增量文档：配置文档三新字段（值对象替换）、快照两可选属性、timerPhase 枚举。

### 1.5 上下文映射

不变（遵奉配置域 / OHS+PL 快照发布语言）。

## 2. 跨聚合根设计

不适用（无新聚合根）。

## 3. 应用/基础设施层设计

### 3.1 接口规范

沿用既有规范（JSON 信封、权限、CSRF）；本变更仅扩展载荷。

### 3.2 依赖与约束

新增约束：铃声资产由前端静态目录提供（≥2 方案/节点 + 新增「时间到」短铃）。

### 3.3 权限模型

不变（配置写=owner；display 读=token 可见）。

### 3.4 公共规范

#### 枚举登记（enum-pool）

| 枚举 | 值 | 说明 |
|------|-----|------|
| timerPhase | `running` / `grace` / `locked` | 快照计时相位；缺省 running（兼容旧快照） |

#### 错误码增量

| 状态 | 条件 | message 示例 |
|------|------|-------------|
| 400 | stageGrace 值非 0–300 整数 | `Invalid stageGrace for stage "X": expected integer 0-300` |
| 400 | teamNames 超长（>20） | `Invalid teamNames: max length 20` |

## 4. 配置文档详细设计（字段增量）

### 4.1 领域模型（配置 schema v3）

| 字段 | 类型 | 必填 | 校验 | 缺省 |
|------|------|------|------|------|
| stageGrace | `Map<stageId, int>` | 否 | 每值 0–300 整数；stageId 须存在于 debateStages | `{}`（=0 全关） |
| stageAutoAdvance | `Map<stageId, bool>` | 否 | stageId 须存在 | `{}`（=false 全关） |
| teamNames | `{ aff: string, neg: string }` | 否 | 各 ≤20 字符；空串=默认 | 无键（默认称谓） |

`pickConfigFields` 白名单增加三键；`toConfigResponse` / `toDisplayResponse` 透传三键。

### 4.2 接口载荷变更（既有端点）

**PUT /api/configurations/:name**（请求体新增可选键，见 4.1）

**GET /api/configurations/:name / GET /api/display/:token**（响应 data 新增可选键）

**PUT /api/configurations/:name/session/state**（快照 v2 新增可选字段）

| 字段 | 类型 | 必填 | 校验 |
|------|------|------|------|
| phaseAff / phaseNeg | timerPhase 枚举 | 否（缺省 running） | 与 grace 一致性：phase=grace ⇔ 对应 graceMs>0；locked ⇔ graceMs=0 且主时间尽 |
| graceAffMs / graceNegMs | int | 否 | 0–300000；grace 相位必填 |

> v1.1 修订（Gate 1 后）：原设计单一 `timerPhase/graceMs` 无法表达双计时双方各自相位
> （一方宽限中、一方运行中的常态），改为按方并行字段；single 模式服务端归一
> phaseNeg=phaseAff、graceNegMs=graceAffMs（与 remaining 归一策略一致）。

服务端校验后随快照原样缓存广播（serverTime 盖戳规则不变）。

### 4.3 领域事件与集成

SnapshotUpdated 载荷扩展两可选键；SSE 帧格式不变。

## 5. 模块清单汇总

| 项 | 变更 |
|----|------|
| 新端点 | 无 |
| 存储 | `configurations` 集合无结构变更（应用层字段）；无新集合 |
| DDL | 不适用 |

## 6. 更新记录

| 类型 | 目标 | 说明 |
|------|------|------|
| field_added | 配置文档 | +stageGrace / +stageAutoAdvance / +teamNames（可选） |
| field_added | 快照 | +phaseAff / +phaseNeg / +graceAffMs / +graceNegMs（可选；v1.1 修订为按方并行） |
| enum_added | timerPhase | running/grace/locked |
| rule_added | 校验 | 宽限 0–300、队名 ≤20、stageId 存在性、相位-宽限一致性 |

> 版本：v1.0（initial）。
