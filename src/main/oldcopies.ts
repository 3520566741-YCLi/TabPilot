// 新版本启动后找出电脑上其他位置的旧版本副本（.app 和安装包），由用户确认后移到废纸篓。
// 只处理软件本体和安装包，绝不碰用户数据（设置、Key、登录状态都在 userData 里，与这里无关）。
import { app, shell } from "electron";
import { execFileSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

export interface OldCopy {
  path: string;
  kind: "app" | "installer";
  version: string;
}

const APP_NAMES = ["TabPilot.app", "Tableau AI.app"];
const INSTALLER_RE = /^(TabPilot|Tableau-AI)-(?:Setup-)?(\d+\.\d+\.\d+)-.*\.(dmg|exe)$/i;

function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

function appVersion(appPath: string): string | null {
  try {
    const plist = path.join(appPath, "Contents", "Info.plist");
    const json = execFileSync("plutil", ["-convert", "json", "-o", "-", plist], { encoding: "utf8" });
    return String(JSON.parse(json).CFBundleShortVersionString ?? "") || null;
  } catch {
    return null;
  }
}

function currentAppBundle(): string | null {
  const exe = app.getPath("exe");
  const i = exe.indexOf(".app/");
  return i >= 0 ? exe.slice(0, i + 4) : null;
}

let lastScan: OldCopy[] = [];

export function scanOldCopies(): OldCopy[] {
  if (process.platform !== "darwin") return (lastScan = []);
  const current = app.getVersion();
  const self = currentAppBundle();
  const home = os.homedir();
  const dirs = ["/Applications", path.join(home, "Applications"), path.join(home, "Desktop"), path.join(home, "Downloads")];
  const found: OldCopy[] = [];
  for (const dir of dirs) {
    let entries: string[] = [];
    try {
      entries = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      const full = path.join(dir, name);
      if (APP_NAMES.includes(name)) {
        if (self && path.resolve(full) === path.resolve(self)) continue;
        const v = appVersion(full);
        if (!v || cmpVersion(v, current) > 0) continue; // 比当前新的不提示
        found.push({ path: full, kind: "app", version: v });
      } else {
        const m = name.match(INSTALLER_RE);
        if (m && cmpVersion(m[2], current) < 0) found.push({ path: full, kind: "installer", version: m[2] });
      }
    }
  }
  lastScan = found;
  return found;
}

// 只允许删除本次扫描结果里的路径
export async function trashOldCopies(paths: string[]): Promise<{ removed: string[]; failed: string[] }> {
  const allowed = new Set(lastScan.map((c) => c.path));
  const removed: string[] = [];
  const failed: string[] = [];
  for (const p of paths) {
    if (!allowed.has(p)) {
      failed.push(p);
      continue;
    }
    try {
      await shell.trashItem(p);
      removed.push(p);
    } catch {
      failed.push(p);
    }
  }
  lastScan = lastScan.filter((c) => !removed.includes(c.path));
  return { removed, failed };
}
