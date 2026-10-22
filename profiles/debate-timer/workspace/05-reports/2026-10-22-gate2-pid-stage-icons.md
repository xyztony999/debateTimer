# Gate 2 — PID 当前节点环节图标

日期：2026-10-22。模块：pid-timeline-v3 增量。设计：C-02 PageSpec v2.9 §21。

## 交付

- F1：新增 `src/components/StageIcon.jsx`；16 个预置环节按稳定 ID 映射语义图标，自定义环节按已有计时模式回退。
- F2：`TimerControlPage` 当前节点使用 StageIcon，传递当前 stageId、mode、st-marker 和 aria-hidden；桌面与遥控布局共享现有 stageTimeline。
- F3：CSS 只更新火车相关注释，声明不变；无新增路由、配置字段、接口、异步交互、依赖或文案。
- F4：完成 SSR、回归测试、Lint 和生产构建验证。

## 验证证据

- 子代理临时 `bun -e` + React `renderToStaticMarkup` 渲染验证 40 例通过：16 个稳定 ID；6 种字符串/数字模式；5 个未知、原型或缺失 ID；13 种缺失/无效模式。逐例断言实际 SVG 图标、单个 SVG、className、aria-hidden、color 和 fontSize 透传。
- `bun test`：128 pass、0 fail、445 assertions，14 个测试文件。
- `bun run lint`：退出码 0，0 error、15 warning；均在原有 PwaBits、Context 与 useDebateTimer 中，本次新增组件无警告。
- `bun run build`：退出码 0；Vite 构建和 PWA generateSW 完成。
- `git diff --check`：退出码 0。
- INDEX：修复原有 pairing-and-fixes 标题未闭合及阶段记录错位，恢复状态索引可解析；Bun.YAML 解析为 22 个模块，模块无缺失 stages，原模块完成状态保留。

StageIcon 使用模块级静态 JSX 图标元素和 cloneElement 透传属性，满足 React 静态组件规则，未禁用 lint 规则。
本次不新增镜像实现的单测文件；采用渲染输出检查验证静态图标选择。

## 激活链规则扫描

- ER-01–03：引擎文件未改动；Profile 绑定 debate-timer → react-vite-web 已读取，新增设计与报告归档在业务工作区。
- GR-01–02 / React R1：扫描激活规则；Lint、构建通过，项目为 JS，无独立 TypeScript typecheck。
- GR-03–04：无接口增改，API E2E 新增要求不适用；既有服务端和前端纯逻辑测试均通过。
- GR-05–06：核对前后端契约；不改变 stageId、计时模式、快照或服务调用，前后端对齐结论为无契约差异。
- React R2–R3：不引入接口地址、密钥或异步操作。
- React R4：SvgIcon 沿用 currentColor、st-marker 及既有明暗主题 CSS；无新增硬编码颜色。
- React R5：依赖和锁文件未改动。

## 验收范围

16 个预置环节映射和自定义环节模式回退已通过实际 SVG 渲染验证；current 条件渲染、节点按钮、文字、切换回调、只读属性及时间线共享结构经代码差异核查保留。
未执行浏览器截图或真机验收，不将浏览器布局与动画观感表述为已实测。

判定：PASS。Gate 1、前端阶段与 Gate 2 完成；后端阶段不适用。
