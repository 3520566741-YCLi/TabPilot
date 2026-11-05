// 项目管理：每个项目是右侧一个独立的 Tableau 页面（WebContentsView），切换时不关闭旧页面。
// 项目列表（名称、网址）保存在本地，下次启动时恢复。
import { app, BaseWindow, WebContentsView, shell } from "electron";
import { L } from "./i18n";
import fs from "fs";
import path from "path";
import { TableauBrowser } from "./browser";

export const TABLEAU_HOME = "https://public.tableau.com/app/discover";
export const PARTITION = "persist:tableau";

export interface ProjectInfo {
  id: string;
  name: string;
  url: string;
  title: string;
  icon: "chart" | "map" | "table" | "home" | "data";
  updatedAt: number;
  createdAt: number;
  lastOpenedAt: number;
  summary: string; // 第一条需求，用于主页卡片
  sheets: string[]; // 最近一次看到的工作表名
  dataFiles: string[]; // 用过的数据文件路径
  steps: number; // 已记录的可重建步骤数
  hasThumb: boolean;
  favorite: boolean;
  trashedAt: number; // 0 = 不在废纸篓
  sample: string; // 从样例创建时记下样例名
  publishedUrl: string; // 保存（发布到 Tableau Public、不在个人主页显示）后的工作簿地址；重新打开项目时打开它继续编辑
  savedSteps: number; // 上次保存时的步骤数；steps 比它多就是“有没保存的改动”
  savedAt: number;
}
export interface ProjectState {
  activeId: string; // 当前编辑的项目；在主页时为 ""
  home: boolean; // 是否在主页
  projects: ProjectInfo[]; // 打开着的项目（顶部标签）
  library: ProjectInfo[]; // 本地保存的全部项目（主页列表，按最近打开排序；不含废纸篓里的）
  trash: ProjectInfo[]; // 废纸篓（不会自动清除，只有用户手动删除或清空才删）
  runningId: string; // 正在执行任务的项目（没有为 ""）；停止按钮和“运行中”标记跟着它走
}

interface Live {
  info: ProjectInfo;
  view: WebContentsView;
  browser: TableauBrowser;
}

const storeFile = () => path.join(app.getPath("userData"), "projects.json");
// 每个项目的本地资料：聊天记录、AI 上下文、可重建步骤、缩略图
// 项目 id 只能是 4~16 位字母数字；不合格直接报错，避免拼出 projects 目录本身（删除时会把所有项目资料一起删掉）
export const isProjectId = (id: unknown): id is string => typeof id === "string" && /^[a-z0-9]{4,16}$/i.test(id);
export const projectDir = (id: string) => {
  if (!isProjectId(id)) throw new Error("无效的项目 id");
  return path.join(app.getPath("userData"), "projects", id);
};
const newId = () => (Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 8);
const isTableauUrl = (u: string) => /^https:\/\/([a-z0-9-]+\.)*(tableau\.com|salesforce\.com|tableausoftware\.com)\//i.test(u);

const isNavAllowed = (u: string) =>
  /^https:\/\/([a-z0-9-]+\.)*(tableau\.com|salesforce\.com|tableausoftware\.com)(\/|$|\?|#)/i.test(u) ||
  // 第三方登录（用 Google / Apple / 微软 / LinkedIn 账号登录 Tableau 时会跳过去）
  /^https:\/\/(accounts\.google\.com|appleid\.apple\.com|login\.microsoftonline\.com|www\.linkedin\.com)(\/|$|\?)/i.test(u) ||
  u === "about:blank";

function iconFor(url: string): ProjectInfo["icon"] {
  if (/\/newWorkbook\/|\/authoring\//.test(url)) return "chart";
  if (/\/profile\/|\/viz\//.test(url)) return "table";
  return "home";
}

export class ProjectManager {
  private live = new Map<string, Live>();
  private library = new Map<string, ProjectInfo>();
  private order: string[] = []; // 打开着的项目（标签顺序）
  activeId = "";
  home = true;
  bounds = { x: 0, y: 0, width: 800, height: 600 };
  hidden = false;
  // 没有打开任何项目时，工具层用这个空白页兜底（不显示）
  private idle: Live | null = null;

  constructor(
    private win: BaseWindow,
    private onChange: (s: ProjectState) => void,
    private onUrl: (url: string) => void,
  ) {}

  restore() {
    let saved: any = null;
    try {
      saved = JSON.parse(fs.readFileSync(storeFile(), "utf8"));
    } catch {
      saved = null;
    }
    const list: any[] = Array.isArray(saved?.library) ? saved.library : Array.isArray(saved?.projects) ? saved.projects : [];
    for (const p of list) {
      if (!p || typeof p.id !== "string" || !/^[a-z0-9]{4,16}$/i.test(p.id)) continue;
      this.library.set(p.id, normalizeInfo(p));
    }
    const openIds: string[] = Array.isArray(saved?.openIds) ? saved.openIds : Array.isArray(saved?.projects) ? saved.projects.map((p: any) => p.id) : [];
    for (const id of openIds) {
      const info = this.library.get(id);
      if (info && !info.trashedAt && !this.live.has(id)) this.open(info, false);
    }
    // 启动时先进主页；上次在编辑的项目已经在后台打开，点一下就回去
    this.activeId = this.live.has(saved?.activeId) ? saved.activeId : (this.order[0] ?? "");
    this.home = true;
    this.layout();
    this.emit();
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
      const data = { activeId: this.activeId, openIds: this.order, library: [...this.library.values()] };
      fs.writeFileSync(storeFile(), JSON.stringify(data, null, 1));
    } catch {
      // 保存失败不影响使用
    }
  }

  runningId = "";
  setRunning(id: string) {
    if (this.runningId === id) return;
    this.runningId = id;
    this.layout();
    this.emit();
  }

  state(): ProjectState {
    return {
      activeId: this.home ? "" : this.activeId,
      home: this.home,
      projects: this.order.map((id) => ({ ...this.library.get(id)! })),
      library: [...this.library.values()].filter((p) => !p.trashedAt).sort((a, b) => b.lastOpenedAt - a.lastOpenedAt).map((p) => ({ ...p })),
      trash: [...this.library.values()].filter((p) => p.trashedAt).sort((a, b) => b.trashedAt - a.trashedAt).map((p) => ({ ...p })),
      runningId: this.runningId,
    };
  }

  info(id: string): ProjectInfo | undefined {
    return this.library.get(id);
  }

  // 主进程其他模块更新项目信息（摘要、工作表、数据文件、缩略图等）
  patch(id: string, p: Partial<ProjectInfo>) {
    const info = this.library.get(id);
    if (!info) return;
    Object.assign(info, p, { updatedAt: Date.now() });
    this.emit();
  }

  private emit() {
    this.save();
    this.onChange(this.state());
  }

  private open(info: ProjectInfo, activate: boolean): Live {
    const view = new WebContentsView({
      webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
    });
    view.setVisible(false);
    this.win.contentView.addChildView(view);
    const wc = view.webContents;
    // 新窗口（例如“Web 制作”有时用新标签页打开）在当前项目里打开
    wc.setWindowOpenHandler(({ url }) => {
      if (isTableauUrl(url)) wc.loadURL(url);
      else if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    // 右侧只在 Tableau / Salesforce 登录相关的 https 页面里跳转，其他网址交给系统浏览器
    const guard = (e: Electron.Event, url: string) => {
      if (isNavAllowed(url)) return;
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    };
    wc.on("will-navigate", guard);
    // 服务器 302 跳转也要检查
    wc.on("will-redirect", (e, url, _inPlace, isMainFrame) => {
      if (isMainFrame) guard(e, url);
    });
    // 子框架：Tableau 编辑器、地图、登录等会用到各种 https 子框架，不能按域名白名单限制，
    // 这里只拦掉非网页协议（file:、自定义协议、javascript: 等），防止子框架被引去打开本地文件或外部程序
    wc.on("will-frame-navigate", (e) => {
      if (e.isMainFrame) return;
      if (!/^(https:|about:blank|about:srcdoc|data:|blob:)/i.test(e.url)) e.preventDefault();
    });
    const live: Live = { info, view, browser: new TableauBrowser(wc) };
    const update = () => {
      const url = wc.getURL();
      if (!url || url === "about:blank") return;
      info.url = url;
      info.icon = iconFor(url);
      info.updatedAt = Date.now();
      if (this.activeId === info.id) this.onUrl(url);
      this.emit();
    };
    wc.on("did-navigate", update);
    wc.on("did-navigate-in-page", update);
    wc.on("page-title-updated", (_e, title) => {
      info.title = title;
      this.emit();
    });
    // 保存过的项目一律打开已保存工作簿的编辑页（上次可能停在草稿、作品页或搜索页）
    const start = info.publishedUrl || info.url;
    wc.loadURL(isTableauUrl(start) ? start : TABLEAU_HOME).catch(() => {});
    this.live.set(info.id, live);
    if (!this.order.includes(info.id)) this.order.push(info.id);
    if (activate) this.switchTo(info.id);
    return live;
  }

  create(name?: string, url?: string, sample = ""): ProjectState {
    const now = Date.now();
    const info: ProjectInfo = normalizeInfo({
      sample,
      id: newId(),
      name: name?.trim() || L(`项目 ${this.library.size + 1}`, `Project ${this.library.size + 1}`),
      url: url && isTableauUrl(url) ? url : TABLEAU_HOME,
      createdAt: now,
      lastOpenedAt: now,
    });
    this.library.set(info.id, info);
    this.open(info, true);
    this.emit();
    return this.state();
  }

  // 打开主页里的项目：已经打开就切过去，否则恢复它的 Tableau 页面
  openProject(id: string): ProjectState {
    const info = this.library.get(id);
    if (!info || info.trashedAt) return this.state();
    if (!this.live.has(id)) this.open(info, false);
    return this.switchTo(id);
  }

  switchTo(id: string): ProjectState {
    if (!this.live.has(id)) return this.state();
    this.activeId = id;
    this.home = false;
    const info = this.library.get(id);
    if (info) info.lastOpenedAt = Date.now();
    this.layout();
    const l = this.live.get(id)!;
    this.onUrl(l.view.webContents.getURL());
    this.emit();
    return this.state();
  }

  showHome(): ProjectState {
    this.home = true;
    this.layout();
    this.emit();
    return this.state();
  }

  // 关闭标签：项目仍保存在本地，可以从主页再打开
  close(id: string): ProjectState {
    const l = this.live.get(id);
    if (!l) return this.state();
    this.win.contentView.removeChildView(l.view);
    l.view.webContents.close();
    this.live.delete(id);
    this.order = this.order.filter((x) => x !== id);
    if (this.activeId === id) {
      const next = this.order[this.order.length - 1];
      if (next && !this.home) this.switchTo(next);
      else if (next) this.activeId = next;
      else {
        this.activeId = "";
        this.home = true;
        this.layout();
      }
    }
    this.emit();
    return this.state();
  }

  setFavorite(id: string, on: boolean): ProjectState {
    const info = this.library.get(id);
    if (info) {
      info.favorite = !!on;
      this.emit();
    }
    return this.state();
  }

  // 移到废纸篓：关闭标签，随时可以恢复
  trash(id: string): ProjectState {
    if (!isProjectId(id)) return this.state();
    const info = this.library.get(id);
    if (!info) return this.state();
    if (this.live.has(id)) this.close(id);
    info.trashedAt = Date.now();
    this.emit();
    return this.state();
  }

  restoreFromTrash(id: string): ProjectState {
    const info = this.library.get(id);
    if (info) {
      info.trashedAt = 0;
      this.emit();
    }
    return this.state();
  }

  purge(id: string): ProjectState {
    return this.remove(id);
  }

  emptyTrash(): ProjectState {
    for (const p of [...this.library.values()]) if (p.trashedAt) this.remove(p.id);
    return this.state();
  }

  // 复制项目：新项目带上原项目的聊天记录、建图步骤和缩略图；Tableau 草稿不共用，
  // 新项目从首页开始，需要时用“按步骤重建”生成自己的工作簿
  duplicate(id: string): ProjectInfo | null {
    if (!isProjectId(id)) return null;
    const src = this.library.get(id);
    if (!src) return null;
    const now = Date.now();
    const copy = normalizeInfo({
      ...src,
      id: newId(),
      name: L(`${src.name} 副本`, `${src.name} copy`).slice(0, 40),
      url: TABLEAU_HOME,
      createdAt: now,
      lastOpenedAt: now,
      updatedAt: now,
      favorite: false,
      trashedAt: 0,
    });
    try {
      fs.cpSync(projectDir(id), projectDir(copy.id), { recursive: true, force: true });
      fs.rmSync(path.join(projectDir(copy.id), "agent.json"), { force: true }); // AI 上下文绑定原工作簿，不复制
    } catch {
      // 原项目还没有本地资料
    }
    this.library.set(copy.id, copy);
    this.emit();
    return copy;
  }

  // 删除项目：关闭标签并删除本地资料（聊天记录、上下文、步骤、缩略图）
  remove(id: string): ProjectState {
    if (!isProjectId(id) || !this.library.has(id)) return this.state();
    if (this.live.has(id)) this.close(id);
    this.library.delete(id);
    try {
      fs.rmSync(projectDir(id), { recursive: true, force: true });
    } catch {
      // 忽略
    }
    this.emit();
    return this.state();
  }

  rename(id: string, name: string): ProjectState {
    const info = this.library.get(id);
    if (info && name.trim()) {
      info.name = name.trim().slice(0, 40);
      this.emit();
    }
    return this.state();
  }

  reorder(ids: string[]): ProjectState {
    const known = ids.filter((id) => this.live.has(id));
    this.order = [...known, ...this.order.filter((id) => !known.includes(id))];
    this.emit();
    return this.state();
  }

  findByName(nameOrId: string): string | null {
    const alive = [...this.library.values()].filter((p) => !p.trashedAt);
    if (alive.some((p) => p.id === nameOrId)) return nameOrId;
    const n = nameOrId.trim().toLowerCase();
    for (const p of alive) if (p.name.toLowerCase() === n) return p.id;
    for (const p of alive) if (p.name.toLowerCase().includes(n)) return p.id;
    return null;
  }

  browserOf(id: string): TableauBrowser | null {
    return this.live.get(id)?.browser ?? null;
  }

  hasActive(): boolean {
    return this.live.has(this.activeId);
  }

  active(): Live {
    const l = this.live.get(this.activeId);
    if (l) return l;
    if (!this.idle) {
      const view = new WebContentsView({ webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false } });
      view.setVisible(false);
      this.idle = { info: normalizeInfo({ id: "idle" }), view, browser: new TableauBrowser(view.webContents) };
    }
    return this.idle;
  }

  // 下载属于共享会话，按发起下载的页面找到对应项目
  browserFor(wc: Electron.WebContents | null | undefined): TableauBrowser {
    for (const l of this.live.values()) if (l.view.webContents === wc) return l.browser;
    return this.active().browser;
  }

  idOfBrowser(b: TableauBrowser): string | null {
    for (const [id, l] of this.live) if (l.browser === b) return id;
    return null;
  }

  setBounds(b: { x: number; y: number; width: number; height: number }, hidden: boolean) {
    this.bounds = b;
    this.hidden = hidden;
    this.layout();
  }

  private layout() {
    for (const [id, l] of this.live) {
      const show = id === this.activeId && !this.hidden && !this.home;
      // 正在执行任务但不在前台的项目：移到窗口左边外面，只留 1 像素在窗口内。
      // 完全移出窗口时 Chromium 不再出帧，截图会卡住；留 1 像素就照常渲染，截图和点击都不受影响
      const background = !show && id === this.runningId;
      l.view.setBounds(background ? { ...this.bounds, x: -this.bounds.width + 1 } : this.bounds);
      l.view.setVisible(show || background);
    }
  }
}

function normalizeInfo(p: any): ProjectInfo {
  const now = Date.now();
  const str = (v: unknown, d = "", max = 500) => (typeof v === "string" ? v.slice(0, max) : d);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    id: str(p?.id, newId(), 16),
    name: str(p?.name, "", 40) || L("未命名项目", "Untitled project"),
    url: typeof p?.url === "string" && isTableauUrl(p.url) ? p.url : TABLEAU_HOME,
    title: str(p?.title, "", 200),
    icon: ["chart", "map", "table", "home", "data"].includes(p?.icon) ? p.icon : "home",
    updatedAt: num(p?.updatedAt, now),
    createdAt: num(p?.createdAt, num(p?.updatedAt, now)),
    lastOpenedAt: num(p?.lastOpenedAt, num(p?.updatedAt, now)),
    summary: str(p?.summary, "", 200),
    sheets: Array.isArray(p?.sheets) ? p.sheets.filter((x: unknown) => typeof x === "string").slice(0, 30) : [],
    dataFiles: Array.isArray(p?.dataFiles) ? p.dataFiles.filter((x: unknown) => typeof x === "string").slice(0, 10) : [],
    steps: num(p?.steps, 0),
    hasThumb: p?.hasThumb === true,
    favorite: p?.favorite === true,
    trashedAt: num(p?.trashedAt, 0),
    sample: str(p?.sample, "", 80),
    publishedUrl: typeof p?.publishedUrl === "string" && isTableauUrl(p.publishedUrl) ? p.publishedUrl : "",
    savedSteps: num(p?.savedSteps, 0),
    savedAt: num(p?.savedAt, 0),
  };
}
