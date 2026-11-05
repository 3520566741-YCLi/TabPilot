// 每个项目在本地保存的资料（都在 userData/projects/<id>/ 下）：
// chat.json    左侧聊天记录（用户消息和 AI 事件，用于重新打开时还原界面）
// agent.json   AI 的对话上下文（重新打开后能接着聊）
// recipe.json  建图步骤（Tableau 草稿失效时可以按步骤重建）
// thumb.jpg    右侧画面缩略图（主页卡片）
import fs from "fs";
import path from "path";
import { isProjectId, projectDir } from "./projects";
import { RECIPE_TOOLS } from "./tools";

const MAX_EVENTS = 3000;
const SAVE_DELAY = 800;

function ensureDir(id: string) {
  const d = projectDir(id);
  fs.mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
}

function readJSON<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(file: string, data: unknown) {
  // 先写临时文件再改名，避免写到一半断电留下坏文件
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// ---------- 聊天记录 ----------
const chatCache = new Map<string, unknown[]>();
const chatTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function loadChat(id: string): unknown[] {
  if (!isProjectId(id)) return [];
  if (!chatCache.has(id)) chatCache.set(id, readJSON<unknown[]>(path.join(projectDir(id), "chat.json"), []));
  return chatCache.get(id)!;
}

// 记录一条事件；流式文字合并成一条，截图不保存（只留文字），避免文件过大
export function appendChat(id: string, ev: any) {
  if (!isProjectId(id) || !ev || typeof ev !== "object") return;
  const list = loadChat(id);
  const last: any = list[list.length - 1];
  if ((ev.type === "text" || ev.type === "thinking") && last && last.type === ev.type) {
    last.delta = String(last.delta ?? "") + String(ev.delta ?? "");
  } else if (ev.type === "tool_result" && ev.image) {
    list.push({ ...ev, image: undefined, hadImage: true });
  } else if (ev.type !== "status" && ev.type !== "usage") {
    list.push({ ...ev, at: Date.now() });
  }
  if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
  scheduleChatSave(id);
}

function scheduleChatSave(id: string) {
  clearTimeout(chatTimers.get(id));
  chatTimers.set(
    id,
    setTimeout(() => {
      try {
        writeJSON(path.join(ensureDir(id), "chat.json"), chatCache.get(id) ?? []);
      } catch {
        // 写盘失败不影响使用
      }
    }, SAVE_DELAY),
  );
}

export function flushAll() {
  for (const [id, t] of chatTimers) {
    clearTimeout(t);
    try {
      writeJSON(path.join(ensureDir(id), "chat.json"), chatCache.get(id) ?? []);
    } catch {
      // 忽略
    }
  }
  chatTimers.clear();
}

export function clearChat(id: string) {
  chatCache.set(id, []);
  scheduleChatSave(id);
}

// ---------- AI 上下文 ----------
export function saveAgentHistory(id: string, data: unknown) {
  try {
    writeJSON(path.join(ensureDir(id), "agent.json"), data);
  } catch {
    // 忽略
  }
}

export function loadAgentHistory(id: string): unknown {
  if (!isProjectId(id)) return null;
  return readJSON<unknown>(path.join(projectDir(id), "agent.json"), null);
}

// ---------- 建图步骤 ----------
export interface RecipeStep {
  name: string;
  input: unknown;
}

export function loadRecipe(id: string): RecipeStep[] {
  if (!isProjectId(id)) return [];
  const r = readJSON<RecipeStep[]>(path.join(projectDir(id), "recipe.json"), []);
  // 只重放能改动图表的那几种操作；文件被改过也不会借重建去调用别的工具
  return Array.isArray(r) ? r.filter((x) => x && typeof x.name === "string" && RECIPE_TOOLS.has(x.name)) : [];
}

export function appendRecipe(id: string, step: RecipeStep): number {
  const r = loadRecipe(id);
  // 新建工作簿意味着从头开始：之前的步骤属于旧草稿，清掉
  if (step.name === "open_web_authoring") r.length = 0;
  r.push(step);
  try {
    writeJSON(path.join(ensureDir(id), "recipe.json"), r.slice(-500));
  } catch {
    // 忽略
  }
  return r.length;
}

// ---------- 缩略图 ----------
export function saveThumb(id: string, jpeg: Buffer) {
  try {
    fs.writeFileSync(path.join(ensureDir(id), "thumb.jpg"), jpeg, { mode: 0o600 });
  } catch {
    // 忽略
  }
}

export function thumbDataUrl(id: string): string | null {
  if (!isProjectId(id)) return null;
  try {
    return "data:image/jpeg;base64," + fs.readFileSync(path.join(projectDir(id), "thumb.jpg")).toString("base64");
  } catch {
    return null;
  }
}
