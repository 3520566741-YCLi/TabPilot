// 平台差异：菜单、快捷键修饰键
import { app } from "electron";
import { L } from "./i18n";

export const isMac = process.platform === "darwin";
export const isWin = process.platform === "win32";

// 应用菜单模板：macOS 保留“应用名”菜单；Windows/Linux 用“文件”菜单（退出用 Alt+F4 / Ctrl+Q）
export function appMenuTemplate(): Electron.MenuItemConstructorOptions[] {
  const view: Electron.MenuItemConstructorOptions = {
    label: L("显示", "View"),
    submenu: [{ role: "reload", label: L("重新载入界面", "Reload Interface") }, { role: "toggleDevTools", label: L("开发者工具", "Developer Tools") }, { type: "separator" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }],
  };
  if (isMac) {
    return [
      {
        label: "TabPilot",
        submenu: [{ role: "about", label: L("关于 TabPilot", "About TabPilot") }, { type: "separator" }, { role: "hide", label: L("隐藏 TabPilot", "Hide TabPilot") }, { role: "hideOthers" }, { role: "unhide" }, { type: "separator" }, { role: "quit", label: L("退出 TabPilot", "Quit TabPilot") }],
      },
      { role: "editMenu" },
      view,
      { role: "windowMenu" },
    ];
  }
  return [
    { label: L("文件", "File"), submenu: [{ label: `TabPilot ${app.getVersion()}`, enabled: false }, { type: "separator" }, { role: "quit", label: L("退出 TabPilot", "Quit TabPilot") }] },
    { role: "editMenu" },
    view,
    { role: "windowMenu" },
  ];
}

// 给 CDP 键盘事件用：AI 写的 cmd/meta/command 在 Windows 上等价于 Ctrl（CDP modifiers：Alt=1 Ctrl=2 Meta=4 Shift=8）
export const CMD_MODIFIER_BIT = isMac ? 4 : 2;
