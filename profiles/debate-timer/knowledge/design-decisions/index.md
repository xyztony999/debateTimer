# 设计决策（源自 README）

| 决策 | 结论 | 理由 |
|------|------|------|
| D-1 构建 | CRA → Vite 迁移 | CRA 官方弃用 |
| D-2 工具链 | Bun（install/test/脚本） | 包管理+测试运行一体 |
| D-3 UI | MUI v9 + emotion | 组件体系 + 主题（含暗色） |
| D-4 i18n | i18next + 浏览器语言检测 | 多语言 |
| D-5 模板存储 | 自建 MongoDB API | 计时页/设置页同步；提供批量导入脚本 |
| D-6 部署 | GitHub Actions 构建 | master=主程序；deploy/production=封装静态版 |
