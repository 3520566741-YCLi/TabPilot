// Windows 语音输入：调用 native/voice-win.ps1（System.Speech 本机识别），协议同 voice.ts 的 macOS 版本
import { spawn, ChildProcess } from "child_process";
import { L, lang } from "./i18n";
import path from "path";
import fs from "fs";
import readline from "readline";
import type { VoiceEvent } from "./voice";

let proc: ChildProcess | null = null;

function scriptPath(): string | null {
  const candidates = [path.join(process.resourcesPath ?? "", "voice-win.ps1"), path.join(__dirname, "../../native/voice-win.ps1")];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function startVoiceWin(onEvent: (ev: VoiceEvent) => void): { error?: string } {
  if (proc) return { error: L("正在听写", "Already listening") };
  const script = scriptPath();
  if (!script) return { error: L("找不到语音组件（native/voice-win.ps1），可以在输入框里按 Win+H 使用系统听写。", "Voice component not found (native/voice-win.ps1). You can press Win+H in the input box to use Windows dictation.") };
  const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", script, lang() === "en" ? "en-US" : "zh-CN"], { stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
  proc = child;
  let ended = false;
  const done = (ev: VoiceEvent) => {
    if (ended) return;
    ended = true;
    if (proc === child) proc = null;
    onEvent(ev);
  };
  readline.createInterface({ input: child.stdout! }).on("line", (line) => {
    try {
      const ev = JSON.parse(line) as VoiceEvent;
      if (ev.type === "partial" || ev.type === "final") onEvent(ev);
      else if (ev.type === "error") done(/No speech detected/i.test(ev.text) ? { type: "error", text: L("没有听到声音，请靠近麦克风再说一次。", "No speech detected. Move closer to the microphone and try again.") } : ev);
      else if (ev.type === "end") done(ev);
    } catch {
      // 忽略非 JSON 行
    }
  });
  child.on("error", (e) => done({ type: "error", text: L(`语音组件无法启动：${e.message}。可以按 Win+H 使用系统听写。`, `Voice input couldn't start: ${e.message}. Press Win+H to use Windows dictation.`) }));
  child.on("exit", () => done({ type: "end", text: "" }));
  return {};
}

export function stopVoiceWin(): void {
  if (!proc) return;
  try {
    proc.stdin?.write("stop\n");
  } catch {
    proc.kill();
  }
}

// 当前界面语言对应的 Windows 语音识别器是否已安装（供权限页的“语音识别”项使用）。
// 已安装 granted；没装 denied（引导去“语言和区域”安装语音包）；查询失败 unknown（按可用处理）
export function winSpeechStatus(): Promise<"granted" | "denied" | "unknown"> {
  const want = lang() === "en" ? "en" : "zh";
  return new Promise((resolve) => {
    let out = "";
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", "Add-Type -AssemblyName System.Speech; [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers() | ForEach-Object { $_.Culture.Name }"],
      { stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
    );
    const t = setTimeout(() => child.kill(), 10000);
    child.stdout!.on("data", (d) => (out += d));
    child.on("error", () => resolve("unknown"));
    child.on("exit", (code) => {
      clearTimeout(t);
      if (code !== 0) return resolve("unknown");
      const names = out.split(/\r?\n/).map((s) => s.trim().toLowerCase()).filter(Boolean);
      resolve(names.some((n) => n.startsWith(want)) ? "granted" : "denied");
    });
  });
}
