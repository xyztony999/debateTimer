# common-enums

跨模块通用的基础枚举（通用语义，不绑定单一模块）。由 /design 维护。

| 枚举 | 值 | 语义 | 使用方 |
|------|-----|------|--------|
| shareEnabled | `true` / `false` | 分享开关（配置文档字段） | S-02、C-02（会话前置条件） |
| httpEnvelope | `success: boolean, data?, message?` | 接口统一信封 | 全部 API |
| userRole | `user` / `admin` | 用户角色（既有 auth 域） | D-01 及各权限判定 |
