// 语音输入：调用 native/voice-helper（SFSpeechRecognizer），逐行读取 JSON 事件
import { spawn, ChildProcess } from "child_process";
import { L, lang } from "./i18n";
import path from "path";
import fs from "fs";
import readline from "readline";
import { startVoiceWin, stopVoiceWin } from "./voice-win";

export type VoiceEvent = { type: "partial" | "final" | "end" | "error"; text: string };

let proc: ChildProcess | null = null;

function helperPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath ?? "", "voice-helper"),
    path.join(__dirname, "../../native/build/voice-helper"),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export async function startVoice(onEvent: (ev: VoiceEvent) => void): Promise<{ error?: string }> {
  if (proc) return { error: L("正在听写", "Already listening") };
  if (process.platform === "win32") return startVoiceWin(onEvent);
  if (process.platform !== "darwin") return { error: L("语音输入暂不支持此系统", "Voice input isn't supported on this system") };
  const bin = helperPath();
  if (!bin) return { error: L("找不到语音组件（运行 swiftc 编译 native/voice-helper.swift 到 native/build/voice-helper）", "Voice component not found (build native/voice-helper.swift into native/build/voice-helper)") };
  const child = spawn(bin, [lang() === "en" ? "en-US" : "zh-CN"], { stdio: ["pipe", "pipe", "ignore"] });
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
      if (ev.type === "partial") onEvent(ev);
      else if (ev.type === "final") onEvent(ev);
      else if (ev.type === "error") done(/No speech detected/i.test(ev.text) ? { type: "error", text: L("没有听到声音，请靠近麦克风再说一次。", "No speech detected. Move closer to the microphone and try again.") } : ev);
      else if (ev.type === "end") done(ev);
    } catch {
      // 忽略非 JSON 行
    }
  });
  child.on("error", (e) => done({ type: "error", text: L(`语音组件无法启动：${e.message}`, `Voice input couldn't start: ${e.message}`) }));
  child.on("exit", () => done({ type: "end", text: "" }));
  return {};
}

export function stopVoice(): void {
  if (process.platform === "win32") return stopVoiceWin();
  if (!proc) return;
  try {
    proc.stdin?.write("stop\n");
  } catch {
    proc.kill("SIGTERM");
  }
}


// 用用户自己的 AI 提供方做语音转文字（目前只有 OpenAI 提供标准的 /audio/transcriptions 接口）
export async function transcribeWithProvider(provider: string, apiKey: string, audioBase64: string, mimeType: string): Promise<{ text?: string; error?: string }> {
  if (provider !== "openai") return { error: "当前 AI 提供方没有语音转文字接口，请改用本机识别。" };
  try {
    const buf = Buffer.from(audioBase64, "base64");
    if (buf.length > 24 * 1024 * 1024) return { error: "录音太长了，请分几段说。" };
    const ext = /mp4|m4a/.test(mimeType) ? "m4a" : /ogg/.test(mimeType) ? "ogg" : /wav/.test(mimeType) ? "wav" : "webm";
    const form = new FormData();
    form.append("file", new Blob([buf], { type: mimeType || "audio/webm" }), `voice.${ext}`);
    form.append("model", "gpt-4o-mini-transcribe");
    form.append("language", "zh");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60000),
    });
    if (res.status === 401) return { error: "OpenAI API Key 无效。" };
    if (!res.ok) return { error: `语音识别失败（${res.status}），可以改用本机识别。` };
    const data: any = await res.json();
    return { text: String(data?.text ?? "") };
  } catch {
    return { error: "语音识别请求失败，请检查网络，或改用本机识别。" };
  }
}

export const PROVIDERS_WITH_STT = ["openai"];
