# 领域模型 — 比赛记录域（D2-2）

| 属性 | 值 |
|------|-----|
| 版本 | v1.0 |
| 日期 | 2026-10-11 |
| 输入 | PRD match-records.md v1.0 |

## 本域信息

| 项目 | 内容 |
|------|------|
| 本域名称 | 比赛记录（支撑域，隶属赛后复盘） |
| 领域分层 | 支撑域（服务核心复盘能力，含业务规则：超时判定/快照不可变） |
| 聚合根 | MatchRecord |

## Step 0 范围判定

PRD 标注模块 S-03 → 范围明确，跳过战略设计。

## 聚合根识别（A1–A4）

| 测试 | 结果 | 说明 |
|------|------|------|
| A1 一致性边界 | ✓ | stages/summary 由提交时一次性计算，创建后不可变 |
| A2 全局引用 | ✓ | 记录 id 用于详情/导出/删除 |
| A3 生命周期入口 | ✓ | 条目只能经 POST 创建（无 update 端点） |
| A4 规则驱动 | ✓ | 超时判定/截断规则 |

判定：**4/4 → 聚合根 MatchRecord**

## 域内对象

| 对象 | 分类 | 与上级关系 | 核心字段 | 备注 |
|------|------|-----------|---------|------|
| 阶段条目 StageActual | 实体（数组内嵌） | 隶属 MatchRecord | stageId/label/mode/plannedSeconds/graceSeconds/actualAff/NegSeconds/overrunAff/Neg/enteredAt/exitedAt | 无独立访问入口 |
| 汇总 summary | 值对象 | 内嵌 | totalPlanned/totalActual/overrunCount | 提交时派生并固化 |
| 模板快照字段 | 值对象 | 内嵌 | configName/teamNames | 与模板域解耦（BB-6） |

## 关联领域对象

| 对象 | 所属域 | 关联字段 | 需获取信息 | 触发 | 映射 |
|------|--------|---------|-----------|------|------|
| 配置文档 | 流程模板域 | configName（快照字符串，非引用） | 提交时前端自带 | 提交 | 遵奉者（载荷自带，服务端不回查） |

## 过程数据

控制端计时采集缓冲（本地 state/暂存）＝ P3 UI 交互状态；导出的 CSV 行 = P4 请求/响应结构派生。

## 领域事件与集成

无异步事件；创建即终态。集成：REST（OHS）+ CSV/JSON 下载（发布语言）。
仓储契约：`match_logs` 集合 — insertOne / find(ownerId, 降序, 分页) / findOne / deleteOne；索引 `{ownerId:1, savedAt:-1}`。
