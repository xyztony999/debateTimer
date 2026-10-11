---
name: frontend-specs
description: React 19 + Vite 前端编码规约（本栈）：目录结构、组件/hooks、路由、状态、MUI/样式、i18n、类型检查与构建门禁。
---

# React Web 栈 — 前端规约（frontend-specs）

> **层级**：L2 技术栈 profile skills，随栈激活挂载。
> 📎 参考实现：tinypost（Electron+React19+TS 渲染层）、debate-timer（React19+MUI SPA）。接入项目按 manifest 槽位替换。

## 目录与模块

- 页面级组件放 `src/pages/<Feature>/`，可复用组件放 `src/components/`，页面私有子组件留在页面目录内
- hooks 统一 `use` 前提命名；跨页面 hooks 放 `src/hooks/`
- 环境与配置经模块导出，禁止在组件内散落字面量

## 组件与状态

- 函数组件 + hooks；不写 class 组件
- 服务端/异步状态优先自定义 hook 封装（请求、加载、错误三态齐备）
- 跨页面共享状态才上全局（Context/zustand 等），页面内状态用 useState

## 路由

- react-router v7（SPA）；路由表集中声明，懒加载用 React.lazy + Suspense

## 样式（按项目变体）

- MUI 变体：主题经 ThemeProvider；暗色模式跟随系统 + 手动覆盖可记忆
- 轻渲染层变体：CSS Modules / 原生 CSS，保持零 UI 框架依赖

## i18n（可选）

- i18next + 浏览器语言检测；文案不硬编码进 JSX

## 门禁（生成代码必须通过）

- 类型检查（有 TS 的项目）：`npm run typecheck`
- Lint：`npm run lint`（或 bun run lint）
- 构建：`npm run build`
