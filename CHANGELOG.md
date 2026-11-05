# 更新记录 / Changelog

本项目的所有重要变更都记录在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- 修订号（第三位，0.1.**x**）：修复问题、小改动；
- 次版本号（第二位，0.**x**.0）：较大的更新、新功能；
- 主版本号（第一位，**x**.0.0）：大版本，可能有不兼容的变化。

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-04

首个公开版本。First public release.

### 新增 / Added

- 左侧对话、右侧 Tableau Public 网页版的双栏界面，用真实鼠标和键盘建图。
  Two-pane window: chat on the left, Tableau Public web app on the right, charts built with real mouse and keyboard input.
- “教我做”模式：边做边讲每一步的手动操作方法。
  Teach-me mode that explains how to do each step by hand.
- 新建 Web 制作工作簿、上传本地 Excel / CSV、键入表达式和拖拽字段、切换标记类型、工作表管理。
  Create Web Authoring workbooks, upload local Excel / CSV, type expressions and drag fields, change mark types, manage sheets.
- 导出 PNG / PDF / Excel / PowerPoint，保存到“下载/TabPilot”。
  Export to PNG / PDF / Excel / PowerPoint into Downloads/TabPilot.
- 读取 .twb / .twbx 并逐张复刻图表。
  Read .twb / .twbx files and recreate their charts one by one.
- 多项目标签、协作光标、主动改进建议、确认卡与撤销。
  Project tabs, on-screen collaboration cursor, improvement suggestions, confirmation cards and undo.
- 支持 10 家模型服务商，首次使用时检测密钥并推荐模型。
  Ten model providers, with key testing and model recommendation on first run.
- 本机语音输入（macOS 语音识别 / Windows 语音识别）。
  On-device voice input (macOS and Windows speech recognition).
- 中文 / 英文界面，浅色 / 深色主题。
  Chinese / English UI, light / dark theme.
- 登录与注册的实时引导；启动时提示清理旧版本（移到废纸篓，不动设置和登录）。
  Live sign-in / sign-up guidance; offers to move old copies of the app to the Trash on launch without touching settings or sign-in.
- Mac（Apple 芯片、英特尔）和 Windows（x64、Arm64）安装包。
  Installers for Mac (Apple silicon, Intel) and Windows (x64, Arm64).

[Unreleased]: https://github.com/3520566741-YCLi/TabPilot/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/3520566741-YCLi/TabPilot/releases/tag/v0.1.0
