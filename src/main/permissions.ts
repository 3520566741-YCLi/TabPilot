// 本机权限清单：只列软件真正用到的。首次引导和设置页按这个清单逐项申请。
//
// macOS
//   consent      使用说明与数据去向（软件自己的同意项，不是系统权限）：截图、页面内容和数据摘要会发给你选的 AI 服务商
//   files        访问“桌面 / 下载 / 文稿”文件夹：读取你要上传或分析的数据文件，导出文件存到“下载/TabPilot”
//   keychain     钥匙串：加密保存 API Key 和 Tableau 登录（系统会弹一次“始终允许”）
//   voice        语音输入：麦克风 + 语音识别合成一项，点一次依次申请两个系统权限
// Windows
//   consent / voice（麦克风权限 + 对应语言的语音包）
//   Windows 读写用户文件夹和凭据保护不需要单独授权
import { app, safeStorage, shell, systemPreferences } from "electron";
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { L } from "./i18n";
import { defaultDocsDir, docsDir, docsDirReady, setDocsDir } from "./docsdir";
import { winSpeechStatus } from "./voice-win";

export type PermId = "consent" | "docs" | "files" | "keychain" | "voice";
export type PermStatus = "granted" | "denied" | "not-determined" | "unknown";

export interface PermItem {
  id: PermId;
  required: boolean;
  status: PermStatus;
  title: string;
  desc: string;
  canOpenSettings: boolean; // 被拒绝后能否一键打开系统设置对应页面
}

const CONSENT_VERSION = 1;
const consentFile = () => path.join(app.getPath("userData"), "consent.json");
const isMac = process.platform === "darwin";
const isWin = process.platform === "win32";

function consentStatus(): PermStatus {
  try {
    const c = JSON.parse(fs.readFileSync(consentFile(), "utf8"));
    return c && c.version >= CONSENT_VERSION ? "granted" : "not-determined";
  } catch {
    return "not-determined";
  }
}

// 读一下这几个文件夹：被拒绝会抛 EPERM；第一次读会触发系统询问。
// 用户还没点过“允许”时不去读，免得列清单时就弹系统框
const filesFlag = () => path.join(app.getPath("userData"), "perm-files.json");
function filesStatus(probe: boolean): PermStatus {
  if (!probe && !fs.existsSync(filesFlag())) return "not-determined";
  const dirs = ["Desktop", "Downloads", "Documents"].map((d) => path.join(os.homedir(), d));
  let denied = false;
  for (const d of dirs) {
    try {
      if (fs.existsSync(d)) fs.readdirSync(d);
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === "EPERM" || code === "EACCES") denied = true;
    }
  }
  if (probe) {
    try {
      fs.mkdirSync(path.dirname(filesFlag()), { recursive: true });
      fs.writeFileSync(filesFlag(), JSON.stringify({ at: Date.now() }), { mode: 0o600 });
    } catch {
      // 忽略
    }
  }
  return denied ? "denied" : "granted";
}

// macOS 上 isEncryptionAvailable 在第一次读钥匙串之前可能是 false，不能直接当“拒绝”。
// 点过“允许”并成功加解密后记一个标记；已经存过 Key 的老用户也算已授权
const keychainFlag = () => path.join(app.getPath("userData"), "perm-keychain.json");
function keychainStatus(): PermStatus {
  if (fs.existsSync(keychainFlag())) return "granted";
  try {
    const s = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "settings.json"), "utf8"));
    if (s?.keys && Object.values(s.keys).some((v) => typeof v === "string" && v.startsWith("enc:"))) return "granted";
  } catch {
    // 没有设置文件
  }
  return "not-determined";
}

// 两项都拿到才算完成；任何一项被拒就算拒绝（引导去系统设置）
function combineVoice(mic: PermStatus, speech: PermStatus): PermStatus {
  if (mic === "denied" || speech === "denied") return "denied";
  if ([mic, speech].every((x) => x === "granted" || x === "unknown") && (mic === "granted" || speech === "granted")) return "granted";
  return "not-determined";
}

function micStatus(): PermStatus {
  try {
    const s = systemPreferences.getMediaAccessStatus("microphone");
    if (s === "granted") return "granted";
    if (s === "denied" || s === "restricted") return "denied";
    if (s === "not-determined") return "not-determined";
  } catch {
    // 某些系统版本不支持
  }
  return "unknown";
}

// 语音识别权限只能由语音组件自己查询/申请（macOS）
function speechCheck(request: boolean): Promise<PermStatus> {
  if (isWin) return winSpeechStatus();
  if (!isMac) return Promise.resolve("unknown");
  const bin = [path.join(process.resourcesPath ?? "", "voice-helper"), path.join(__dirname, "../../native/build/voice-helper")].find((p) => fs.existsSync(p));
  if (!bin) return Promise.resolve("unknown");
  return new Promise((resolve) => {
    const child = spawn(bin, [request ? "--request-auth" : "--auth-status"], { stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    const t = setTimeout(() => child.kill(), request ? 60000 : 5000);
    child.on("exit", () => {
      clearTimeout(t);
      const m = out.match(/"auth"\s*:\s*"(\w+)"/);
      const v = m?.[1];
      resolve(v === "authorized" ? "granted" : v === "denied" || v === "restricted" ? "denied" : v === "notDetermined" ? "not-determined" : "unknown");
    });
    child.on("error", () => resolve("unknown"));
  });
}

export async function listPermissions(): Promise<PermItem[]> {
  const items: PermItem[] = [
    {
      id: "consent",
      required: true,
      status: consentStatus(),
      title: L("使用说明与数据去向", "How your data is used"),
      desc: L(
        "操作时会把右侧页面截图、页面文字和你提供的数据摘要发给你选择的模型服务商处理；API Key 和登录信息只保存在本机。发布或保存到 Tableau Public 的内容会公开，每次都会先问你。",
        "While working, screenshots and text of the Tableau page and summaries of your data are sent to the model provider you chose. Your API key and sign-in stay on this computer. Anything published to Tableau Public becomes public, and you are asked every time.",
      ),
      canOpenSettings: false,
    },
    {
      id: "docs",
      required: true,
      status: docsDirReady() ? "granted" : "not-determined",
      title: L("文档存放位置", "Where to keep your projects"),
      desc: L(
        `每个项目会在这里有一个文件夹，放用到的数据文件副本、建图步骤和导出的文件，草稿失效时靠它把图重新做出来。当前位置：${docsDir()}`,
        `Each project gets a folder here with copies of its data files, the chart-building steps and exports, so charts can be rebuilt if a draft expires. Current location: ${docsDir()}`,
      ),
      canOpenSettings: false,
    },
  ];
  if (isMac) {
    items.push(
      {
        id: "files",
        required: true,
        status: filesStatus(false),
        title: L("访问桌面、下载和文稿", "Desktop, Downloads and Documents"),
        desc: L("用来读取你要上传或分析的数据文件，导出的文件存到“下载/TabPilot”。", "Used to read the data files you upload or analyze. Exports are saved to Downloads/TabPilot."),
        canOpenSettings: true,
      },
      {
        id: "keychain",
        required: true,
        status: keychainStatus(),
        title: L("钥匙串", "Keychain"),
        desc: L("加密保存 API Key 和 Tableau 登录。系统弹窗时请选“始终允许”。", "Encrypts your API key and Tableau sign-in. When macOS asks, choose Always Allow."),
        canOpenSettings: false,
      },
    );
  }
  if (isWin) {
    // Windows 没有文件夹授权弹窗：只读你选择或拖进来的文件，导出到“下载\\TabPilot”。这里只做说明
    items.push({
      id: "files",
      required: false,
      status: "granted",
      title: L("文件访问", "File access"),
      desc: L(
        "Windows 不需要单独授权。只读取你选择或拖进来的数据文件，导出的文件存到“下载\\TabPilot”。如果开了“受控文件夹访问”，被拦截时请在 Windows 安全中心里允许 TabPilot。",
        "No separate permission is needed on Windows. Only files you pick or drop in are read; exports go to Downloads\\TabPilot. If Controlled folder access blocks it, allow TabPilot in Windows Security.",
      ),
      canOpenSettings: false,
    });
  }
  items.push({
    id: "voice",
    required: false,
    status: combineVoice(isMac || isWin ? micStatus() : "unknown", await speechCheck(false)),
    title: L("语音输入", "Voice input"),
    desc: isWin
      ? L("用麦克风说话，转成文字。还需要在“设置 > 时间和语言 > 语言和区域 > 对应语言 > 语言选项”里安装“语音”。不用语音可以不开。", "Speak instead of typing. Also install the Speech pack under Settings > Time & language > Language & region > (language) > Language options. Optional.")
      : L("用麦克风说话，在本机转成文字。会依次请求麦克风和语音识别两个系统权限。不用语音可以不开。", "Speak instead of typing, transcribed on this Mac. Asks for microphone and speech recognition. Optional."),
    canOpenSettings: isMac || isWin,
  });
  return items;
}

export async function requestPermission(id: PermId): Promise<PermStatus> {
  switch (id) {
    case "consent":
      fs.mkdirSync(path.dirname(consentFile()), { recursive: true });
      fs.writeFileSync(consentFile(), JSON.stringify({ version: CONSENT_VERSION, at: Date.now() }), { mode: 0o600 });
      return "granted";
    case "docs":
      // “允许”= 用当前位置（没选过就是 文稿/TabPilot）；换位置走 docs:choose
      return setDocsDir(docsDirReady() ? docsDir() : defaultDocsDir()).ok ? "granted" : "denied";
    case "files":
      return filesStatus(true);
    case "keychain":
      // 加解密一次，触发系统钥匙串授权
      try {
        safeStorage.decryptString(safeStorage.encryptString("tabpilot"));
        fs.mkdirSync(path.dirname(keychainFlag()), { recursive: true });
        fs.writeFileSync(keychainFlag(), JSON.stringify({ at: Date.now() }), { mode: 0o600 });
        return "granted";
      } catch {
        return "denied";
      }
    case "voice": {
      let mic = micStatus();
      if (isMac && mic !== "granted") {
        try {
          mic = (await systemPreferences.askForMediaAccess("microphone")) ? "granted" : "denied";
        } catch {
          mic = micStatus();
        }
      }
      if (mic === "denied") return "denied";
      return combineVoice(mic, await speechCheck(true));
    }
  }
}

export function revokeConsent() {
  try {
    fs.rmSync(consentFile(), { force: true });
  } catch {
    // 忽略
  }
}

// 打开系统设置里对应的隐私页面
export async function openPermissionSettings(id: PermId) {
  const mac: Partial<Record<PermId, string>> = {
    files: "x-apple.systempreferences:com.apple.preference.security?Privacy_FilesAndFolders",
  };
  let url = isMac ? mac[id] : undefined;
  if (id === "voice") {
    // 先打开被拒的那一项：麦克风优先
    const micDenied = micStatus() === "denied";
    if (isMac) url = micDenied ? "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone" : "x-apple.systempreferences:com.apple.preference.security?Privacy_SpeechRecognition";
    else if (isWin) url = micDenied ? "ms-settings:privacy-microphone" : "ms-settings:regionlanguage";
  }
  if (url) void shell.openExternal(url);
}

// 只看必需项（不去启动语音组件），发消息前也会调用
export async function allRequiredGranted(): Promise<boolean> {
  if (consentStatus() !== "granted") return false;
  if (!docsDirReady()) return false;
  if (isMac && (filesStatus(false) !== "granted" || keychainStatus() !== "granted")) return false;
  return true;
}
