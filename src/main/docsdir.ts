// 文档存放位置：每个项目在这里有一个文件夹，放用到的数据文件副本、建图步骤、导出的文件。
// Tableau Public 网页版不能把草稿存成本地工作簿，所以本地保存的是“能把图重新做出来的东西”。
import { app } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import { getSettings, updateSettings } from "./settings";

export function defaultDocsDir(): string {
  return path.join(app.getPath("documents"), "TabPilot");
}

// 只接受主目录下的普通文件夹（不能是 Library、隐藏目录或系统目录）
export function validDocsDir(p: unknown): string | null {
  if (typeof p !== "string" || !p || p.length > 500) return null;
  const abs = path.resolve(p);
  const home = os.homedir();
  const rel = path.relative(home, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return null;
  if (rel.split(path.sep).some((seg) => seg.startsWith(".") || seg === "Library" || seg === "AppData")) return null;
  return abs;
}

export function docsDir(): string {
  return validDocsDir(getSettings().docsDir) ?? defaultDocsDir();
}

// 选定（或确认默认）存放位置：建好文件夹并记下“已选过”
export function setDocsDir(p: string): { ok: boolean; path?: string; error?: string } {
  const abs = validDocsDir(p);
  if (!abs) return { ok: false, error: "只能选你主目录下的普通文件夹。" };
  try {
    fs.mkdirSync(abs, { recursive: true });
    fs.accessSync(abs, fs.constants.W_OK);
  } catch {
    return { ok: false, error: "这个文件夹不能写入，请换一个。" };
  }
  updateSettings({ docsDir: abs, docsDirChosen: true }, true);
  return { ok: true, path: abs };
}

export function docsDirReady(): boolean {
  const s = getSettings();
  if (!s.docsDirChosen) return false;
  try {
    fs.accessSync(docsDir(), fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "").slice(0, 60) || "项目";

// 项目文件夹：<存放位置>/<项目名>-<id>；项目改名后仍按 id 找到原来的文件夹
export function projectFolder(id: string, name: string): string {
  const root = docsDir();
  try {
    const hit = fs.readdirSync(root).find((d) => d.endsWith("-" + id));
    if (hit) return path.join(root, hit);
  } catch {
    // 文件夹还不存在
  }
  return path.join(root, `${safeName(name)}-${id}`);
}

function ensure(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// 上传数据时把文件复制一份到项目文件夹，草稿失效重做时原文件不在了也能用
export function keepDataCopy(id: string, name: string, file: string): string | null {
  try {
    const dir = ensure(path.join(projectFolder(id, name), "数据"));
    const target = path.join(dir, path.basename(file));
    if (path.resolve(file) !== path.resolve(target)) fs.copyFileSync(file, target);
    return target;
  } catch {
    return null;
  }
}

// 重做时找数据文件：原路径还在就用原路径，否则用项目文件夹里的副本
export function resolveDataFile(id: string, name: string, file: string): string {
  if (fs.existsSync(file)) return file;
  const copy = path.join(projectFolder(id, name), "数据", path.basename(file));
  return fs.existsSync(copy) ? copy : file;
}

export function exportsFolder(id: string, name: string): string {
  return ensure(path.join(projectFolder(id, name), "导出"));
}

// 项目信息和建图步骤也写一份到项目文件夹（人能看懂的 JSON），换电脑或重装后也能找回
export function writeProjectManifest(id: string, name: string, data: unknown) {
  try {
    const dir = ensure(projectFolder(id, name));
    const file = path.join(dir, "项目.json");
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  } catch {
    // 写不进去不影响使用
  }
}
