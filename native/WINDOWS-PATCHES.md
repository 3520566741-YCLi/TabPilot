# Windows 适配补丁（我没改你们的文件，请按需合入）

已新增（不影响 Mac）：`native/voice-win.ps1`、`src/main/voice-win.ts`、`src/main/platform.ts`。tsc 通过。

## 主线程
1. `src/main/voice.ts`：
   - 顶部 `import { startVoiceWin, stopVoiceWin } from "./voice-win";`
   - `startVoice` 里把 `if (process.platform !== "darwin") return {...}` 替换为：
     `if (process.platform === "win32") return startVoiceWin(onEvent);` 再保留非 darwin 的报错。
   - `stopVoice` 开头加：`if (process.platform === "win32") return stopVoiceWin();`
2. `main.ts` 的 `setupMenus()`：用 `Menu.buildFromTemplate(appMenuTemplate())`（`import { appMenuTemplate } from "./platform"`），删掉内联模板。Windows 上 hide/hideOthers/unhide 角色无效。`app.setAboutPanelOptions` 保留。
3. `browser.ts:253`：`modifiers |= 4` 改为 `modifiers |= CMD_MODIFIER_BIT`（来自 platform.ts），这样 AI 写 cmd+a 在 Windows 上变成 Ctrl+A。
4. `prompt.ts:10`：“在 macOS 桌面软件里”改为按平台：`process.platform === "win32" ? "Windows" : "macOS"`；快捷键提示同理（Ctrl 而非 Cmd）。
5. `package.json`：
   - `scripts`: `"dist:win": "npm run build && electron-builder --win --x64 --arm64"`
   - 顶层 `extraResources`（含 voice-helper）移到 `mac.extraResources`，否则 Windows 构建会找不到 mac 二进制。
   - 新增：
     ```json
     "win": { "target": [{ "target": "nsis", "arch": ["x64", "arm64"] }], "icon": "build/icon.png", "signAndEditExecutable": false,
              "extraResources": [{ "from": "native/voice-win.ps1", "to": "voice-win.ps1" }] },
     "nsis": { "oneClick": false, "perMachine": false, "allowToChangeInstallationDirectory": true, "artifactName": "TabPilot-Setup-${version}-${arch}.${ext}" }
     ```
   - 注意 `signAndEditExecutable:false` 会让 exe 不写入图标/版本信息（在 Mac 上没有 wine 时只能这样）；有 wine 可去掉。
   - `afterPack.js` 已经只在 darwin 执行，无需改。

## UI 线程（renderer/）
1. `renderer.js:57` `basename`：`String(p).split("/").pop()` → `String(p).split(/[\\/]/).pop()`（Windows 路径是反斜杠）。
2. `renderer.js:512` 权限引导文案按平台：Windows 写“设置 > 隐私和安全性 > 麦克风，允许桌面应用使用麦克风；没有中文语音包可在 语言和区域 里安装，或按 Win+H 用系统听写”。可用 `navigator.userAgent.includes("Windows")` 判断。
3. `style.css:16` 字体栈加 Windows 字体：`--font: "Avenir Next", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei UI", "Microsoft YaHei", "Hiragino Sans GB", sans-serif;`
4. 顶部 `header`/`#tabbar` 使用 `-webkit-app-region: drag`，窗口是系统默认标题栏（没用 hiddenInset），所以 Windows 无红绿灯问题，无需改。
