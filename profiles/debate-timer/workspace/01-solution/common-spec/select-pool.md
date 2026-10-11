# select-pool

前端选择项（下拉/单选）数据源池。由 /design（D4）维护。本项目无独立 options 接口，
选择项为静态配置或 i18n 文案。

| 选择项 | 数据源 | 使用方 | 选项 |
|--------|--------|--------|------|
| 阶段计时模式 | 静态 + i18n（`timerSetting.*`） | 设置页-阶段编辑（S-01-02） | 单计时 / 双计时 / 自由辩论（stageTimingMode） |
| 界面语言 | 静态（既有 `LanguageSwitcher`） | 全站头部 | 中文 / English / Français (CA) |
| 主题 | 系统/亮/暗（既有 `useColorMode`） | 全站头部 | 跟随系统 / 亮色 / 暗色 |
