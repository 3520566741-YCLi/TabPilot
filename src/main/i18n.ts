// 主进程里直接给用户看的文字（菜单、对话框、改动说明、确认框、错误）跟随界面语言。
// 给 AI 看的工具结果保持中文即可，AI 会按用户语言回复。
import { app } from "electron";

export type Lang = "zh" | "en";
let current: Lang | null = null;

export function setLang(pref: string | undefined, uiLang?: string) {
  if (uiLang === "zh" || uiLang === "en") current = uiLang;
  else if (pref === "zh" || pref === "en") current = pref;
  else current = null;
}

export function lang(): Lang {
  if (current) return current;
  try {
    return /^zh/i.test(app.getLocale()) ? "zh" : "en";
  } catch {
    return "zh";
  }
}

// L("中文", "English")
export const L = (zh: string, en: string) => (lang() === "en" ? en : zh);
