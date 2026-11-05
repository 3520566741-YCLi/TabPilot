# 参与贡献 / Contributing

感谢你愿意帮忙改进 TabPilot！English version below.

## 提问题

- **报告问题**：用 [问题反馈](../../issues/new?template=bug_report.yml) 模板，写清系统、版本号、怎么重现，附截图更好。截图前请遮住密钥、账号和你不想公开的数据。
- **提建议**：用 [功能建议](../../issues/new?template=feature_request.yml) 模板，说说你想解决什么问题。
- **安全问题**：请不要公开提 issue，按 [SECURITY.md](SECURITY.md) 私下报告。

## 提交代码

1. Fork 本仓库，从 `main` 新建分支，例如 `fix/export-pdf`。
2. 本地运行：
   ```bash
   npm install
   npm run build:native   # 仅 Mac
   npm start
   ```
3. 提交前至少确认 `npm run build` 能通过，并在真实的 Tableau Public 页面上手动试过你改动的功能。
4. 一个 pull request 只做一件事，在描述里写清改了什么、为什么改、怎么验证的。界面有变化请附截图。

### 代码约定

- 主进程是 TypeScript（`src/main/`），界面是原生 HTML / CSS / JS（`renderer/`），模块接口约定写在 `src/shared/CONTRACTS.md`，改接口时同步更新。
- 界面文字放在 `renderer/i18n.js` 和 `src/main/i18n.ts`，中英文都要写。
- 新增第三方资源请优先选 MIT / BSD / Apache-2.0 许可，固定版本，并登记到 `THIRD_PARTY_NOTICES.md`。
- 不要提交密钥、个人数据文件或工作簿。

## 版本号

遵循 [语义化版本](https://semver.org/lang/zh-CN/)：修复和小改动升第三位，较大的更新升第二位，大版本升第一位。合并后的变更记到 `CHANGELOG.md` 的 `[Unreleased]` 下面。

提交的代码默认按本项目的 [MIT 许可证](LICENSE) 发布。

---

## Contributing (English)

Thanks for helping improve TabPilot!

- **Bugs**: use the [bug report](../../issues/new?template=bug_report.yml) template with your OS, app version, steps to reproduce and screenshots. Hide keys, account details and private data before sharing.
- **Ideas**: use the [feature request](../../issues/new?template=feature_request.yml) template and describe the problem you want solved.
- **Security issues**: do not open a public issue; follow [SECURITY.md](SECURITY.md).

**Pull requests**: fork, branch from `main`, run `npm install && npm start` (plus `npm run build:native` on macOS), make sure `npm run build` passes and that you tried the change against the real Tableau Public page. Keep one change per pull request, explain what and why, and attach screenshots for UI changes. Main-process code lives in `src/main/` (TypeScript), the UI in `renderer/`, and module contracts in `src/shared/CONTRACTS.md`. Add UI strings in both Chinese and English. Prefer MIT / BSD / Apache-2.0 dependencies, pin versions and list them in `THIRD_PARTY_NOTICES.md`. Never commit keys, personal data files or workbooks.

Versions follow [Semantic Versioning](https://semver.org/); add your change under `[Unreleased]` in `CHANGELOG.md`. Contributions are released under the project's [MIT License](LICENSE).
