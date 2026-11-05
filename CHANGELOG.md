# 更新记录 / Changelog

本项目的所有重要变更都记录在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- 修订号（第三位，0.1.**x**）：修复问题、小改动；
- 次版本号（第二位，0.**x**.0）：较大的更新、新功能；
- 主版本号（第一位，**x**.0.0）：大版本，可能有不兼容的变化。

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-05

### 新增 / Added

- 保存：一键发布到你自己的 Tableau Public 并设为不在个人主页显示，之后再保存覆盖同一个作品；重新打开项目直接进入已保存的作品继续编辑；可选下载 .twbx 到项目文件夹。
  Save: publish to your own Tableau Public in one click, hidden from your profile; later saves overwrite the same workbook, reopening a project goes straight back to editing it, and you can optionally download a .twbx into the project folder.
- 项目文件夹：在首次引导或设置里选择存放位置，每个项目保存数据副本、建图步骤和导出文件。
  Project folders: choose a location during setup or in Settings; each project keeps data copies, chart steps and exports.
- “教我做”改为一步一步带你自己动手：高亮位置、讲清原因、做完自动检查；可以“慢一点”“这步帮我做”“剩下的直接做”。
  Teach-me mode now has you do each step yourself: it highlights where to click, explains why and checks your work; ask it to slow down, do a step for you, or finish the rest.
- 问“能做什么图”时先看右侧：没有数据先建议上传，有数据给出可多选的图表卡片，选好再做。
  Asking "what charts can I make?" now checks the page first: it suggests uploading data if there is none, otherwise offers chart cards to pick from.
- 项目主页：最近 7 天的项目、收藏、归档（不会自动删除）、复制、右键改名。
  Project home: projects from the last 7 days, favorites, archive (never auto-deleted), duplicate and rename.
- 运行中可以插话引导或排队；回到主页时任务在后台继续；退出或关闭项目前提醒未保存的改动；旧草稿失效时可以按记录重做。
  Steer or queue messages while a task runs; tasks keep running in the background from the home page; reminders about unsaved changes before quitting or closing; expired drafts can be rebuilt from recorded steps.
- 首次使用的权限引导：数据去向说明、文档位置、文件夹访问、钥匙串、语音输入。
  First-run permissions guide: how data is used, project folder, folder access, Keychain and voice input.

### 变更 / Changed

- 执行过程每一步显示一句易懂的说明；截图时右侧画面不再闪烁。
  Each step is described in plain language; taking screenshots no longer makes the Tableau pane flicker.
- 应用内部名称、数据目录和钥匙串条目统一为 TabPilot。0.1.0 的“Tableau AI”数据不会迁移，需要重新填写密钥、重新登录 Tableau。
  The internal name, data folder and Keychain entry are now TabPilot. Data from 0.1.0 ("Tableau AI") is not migrated: enter your key and sign in to Tableau again.
- 安装包文件名按芯片区分（mac-apple-silicon / mac-intel / windows-x64 / windows-arm64）。
  Installer names now say which chip they are for.

### 修复 / Fixed

- 项目编号严格校验，避免误删全部项目资料；按记录重建只重放建图步骤。
  Strict project ID checks prevent deleting all project data by mistake; rebuilding only replays chart-building steps.
- 设置接口不能再绕过保存前的同意步骤。
  The settings interface can no longer skip the consent step before saving.
- 主页打开项目卡住、确认框被右侧网页挡住、只有一个项目时无法关闭、发布按钮被提示条挡住等问题。
  Fixed projects hanging when opened from home, dialogs hidden behind the web page, being unable to close the only project, and the publish button being covered by a banner.

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

[Unreleased]: https://github.com/3520566741-YCLi/TabPilot/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/3520566741-YCLi/TabPilot/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/3520566741-YCLi/TabPilot/releases/tag/v0.1.0
