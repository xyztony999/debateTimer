# enum-pool

模块可复用/需登记的业务枚举池。由 /design（D1/D3）维护。

| 枚举 | 值 | 所属模块 | 首次登记 | 备注 |
|------|-----|---------|---------|------|
| stageTimingMode | `single` / `double` / `free` | S-01-02 → C-01 | v1.0 2026-10-10（api-timer-session.md） | 阶段计时模式；`free`=自由辩论（本次新增）；前端 `TimerSetting` 0/1/2；旧客户端遇 `free` 降级 `double` |
| timerSessionStatus | `active` / `ended` / `expired` | C-02 | v1.0 2026-10-10（api-timer-session.md） | 控制会话状态机 |
| activeSide | `aff` / `neg` / `none` | C-01-03 / C-02 | v1.0 2026-10-10（api-timer-session.md） | 当前发言方（自由辩论用） |
| sessionEventReason | `closed_by_operator` / `heartbeat_timeout` / `share_disabled` / `superseded` / `server_restart` | C-02 | v1.0 2026-10-10（api-timer-session.md） | 会话结束/失活原因（SSE session 事件） |
| timerPhase | `running` / `grace` / `locked` | C-01-06 / C-02 | v1.0 2026-10-11（api-stage-enhancements.md） | 快照计时相位；缺省 running（宽限=收尾倒计时，锁定=必须停后） |
