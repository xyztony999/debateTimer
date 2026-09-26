# 辩论赛计时器知识注入

按**渥太华大学华语辩论社（UOMDC）比赛规则**制定的辩论计时器。React 19 + Vite + MUI SPA，
Bun 作包管理与脚本运行，GitHub Actions 自动构建部署。

已交付能力：阶段切换（下拉/←→ 快捷键）、阶段自定义（增删改/时长/单双计时/拖拽排序）、
模板体系（新建/切换/保存/删除，默认模板不可删）、黑暗主题（跟随系统+手动记忆）、多语言（i18next）。
模板数据存自建 MongoDB API，计时页与设置页同步；server/scripts/import-configurations.js 支持批量导入。
