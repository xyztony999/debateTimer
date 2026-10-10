# React Web 栈 — 前端规则（frontend-rules）

> **层级**：L2 技术栈 profile。激活含本栈的业务 profile 时挂载生效。

- R1 提交前必须通过 typecheck（如项目有 TS）与 lint；CI 以 `build` 成功为准
- R2 禁止在组件内直接写死接口地址/密钥；统一走配置模块或环境变量
- R3 异步交互必须有加载/错误两态的可见反馈；禁止静默失败
- R4 暗色模式为默认适配项（跟随系统），不得只做亮色主题
- R5 依赖变更走包管理器锁定文件提交（bun.lock / package-lock.json）
