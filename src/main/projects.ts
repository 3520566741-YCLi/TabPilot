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
}
export interface ProjectState {
  activeId: string;
  projects: ProjectInfo[];
}

interface Live {
  info: ProjectInfo;
  view: WebContentsView;
  browser: TableauBrowser;
}

const storeFile = () => path.join(app.getPath("userData"), "projects.json");
const newId = () => Math.random().toString(36).slice(2, 10);
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
  private order: string[] = [];
  activeId = "";
  bounds = { x: 0, y: 0, width: 800, height: 600 };
  hidden = false;

  constructor(
    private win: BaseWindow,
    private onChange: (s: ProjectState) => void,
    private onUrl: (url: string) => void,
  ) {}

  restore() {
    let saved: ProjectState | null = null;
    try {
      saved = JSON.parse(fs.readFileSync(storeFile(), "utf8"));
    } catch {
      saved = null;
    }
    if (saved?.projects?.length) {
      for (const p of saved.projects) this.open({ ...p }, false);
      this.switchTo(this.live.has(saved.activeId) ? saved.activeId : this.order[0]);
    } else {
      this.create(L("项目 1", "Project 1"));
    }
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(storeFile()), { recursive: true });
      fs.writeFileSync(storeFile(), JSON.stringify(this.state(), null, 1));
    } catch {
      // 保存失败不影响使用
    }
  }

  state(): ProjectState {
    return { activeId: this.activeId, projects: this.order.map((id) => ({ ...this.live.get(id)!.info })) };
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
    wc.loadURL(isTableauUrl(info.url) ? info.url : TABLEAU_HOME).catch(() => {});
    this.live.set(info.id, live);
    this.order.push(info.id);
    if (activate) this.switchTo(info.id);
    return live;
  }

  create(name?: string, url?: string): ProjectState {
    const info: ProjectInfo = {
      id: newId(),
      name: name?.trim() || L(`项目 ${this.order.length + 1}`, `Project ${this.order.length + 1}`),
      url: url && isTableauUrl(url) ? url : TABLEAU_HOME,
      title: "",
      icon: "home",
      updatedAt: Date.now(),
    };
    this.open(info, true);
    this.emit();
    return this.state();
  }

  switchTo(id: string): ProjectState {
    if (!this.live.has(id)) return this.state();
    this.activeId = id;
    for (const [pid, l] of this.live) l.view.setVisible(pid === id && !this.hidden);
    this.layout();
    const l = this.live.get(id)!;
    this.onUrl(l.view.webContents.getURL());
    this.emit();
    return this.state();
  }

  close(id: string): ProjectState {
    const l = this.live.get(id);
    if (!l || this.order.length <= 1) return this.state();
    this.win.contentView.removeChildView(l.view);
    l.view.webContents.close();
    this.live.delete(id);
    this.order = this.order.filter((x) => x !== id);
    if (this.activeId === id) this.switchTo(this.order[Math.max(0, this.order.length - 1)]);
    this.emit();
    return this.state();
  }

  rename(id: string, name: string): ProjectState {
    const l = this.live.get(id);
    if (l && name.trim()) {
      l.info.name = name.trim().slice(0, 40);
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
    if (this.live.has(nameOrId)) return nameOrId;
    const n = nameOrId.trim().toLowerCase();
    for (const id of this.order) if (this.live.get(id)!.info.name.toLowerCase() === n) return id;
    for (const id of this.order) if (this.live.get(id)!.info.name.toLowerCase().includes(n)) return id;
    return null;
  }

  browserOf(id: string): TableauBrowser | null {
    return this.live.get(id)?.browser ?? null;
  }

  active(): Live {
    return this.live.get(this.activeId)!;
  }

  // 下载属于共享会话，按发起下载的页面找到对应项目
  browserFor(wc: Electron.WebContents | null | undefined): TableauBrowser {
    for (const l of this.live.values()) if (l.view.webContents === wc) return l.browser;
    return this.active().browser;
  }

  setBounds(b: { x: number; y: number; width: number; height: number }, hidden: boolean) {
    this.bounds = b;
    this.hidden = hidden;
    this.layout();
  }

  private layout() {
    for (const [id, l] of this.live) {
      l.view.setBounds(this.bounds);
      l.view.setVisible(id === this.activeId && !this.hidden);
    }
  }
}
