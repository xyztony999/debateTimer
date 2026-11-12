# C-01 比赛计时 API 设计 · 变更摘要

| 属性 | 值 |
|------|-----|
| 文档 | [api-C-01-比赛计时.md](api-C-01-比赛计时.md) v1.0 |
| 对比基线 | 无旧版(本次为首次归档) |
| 生成日期 | 2026-11-11 |

## 变更记录(结构化)

| 版本 | 日期 | 变更类型 | 目标节号 | 摘要 |
|------|------|---------|---------|------|
| v1.0 | 2026-11-11 | initial | — | 逆向归档初始生成:如实确认 **C-01 无服务端接口,引擎状态本地聚合**(HTTP 接口清单为空);登记进程内契约——聚合根动作清单(APPLY_STAGE/START/STOP/TOGGLE/RESET/TICK/SET_ADVANCE/ADVANCE_TICK/ADOPT/SOUND_CHECK/PREP_ZERO/STOP_ALL/CONSUME_EVENTS)、引擎事件(sound/voice/overrun)、枚举池(stageMode/phase/node/sound/side)与业务常量(MAX_CATCHUP_BEATS=300、闪烁窗口 27–30、心跳 250ms、再锚定阈值 1500ms);标注快照 wire 契约归 C-02 API 文档、记录载荷契约归 S-04 API 文档 |

## 逐章对比说明(无旧版,首版定位)

| 章节 | 本次内容 | 备注 |
|------|---------|------|
| §2 跨聚合根设计 | 不适用(单聚合根) | 裁剪并显式标注 |
| §3.1 接口规范 | 进程内契约规范 + HTTP 清单=空 | 核心如实标注 |
| §3.3 权限模型 | 无服务端权限矩阵;计时台页面 ProtectedRoute 前端守卫 | `src/App.jsx:30-37` |
| §4.4 接口详情 | 不适用(无 HTTP/远程服务) | 动作接口清单替代 |
| §5 清单汇总 | 对外服务=无;SQL/DDL=无;下游域服务索引 | |

## 变更类型词汇表

| 变更类型 | 含义 | 需要目标节号 |
|---------|------|------------|
| `initial` | 首次生成 | 否 |
| `structural` | 章节增删/重组 | 否 |
| `interface_added` / `interface_changed` / `interface_removed` | 接口增删改 | 是 |
| `enum_value_added` / `enum_value_changed` | 枚举增改 | 是 |
| `rule_added` / `rule_changed` | 规则增删改 | 是 |
| `event_added` / `event_changed` | 领域事件增删改 | 是 |

## 版本号规则

次版本(+0.1)随契约面变更(动作/事件/枚举/常量)递增;章节重组用 structural 记录并升次版本;本模块为纯前端域,主版本仅在进程内契约破坏性变更(动作语义不兼容)时递增。
