# 安全策略 / Security Policy

## 支持的版本 / Supported versions

只有最新发布的版本会收到安全修复。Only the latest release receives security fixes.

| 版本 Version | 支持 Supported |
|---|---|
| 0.2.x | ✅ |
| 0.1.x | ❌ |

## 报告漏洞 / Reporting a vulnerability

请不要在公开的 issue 里报告安全问题。请使用 GitHub 的 [私密漏洞报告](../../security/advisories/new)（仓库的 Security 页面 → Report a vulnerability），写清：

- 受影响的版本和系统；
- 问题是什么、可能造成什么影响；
- 重现步骤或概念验证。

我们会尽快确认收到，并在修复发布后致谢（如果你愿意署名）。

Please do not report security issues in public issues. Use GitHub's [private vulnerability reporting](../../security/advisories/new) (Security tab → Report a vulnerability) and include the affected version and OS, the impact, and steps to reproduce. We will acknowledge your report as soon as we can and credit you after the fix ships if you wish.

## 设计上的安全边界 / Security model

- 模型服务商的密钥用系统加密存储（macOS 钥匙串 / Windows 账户加密），只保存在本机。
  Provider keys are encrypted with the OS (macOS Keychain / Windows account) and stored only locally.
- 软件只向 Tableau Public 和用户选择的模型服务商发送请求，没有遥测。
  The app only talks to Tableau Public and the provider the user chooses; there is no telemetry.
- 发布到 Tableau Public 等公开操作需要用户确认；“保存”在用户第一次同意后，之后只覆盖同一个作品。软件不代填 Tableau 密码。
  Public actions such as publishing to Tableau Public require user confirmation; after the user agrees once, Save only overwrites the same workbook. The app never fills in Tableau passwords.
- 调试接口默认关闭，只有设置环境变量 `TABLEAU_AI_DEBUG_PORT` 时才会在 127.0.0.1 上开启，请不要在日常使用时开启。
  The debug endpoint is off by default and only listens on 127.0.0.1 when `TABLEAU_AI_DEBUG_PORT` is set; do not enable it for everyday use.

特别欢迎这些方面的报告：密钥泄露、未经确认的公开发布、页面内容诱导软件执行越权操作（提示注入）、本机文件被越界读取。
Reports we especially welcome: key leakage, publishing without confirmation, page content tricking the app into unintended actions (prompt injection), and reading local files beyond what the user asked for.
