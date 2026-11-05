// 本地设置：API Key 用 safeStorage 加密后保存在 userData 里，不写日志
import { app, safeStorage } from "electron";
import fs from "fs";
import path from "path";

export type ProviderId = "claude" | "openai" | "gemini" | "qwen" | "zhipu" | "moonshot" | "doubao" | "xai" | "mistral" | "deepseek";
export const PROVIDER_IDS: ProviderId[] = ["claude", "openai", "gemini", "qwen", "zhipu", "moonshot", "doubao", "xai", "mistral", "deepseek"];
export type KeyId = ProviderId | "jev";

export interface Settings {
  provider: ProviderId;
  claudeModel: string;
  deepseekModel: string;
  splitLeft: number;
  theme: "system" | "light" | "dark";
  suggestions: boolean;
  jevVerify: boolean;
  models: Partial<Record<ProviderId, string>>; // 每个提供方选中的模型
  voiceEngine: "auto" | "local"; // auto：提供方有语音接口就用提供方，否则用本机识别
  ignoreOldCopies: boolean; // 不再提醒删除旧版本
  language: "system" | "zh" | "en"; // 界面语言偏好
  uiLang: "zh" | "en" | ""; // 实际生效的界面语言（渲染进程按系统语言算好后传来）
  autoRunSafePlans: boolean; // 不含危险步骤的多步方案直接执行，不再确认
  sendWhileRunning: "queue" | "steer"; // 任务进行中发消息：排队等这一轮结束，或作为引导立即并入
  docsDir: string; // 文档存放位置（每个项目一个文件夹）；空 = 默认 文稿/TabPilot
  docsDirChosen: boolean; // 用户在引导或设置里确认过存放位置
  publishConsent: boolean; // 用户已看过并同意“保存 = 发布到 Tableau Public（不在主页显示，但有链接的人能看到）”
}

interface Stored extends Settings {
  keys: Partial<Record<KeyId, string>>; // 加密后的 base64
}

const DEFAULTS: Stored = {
  provider: "claude",
  claudeModel: "claude-opus-5-5",
  deepseekModel: "deepseek-chat",
  splitLeft: 420,
  theme: "system",
  suggestions: true,
  jevVerify: false,
  models: {},
  voiceEngine: "local",
  ignoreOldCopies: false,
  language: "system",
  uiLang: "",
  autoRunSafePlans: true,
  sendWhileRunning: "queue",
  docsDir: "",
  docsDirChosen: false,
  publishConsent: false,
  keys: {},
};

const file = () => path.join(app.getPath("userData"), "settings.json");

// 逐项校验并归一化：设置文件可能被改坏，也可能收到类型不对的更新，任何一项不合法都退回默认值
function normalize(raw: unknown): Stored {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, d: string, max = 200) => (typeof v === "string" && v.length <= max ? v : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : d);
  const models: Partial<Record<ProviderId, string>> = {};
  if (r.models && typeof r.models === "object") {
    for (const p of PROVIDER_IDS) {
      const m = (r.models as Record<string, unknown>)[p];
      if (typeof m === "string" && m.length > 0 && m.length <= 200) models[p] = m;
    }
  }
  const keys: Partial<Record<KeyId, string>> = {};
  if (r.keys && typeof r.keys === "object") {
    for (const k of [...PROVIDER_IDS, "jev"] as KeyId[]) {
      const v = (r.keys as Record<string, unknown>)[k];
      if (typeof v === "string" && v.startsWith("enc:")) keys[k] = v;
    }
  }
  const split = typeof r.splitLeft === "number" && Number.isFinite(r.splitLeft) ? Math.round(Math.min(2000, Math.max(300, r.splitLeft))) : DEFAULTS.splitLeft;
  return {
    provider: oneOf(r.provider, PROVIDER_IDS, DEFAULTS.provider),
    claudeModel: str(r.claudeModel, DEFAULTS.claudeModel),
    deepseekModel: str(r.deepseekModel, DEFAULTS.deepseekModel),
    splitLeft: split,
    theme: oneOf(r.theme, ["system", "light", "dark"] as const, "system"),
    suggestions: bool(r.suggestions, DEFAULTS.suggestions),
    jevVerify: bool(r.jevVerify, DEFAULTS.jevVerify),
    models,
    voiceEngine: oneOf(r.voiceEngine, ["auto", "local"] as const, "local"),
    ignoreOldCopies: bool(r.ignoreOldCopies, false),
    language: oneOf(r.language, ["system", "zh", "en"] as const, "system"),
    uiLang: oneOf(r.uiLang, ["zh", "en", ""] as const, ""),
    autoRunSafePlans: bool(r.autoRunSafePlans, true),
    sendWhileRunning: oneOf(r.sendWhileRunning, ["queue", "steer"] as const, "queue"),
    docsDir: str(r.docsDir, "", 500),
    docsDirChosen: bool(r.docsDirChosen, false),
    publishConsent: bool(r.publishConsent, false),
    keys,
  };
}

function load(): Stored {
  try {
    return normalize(JSON.parse(fs.readFileSync(file(), "utf8")));
  } catch {
    return normalize({});
  }
}

function save(s: Stored) {
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(s, null, 2), { mode: 0o600 });
}

export function modelFor(s: Settings, p: ProviderId): string {
  if (p === "claude") return s.models.claude || s.claudeModel || "claude-opus-5-5";
  if (p === "deepseek") return s.models.deepseek || s.deepseekModel || "deepseek-chat";
  return s.models[p] || "";
}

export function getSettings(): Settings & { hasKey: Record<KeyId, boolean> } {
  const s = load();
  const hasKey = { jev: !!s.keys.jev } as Record<KeyId, boolean>;
  for (const p of PROVIDER_IDS) hasKey[p] = !!s.keys[p];
  return {
    provider: s.provider,
    claudeModel: s.claudeModel,
    deepseekModel: s.deepseekModel,
    splitLeft: s.splitLeft,
    theme: s.theme,
    suggestions: s.suggestions,
    jevVerify: s.jevVerify,
    models: { ...s.models, claude: modelFor(s, "claude"), deepseek: modelFor(s, "deepseek") },
    voiceEngine: s.voiceEngine,
    ignoreOldCopies: s.ignoreOldCopies,
    language: s.language,
    uiLang: s.uiLang,
    autoRunSafePlans: s.autoRunSafePlans,
    sendWhileRunning: s.sendWhileRunning,
    docsDir: s.docsDir,
    docsDirChosen: s.docsDirChosen,
    publishConsent: s.publishConsent,
    hasKey,
  };
}

const ALLOWED: (keyof Settings)[] = ["provider", "claudeModel", "deepseekModel", "splitLeft", "theme", "suggestions", "jevVerify", "models", "voiceEngine", "ignoreOldCopies", "language", "uiLang", "autoRunSafePlans", "sendWhileRunning"];
// docsDir / docsDirChosen 只能通过 docs:choose / permissions.request("docs") 改（会校验路径）
const INTERNAL: (keyof Settings)[] = ["docsDir", "docsDirChosen", "publishConsent"];

// internal=true 只给主进程自己用（docs:choose 校验过的路径、用户在保存说明卡里点了同意）；
// 渲染进程经 settings:update 传来的改动只放行 ALLOWED 里的键
export function updateSettings(patch: Partial<Settings>, internal = false) {
  const s = load();
  if (!patch || typeof patch !== "object") return;
  const merged: Record<string, unknown> = { ...s };
  for (const k of internal ? [...ALLOWED, ...INTERNAL] : ALLOWED) if (k in patch) merged[k] = (patch as Record<string, unknown>)[k];
  // models 是合并而不是替换；旧的 claudeModel / deepseekModel 字段同步写进 models
  const pm = (patch as Record<string, unknown>).models;
  merged.models = { ...s.models, ...(pm && typeof pm === "object" ? pm : {}) };
  if (typeof patch.claudeModel === "string") (merged.models as Record<string, unknown>).claude = patch.claudeModel;
  if (typeof patch.deepseekModel === "string") (merged.models as Record<string, unknown>).deepseek = patch.deepseekModel;
  merged.keys = s.keys;
  save(normalize(merged));
}

export function setApiKey(provider: KeyId, key: string) {
  const s = load();
  if (!key) delete s.keys[provider];
  else if (safeStorage.isEncryptionAvailable()) s.keys[provider] = "enc:" + safeStorage.encryptString(key).toString("base64");
  else throw new Error("系统加密不可用，无法安全保存 API Key");
  save(s);
}

// 解密结果只在内存里缓存，避免每次调用都去读钥匙串（每次读都可能触发系统授权框）
const keyCache = new Map<string, string>();

export function getApiKey(provider: KeyId): string | null {
  // 开发自测时设置 TABLEAU_AI_NO_KEYS=1，避免未签名的开发版去读钥匙串而弹授权框
  if (process.env.TABLEAU_AI_NO_KEYS) return null;
  const v = load().keys[provider];
  if (!v || !v.startsWith("enc:")) return null;
  const hit = keyCache.get(v);
  if (hit !== undefined) return hit;
  try {
    const plain = safeStorage.decryptString(Buffer.from(v.slice(4), "base64"));
    keyCache.set(v, plain);
    return plain;
  } catch {
    // 用户在钥匙串弹窗里点了“拒绝”，或系统加密不可用
    return null;
  }
}
