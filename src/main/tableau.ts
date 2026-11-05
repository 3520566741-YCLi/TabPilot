// Tableau 网页版的高层操作：用一段页面脚本读出编辑器的结构化状态，
// 再用真实鼠标/键盘事件执行（双击功能区键入表达式、拖拽字段、切换标记类型等）
import { TableauBrowser, UiElement } from "./browser";
import { randomUUID } from "crypto";
import { L } from "./i18n";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type Shelf = "columns" | "rows" | "filters" | "pages" | "color" | "size" | "label" | "detail" | "tooltip" | "shape" | "path" | "angle";

const SHELF_CN: Record<Shelf, string> = {
  columns: "列", rows: "行", filters: "筛选器", pages: "页面", color: "颜色", size: "大小",
  label: "标签", detail: "详细信息", tooltip: "工具提示", shape: "形状", path: "路径", angle: "角度",
};
// 标记卡上的编码按钮名称（标签在文本标记下叫“文本”）
const ENCODING_NAMES: Partial<Record<Shelf, RegExp>> = {
  color: /^(颜色|Color)$/, size: /^(大小|Size)$/, label: /^(标签|文本|Label|Text)$/, detail: /^(详细信息|Detail)$/,
  tooltip: /^(工具提示|Tooltip)$/, shape: /^(形状|Shape)$/, path: /^(路径|Path)$/, angle: /^(角度|Angle)$/,
};
const MARK_TYPES: [RegExp, string][] = [
  [/^(自动|auto(matic)?)$/i, "自动"], [/^(条形图?|bar)$/i, "条形图"], [/^(线|折线|line)$/i, "线"], [/^(区域|面积|area)$/i, "区域"],
  [/^(方形|square)$/i, "方形"], [/^(圆|圆形|circle)$/i, "圆"], [/^(形状|shape)$/i, "形状"], [/^(文本|text)$/i, "文本"],
  [/^(地图|map|filled map)$/i, "地图"], [/^(饼图?|pie)$/i, "饼图"], [/^(甘特条形图|甘特|gantt( bar)?)$/i, "甘特条形图"],
  [/^(多边形|polygon)$/i, "多边形"], [/^(密度|density)$/i, "密度"],
];

interface Rect { x: number; y: number; w: number; h: number }
interface Pill { label: string; measure: boolean; continuous: boolean; encoding?: string; rect: Rect; menu?: Rect }
interface Field { name: string; type: string; measure: boolean; rect: Rect }
interface EditorState {
  page: "editor" | "datasource" | "other";
  sheets: { name: string; selected: boolean; rect: Rect }[];
  shelves: Record<"columns" | "rows" | "pages" | "filter" | "encoding", { rect: Rect | null; pills: Pill[] }>;
  encodingButtons: { name: string; rect: Rect; disabled: boolean }[];
  markType: string;
  markTypeRect: Rect | null;
  fields: Field[];
  dataSource: string;
  status: string;
  dialogs: string[];
  editing: boolean;
  errors: string[];
}

// 在页面里执行，返回编辑器状态（坐标是页面 CSS 像素）
const STATE_SCRIPT = `(() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
  const pills = (root) => root ? [...root.querySelectorAll('.tabAuthShelfPill')].filter(vis).map(p => {
    const c = p.querySelector('.tabAuthPillContent');
    const enc = p.querySelector('.tabAuthPillEncodingType [role=combobox]');
    return {
      label: (p.querySelector('.tabAuthPillLabel')?.textContent || p.getAttribute('aria-label') || '').trim(),
      measure: !!c && c.classList.contains('tabAuthPillMeasure'),
      continuous: !!c && c.classList.contains('tabAuthPillQuantatative'),
      encoding: enc ? enc.getAttribute('aria-label') : undefined,
      rect: R(c || p),
      menu: R(p.querySelector('.tabAuthPillMenuBtn')),
    };
  }) : [];
  const shelf = (id, contentId) => { const el = document.getElementById(id) || document.getElementById(contentId); return { rect: el && vis(el) ? R(el) : null, pills: pills(el) }; };
  const editor = !!document.getElementById('shelf-columns') && vis(document.getElementById('shelf-columns'));
  const sheets = [...document.querySelectorAll('[role=tab]')].filter(t => vis(t) && t.closest('[role=tablist]') && R(t).y > innerHeight - 80).map(t => ({ name: (t.getAttribute('aria-label') || t.textContent || '').trim(), selected: t.getAttribute('aria-selected') === 'true', rect: R(t) }));
  const encodingButtons = [...document.querySelectorAll('[aria-label$="编码卡"],[aria-label$="Encoding Card"],[aria-label$="encoding card"]')].filter(vis).map(b => ({ name: b.getAttribute('aria-label').replace(/\\s*(编码卡|Encoding Card|encoding card)$/, ''), rect: R(b), disabled: b.getAttribute('aria-disabled') === 'true' || !!b.disabled }));
  const mt = document.querySelector('[data-tb-test-id=marksCardTabEncodingPrimitivesDropdown]') || [...document.querySelectorAll('button[aria-label]')].find(b => /^(标记类型|Mark Type)$/.test(b.getAttribute('aria-label')));
  let measureZone = false;
  const fields = [];
  for (const t of document.querySelectorAll('[role=treeitem]')) {
    if (!t.closest('[role=tree]')) continue;
    const label = t.getAttribute('aria-label') || '';
    const m = label.match(/^(.*)，([^，]+)$/);
    const name = (m ? m[1] : label).trim();
    const type = m ? m[2] : '';
    if (/^(度量名称|Measure Names)$/.test(name)) { fields.push({ name, type, measure: false, rect: R(t) }); measureZone = true; continue; }
    fields.push({ name, type, measure: measureZone, rect: R(t) });
  }
  const ds = document.querySelector('[role=listbox] [role=option][aria-selected=true]');
  const statusEl = [...document.querySelectorAll('div,span')].find(e => /个标记|\\bmarks?\\b/.test(e.textContent || '') && e.children.length < 6 && R(e).y > innerHeight - 30);
  const dialogs = [...document.querySelectorAll('[role=dialog],[role=alertdialog]')].filter(vis).map(d => (d.getAttribute('aria-label') || d.querySelector('h1,h2,h3')?.textContent || '对话框').trim());
  const ae = document.activeElement;
  const editing = !!ae && ae.tagName === 'TEXTAREA' && !!ae.closest('.tabAuthShelf,.tabAuthCard');
  const errors = [...document.querySelectorAll('[role=alert]')].filter(vis).map(e => e.textContent.trim()).filter(Boolean).slice(0, 3);
  const selTab = sheets.find(t => t.selected);
  const onDataSource = (selTab && /^(数据源|Data Source)$/.test(selTab.name)) || [...document.querySelectorAll('h2')].some(h => /^(连接|Connections)$/.test(h.textContent.trim()) && vis(h));
  const page = onDataSource ? 'datasource' : editor ? 'editor' : 'other';
  return {
    page, sheets,
    shelves: { columns: shelf('shelf-columns'), rows: shelf('shelf-rows'), pages: shelf('shelf-pages', 'cardContent-pages'), filter: shelf('shelf-filter', 'cardContent-filter'), encoding: shelf('shelf-encoding') },
    encodingButtons,
    markType: mt ? (mt.querySelector('[title]')?.getAttribute('title') || mt.textContent.trim()) : '',
    markTypeRect: R(mt),
    fields,
    dataSource: ds ? ds.getAttribute('aria-label') || '' : '',
    status: statusEl ? statusEl.textContent.replace(/\\s+/g, ' ').trim() : '',
    dialogs, editing, errors,
  };
})()`;

const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

function pillText(p: Pill) {
  return `${p.label}${p.measure ? "（度量" : "（维度"}${p.continuous ? "·连续）" : "·离散）"}`;
}

export class TableauOps {
  tutorial: () => boolean = () => false;
  // 用户点了“停止”时为 true：长时间等待的循环会尽快退出
  stopped: () => boolean = () => false;
  constructor(public b: TableauBrowser) {}

  private async find(pred: (e: UiElement) => boolean, query?: string): Promise<UiElement | undefined> {
    const list = await this.b.readElements(query);
    return list.find(pred);
  }

  private async waitFor(pred: (e: UiElement) => boolean, timeoutMs: number, query?: string): Promise<UiElement | undefined> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (this.stopped()) throw new Error("已被用户停止");
      const el = await this.find(pred, query);
      if (el) return el;
      await sleep(500);
    }
    return undefined;
  }

  async state(): Promise<EditorState> {
    await this.b.ensureAttached();
    return (await this.b.wc.mainFrame.executeJavaScript(STATE_SCRIPT)) as EditorState;
  }

  private async hl(points: { x: number; y: number }[], label: string) {
    await this.b.highlight(points, label, this.tutorial());
    if (this.tutorial()) await sleep(700);
  }

  // ---------- 打开编辑器、弹窗 ----------

  async openWebAuthoring(): Promise<string> {
    const wc = this.b.wc;
    let opened = false;
    // 首选：直接打开新的 Web 制作地址（和点“创建 → Web 制作”得到的是同一个页面，比点菜单可靠）
    await wc.loadURL(`https://public.tableau.com/newWorkbook/${randomUUID()}`).catch(() => {});
    opened = /\/newWorkbook\//.test(wc.getURL());
    for (let attempt = 0; attempt < 4 && !opened; attempt++) {
      if (!/public\.tableau\.com\/app\//.test(wc.getURL())) {
        await wc.loadURL("https://public.tableau.com/app/discover").catch(() => {});
        await sleep(1500);
      }
      await this.dismissPopups();
      const create = await this.waitFor((e) => e.role.startsWith("button") && /^(创建|Create)$/.test(e.name), 8000);
      if (!create) continue;
      if (!create.role.includes("expanded")) await this.b.click(create.x, create.y);
      const item = await this.waitFor((e) => e.role.startsWith("li") && /^(Web 制作|Web Authoring)/.test(e.name), 3000)
        ?? (await this.find((e) => /^(Web 制作|Web Authoring)$/i.test(e.name)));
      if (!item) continue;
      await sleep(400); // 等菜单展开动画结束，再确认菜单还开着
      const again = await this.find((e) => e.role.startsWith("li") && /^(Web 制作|Web Authoring)/.test(e.name));
      if (!again) continue;
      const pt = { x: Math.min(again.x, again.x - again.w / 2 + 60), y: again.y };
      await this.hl([pt], "创建 → Web 制作");
      await this.b.click(pt.x, pt.y);
      for (let i = 0; i < 20 && !opened; i++) {
        await sleep(500);
        opened = /\/newWorkbook\/|\/authoring\//.test(wc.getURL());
      }
    }
    if (!opened) return "没能打开“创建 → Web 制作”（可能有弹窗挡住），请截图查看。";
    const dialog = await this.waitFor((e) => /^(连接到数据|Connect to Data)$/.test(e.name), 60000);
    if (!dialog) {
      const s = await this.state().catch(() => null);
      if (s?.page === "editor") return `已打开 Web 制作（${wc.getURL()}），但没看到“连接到数据”对话框。可点工具栏“新建数据源”打开。`;
      return `已点击 Web 制作，但 60 秒内编辑器没有加载完成。当前网址：${wc.getURL()}`;
    }
    return `已打开新的 Web 制作工作簿（${wc.getURL()}），“连接到数据”对话框已弹出，下一步调用 upload_file。`;
  }

  // 关掉欢迎/引导之类的弹窗（不处理 Cookie 同意，那个留给用户）
  async dismissPopups(): Promise<boolean> {
    await sleep(800);
    const list = await this.b.readElements();
    const hasDialog = list.some((e) => e.role.startsWith("dialog") && !/(cookie|连接到数据|Connect to Data)/i.test(e.name));
    if (!hasDialog) return false;
    const close = list.find((e) => e.role.startsWith("button") && /(模式关闭按钮|^关闭$|^Close$|Close dialog|Dismiss)/i.test(e.name));
    if (!close) return false;
    await this.b.click(close.x, close.y);
    await sleep(600);
    return true;
  }

  // ---------- 上传数据 ----------

  async uploadFile(filePath: string, ask: (q: string) => Promise<string>, table?: string): Promise<string> {
    let btn = await this.find((e) => /^(从计算机上载|Upload from Computer)$/i.test(e.name));
    if (!btn) {
      let tab = await this.waitFor((e) => /^tab\b/.test(e.role) && /^(文件|Files)$/.test(e.name), 8000);
      if (!tab) {
        const add = await this.find((e) => e.role.startsWith("button") && /^(新建数据源|New Data Source|添加连接)$/.test(e.name));
        if (add) {
          await this.b.click(add.x, add.y);
          tab = await this.waitFor((e) => /^tab\b/.test(e.role) && /^(文件|Files)$/.test(e.name), 10000);
        }
      }
      // 对话框刚弹出时页签还不响应点击：等数据源列表加载完，再最多点 5 次
      if (tab) await this.waitFor((e) => /^(连接到 |Connect to )/.test(e.name) && e.role.startsWith("button"), 20000);
      for (let i = 0; tab && !btn && i < 5; i++) {
        await sleep(i === 0 ? 500 : 1500);
        await this.hl([{ x: tab.x, y: tab.y }], "切到“文件”页");
        await this.b.click(tab.x, tab.y);
        btn = await this.waitFor((e) => /^(从计算机上载|Upload from Computer)$/i.test(e.name), 3000);
      }
    }
    if (!btn) return "没有找到“从计算机上载”按钮。请先 open_web_authoring，或点工具栏“新建数据源”打开“连接到数据”对话框。";

    await this.b.armFileChooser();
    await this.hl([{ x: btn.x, y: btn.y }], "从计算机上载");
    await this.b.click(btn.x, btn.y);
    let done = false;
    if (await this.b.waitFileChooser(5000)) {
      await this.b.fulfillFileChooser(filePath);
      done = true;
    } else {
      done = await this.b.setFileOnAnyInput(filePath);
    }
    await this.b.disarmFileChooser();
    if (!done) {
      const ans = await ask(
        L(
          `没能自动选择文件。请在右侧点“从计算机上载”，手动选择：\n${filePath}\n选好后点“已完成”。`,
          `Couldn't pick the file automatically. On the right, click "Upload from Computer" and choose:\n${filePath}\nThen click "Done".`,
        ),
      );
      if (!/(完成|Done)/.test(ans)) return "用户没有完成手动上传。";
    }

    // 等数据源页出现：左侧会列出文件里的表
    const end = Date.now() + 120000;
    let tables: UiElement[] = [];
    let editorReady = false;
    while (Date.now() < end) {
      if (this.stopped()) throw new Error("已被用户停止");
      await sleep(1500);
      const list = await this.b.readElements();
      const err = list.find((e) => e.role.startsWith("alert") && /(错误|失败|无法|Error|failed)/i.test(e.name));
      if (err) return `上传出错：${err.name}`;
      tables = list.filter((e) => e.role.startsWith("row") && e.x < 320 && !/命名范围|named range/i.test(e.name) && !/Microsoft|Excel|\.csv/i.test(e.name));
      if (tables.length) break;
      const s = await this.state().catch(() => null);
      if (s?.page === "editor" && s.fields.length) {
        editorReady = true;
        break;
      }
    }
    if (editorReady) return `已上传 ${filePath}，已进入工作表编辑界面。`;
    if (!tables.length) return "已提交文件，但 120 秒内没看到数据源页面，请用 screenshot / read_page 查看。";

    // 多表文件：把需要的表拖进画布（Tableau 有时会自动放入第一张表）
    const names = tables.map((t) => t.name);
    // 画布提示“将表拖到此处”会比表列表晚一点出现；画布上已有表时则不会出现
    let target: UiElement | undefined;
    for (let i = 0; i < 20 && !target; i++) {
      await sleep(750);
      const list = await this.b.readElements();
      target = list.find((e) => /将表拖到此处|Drag tables here/i.test(e.name));
      if (list.some((e) => /^(逻辑表和关系|Logical Tables)/.test(e.name))) break;
    }
    let picked = table ? tables.find((t) => t.name.toLowerCase() === table.toLowerCase()) : tables.find((t) => /^orders$/i.test(t.name));
    if (!picked) picked = tables[0];
    let note = "画布上已有表。";
    if (target) {
      note = `⚠️ 没能把表 ${picked.name} 拖进数据模型。`;
      for (let i = 0; i < 3; i++) {
        await sleep(i === 0 ? 2000 : 1500);
        const from = { x: Math.max(40, picked.x - 70), y: picked.y };
        const drop = { x: target.x, y: target.y - 80 };
        await this.hl([from, drop], `把 ${picked.name} 拖到画布`);
        await this.b.drag(from.x, from.y, drop.x, drop.y);
        await sleep(2500);
        const now = await this.b.readElements();
        if (!now.some((e) => /将表拖到此处|Drag tables here/i.test(e.name))) {
          note = `已把表 ${picked.name} 拖入数据模型。`;
          break;
        }
      }
      if (note.startsWith("⚠️")) return note + "请用 read_page 找到左侧表名，用 drag 拖到右侧画布中央。";
    }

    // 切到“工作表 1”
    const st = await this.state().catch(() => null);
    const sheet = st?.sheets.find((t) => !/^(数据源|Data Source)$/.test(t.name));
    const sheetTab = sheet ? center(sheet.rect) : null;
    if (sheetTab) {
      const end2 = Date.now() + 90000;
      let clicks = 0;
      while (Date.now() < end2) {
        if (this.stopped()) throw new Error("已被用户停止");
        const cur = await this.state().catch(() => null);
        if (cur?.page === "datasource" && clicks < 5) {
          await this.hl([sheetTab], `切到 ${sheet!.name}`);
          await this.b.click(sheetTab.x, sheetTab.y);
          clicks++;
        }
        await sleep(1500);
        const s = await this.state().catch(() => null);
        if (s?.page === "editor" && s.fields.length > 3) {
          await sleep(1500); // 等视图完全可交互
          return `已上传 ${filePath}（文件中的表：${names.join("、")}）。${note}已创建数据提取并切到“工作表 1”，数据窗格有 ${s.fields.length} 个字段，可以开始建图。`;
        }
      }
      return `已上传并切到“工作表 1”，但字段还没加载出来（数据提取可能还在创建），稍等后用 tableau_state 检查。`;
    }
    return `已上传 ${filePath}（表：${names.join("、")}）。${note}没找到“工作表 1”标签，请检查页面。`;
  }

  // ---------- 状态 ----------

  async describeState(): Promise<string> {
    let s: EditorState;
    try {
      s = await this.state();
    } catch (e) {
      return "读取状态失败：" + (e instanceof Error ? e.message : String(e));
    }
    if (s.page !== "editor") {
      return `当前不在工作表编辑界面（页面：${s.page === "datasource" ? "数据源页" : "其他"}，网址：${this.b.wc.getURL()}）。` + (s.dialogs.length ? `打开的对话框：${s.dialogs.join("、")}。` : "") + (s.sheets.length ? `底部标签：${s.sheets.map((t) => t.name + (t.selected ? "(当前)" : "")).join("、")}` : "");
    }
    const sh = (k: keyof EditorState["shelves"]) => s.shelves[k].pills.map(pillText).join("，") || "（空）";
    const enc = s.shelves.encoding.pills.map((p) => `${p.encoding ?? "?"}=${p.label}`).join("，") || "（空）";
    const dims = s.fields.filter((f) => !f.measure).map((f) => f.name);
    const meas = s.fields.filter((f) => f.measure).map((f) => f.name);
    const lines = [
      `工作表标签：${s.sheets.map((t) => (t.selected ? `【${t.name}】` : t.name)).join("、")}`,
      `数据源：${s.dataSource || "（未知）"}`,
      `列：${sh("columns")}`,
      `行：${sh("rows")}`,
      `筛选器：${sh("filter")}`,
      `页面：${sh("pages")}`,
      `标记类型：${s.markType || "?"}`,
      `标记卡：${enc}`,
      `视图状态：${s.status || "（无）"}`,
      `维度字段：${dims.join("、")}`,
      `度量字段：${meas.join("、")}`,
    ];
    if (s.dialogs.length) lines.push(`打开的对话框：${s.dialogs.join("、")}`);
    if (s.editing) lines.push("注意：有一个输入胶囊仍在编辑中（可能表达式有误），可按 Escape 取消。");
    if (s.errors.length) lines.push(`页面提示：${s.errors.join("；")}`);
    return lines.join("\n");
  }

  // ---------- 功能区 ----------

  private shelfKey(shelf: Shelf): "columns" | "rows" | "pages" | "filter" | null {
    if (shelf === "columns" || shelf === "rows" || shelf === "pages") return shelf;
    if (shelf === "filters") return "filter";
    return null;
  }

  // 功能区空白处（最后一个胶囊之后）
  private emptySpot(rect: Rect, pills: Pill[], horizontal: boolean) {
    if (horizontal) {
      const lastRight = pills.reduce((m, p) => Math.max(m, p.rect.x + p.rect.w), rect.x);
      const x = Math.min(rect.x + rect.w - 15, Math.max(lastRight + 40, rect.x + 30));
      return { x, y: rect.y + rect.h / 2 };
    }
    const lastBottom = pills.reduce((m, p) => Math.max(m, p.rect.y + p.rect.h), rect.y);
    return { x: rect.x + rect.w / 2, y: Math.min(rect.y + rect.h - 6, lastBottom + 10) };
  }

  async addToShelf(shelf: Shelf, expression: string, method: "type" | "drag"): Promise<string> {
    let s = await this.state();
    if (s.page !== "editor") return `当前不在工作表编辑界面（${s.page === "datasource" ? "在数据源页" : "其他页面"}），先用 switch_sheet 切到某个工作表。`;
    if (s.editing) {
      await this.b.key("Escape");
      await sleep(300);
      s = await this.state();
    }
    const key = this.shelfKey(shelf);
    const before = key ? s.shelves[key].pills.length : s.shelves.encoding.pills.length;
    let result = "";
    let after = s;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) {
        await sleep(1200);
        s = await this.state();
      }
      result = method === "drag" ? await this.dragFieldTo(s, shelf, expression) : await this.typeOnShelf(s, shelf, expression);
      if (result.startsWith("ERR:")) return result.slice(4);
      await sleep(1000);
      after = await this.state();
      const n = key ? after.shelves[key].pills.length : after.shelves.encoding.pills.length;
      if (n > before || after.dialogs.some((d) => /筛选|Filter/i.test(d)) || after.editing) break;
    }
    const dlg = after.dialogs.find((d) => /筛选|Filter/i.test(d));
    const pillsNow = key ? after.shelves[key].pills : after.shelves.encoding.pills;
    const added = pillsNow.length > before;
    let msg = `${result}\n当前${key ? SHELF_CN[shelf] : "标记卡"}：${key ? pillsNow.map(pillText).join("，") || "（空）" : pillsNow.map((p) => `${p.encoding}=${p.label}`).join("，") || "（空）"}`;
    if (!added && !dlg) msg = `⚠️ 操作后${SHELF_CN[shelf]}上没有新增胶囊，可能没成功。\n` + msg;
    if (after.editing) {
      msg += "\n⚠️ 输入胶囊仍处于编辑状态，表达式可能有误（字段名要和数据窗格完全一致，例如 [Order ID]）。已按 Escape 取消。";
      await this.b.key("Escape");
    }
    if (dlg) msg += `\n弹出了对话框「${dlg}」，需要在里面设置筛选条件后点“确定”（用 read_page 查看对话框内容）。`;
    if (after.status) msg += `\n视图状态：${after.status}`;
    return msg;
  }

  private async typeOnShelf(s: EditorState, shelf: Shelf, expression: string): Promise<string> {
    const key = this.shelfKey(shelf);
    let spot: { x: number; y: number };
    if (key) {
      const sh = s.shelves[key];
      if (!sh.rect) return `ERR:页面上找不到${SHELF_CN[shelf]}功能区（可能被折叠或隐藏）。`;
      spot = this.emptySpot(sh.rect, sh.pills, key === "columns" || key === "rows");
    } else {
      const sh = s.shelves.encoding;
      if (!sh.rect) return "ERR:找不到标记卡的胶囊区域。";
      spot = this.emptySpot(sh.rect, sh.pills, false);
    }
    // 页面刚加载完时双击可能不生效，最多试 3 次
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      if (i > 0) await sleep(1500);
      await this.hl([spot], `双击${key ? SHELF_CN[shelf] : "标记卡"}空白处，输入 ${expression}`);
      await this.b.click(spot.x, spot.y, { clickCount: 2 });
      for (let j = 0; j < 4 && !ok; j++) {
        await sleep(250);
        ok = (await this.b.wc.mainFrame.executeJavaScript(`!!document.activeElement && document.activeElement.tagName === 'TEXTAREA'`)) as boolean;
      }
    }
    if (!ok) return `ERR:双击${SHELF_CN[shelf]}后没有出现输入胶囊。可以改用 method="drag"。`;
    await sleep(400);
    const readValue = async () => (await this.b.wc.mainFrame.executeJavaScript(`(() => { const a = document.activeElement; return a && a.tagName === 'TEXTAREA' ? a.value : null; })()`)) as string | null;
    await this.b.typeText(expression);
    await sleep(200);
    if ((await readValue()) !== expression) {
      // insertText 没生效时，清空后逐字符按键输入
      await this.b.key("cmd+a");
      await this.b.key("Backspace");
      await this.b.typeKeys(expression);
      await sleep(200);
    }
    const typed = await readValue();
    if (typed !== null && typed !== expression) {
      await this.b.key("Escape");
      return `ERR:输入胶囊里的内容是「${typed}」，与期望的「${expression}」不一致，已取消。`;
    }
    await this.b.key("Enter");
    await sleep(1200);
    if (key) return `已在${SHELF_CN[shelf]}键入 ${expression}`;

    // 标记卡：新胶囊默认是“详细信息”，再把它的编码类型改成目标
    if (shelf === "detail") return `已在标记卡键入 ${expression}（详细信息）`;
    let after = await this.state();
    for (let i = 0; i < 6 && after.shelves.encoding.pills.length <= s.shelves.encoding.pills.length; i++) {
      await sleep(500);
      after = await this.state();
    }
    if (after.shelves.encoding.pills.length <= s.shelves.encoding.pills.length) return `ERR:在标记卡键入 ${expression} 后没有出现新胶囊（表达式可能有误）。`;
    if (after.editing) {
      await this.b.key("Escape");
      await sleep(300);
    }
    const pill = after.shelves.encoding.pills[after.shelves.encoding.pills.length - 1];
    return (await this.setPillEncoding(pill, shelf)) ?? `已在标记卡键入 ${expression} 并设为${SHELF_CN[shelf]}`;
  }

  // 点胶囊左侧的编码图标（下拉框），选目标编码
  private async setPillEncoding(pill: Pill, shelf: Shelf): Promise<string | null> {
    const iconX = pill.rect.x - 14;
    const iconY = pill.rect.y + pill.rect.h / 2;
    await this.hl([{ x: iconX, y: iconY }], `点左边图标，改成${SHELF_CN[shelf]}`);
    await this.b.click(iconX, iconY);
    await sleep(600);
    const re = ENCODING_NAMES[shelf]!;
    const opt = await this.find((e) => /(option|menuitem|button|radio|listitem)/.test(e.role) && re.test(e.name) && !/编码卡/.test(e.name));
    if (!opt) {
      await this.b.key("Escape");
      return `ERR:胶囊已加入（详细信息），但没找到把编码改成${SHELF_CN[shelf]}的选项。可以用 drag 把这个胶囊拖到“${SHELF_CN[shelf]}”按钮上。`;
    }
    await this.b.click(opt.x, opt.y);
    await sleep(800);
    return null;
  }

  // 解析表达式里的字段名和期望的聚合
  private parseExpr(expression: string): { field: string; agg?: string } {
    const m = expression.trim().match(/^([A-Za-z]+)\s*\(\s*\[?([^\]\)]+)\]?\s*\)$/);
    if (m) return { field: m[2].trim(), agg: m[1].toUpperCase() };
    return { field: expression.trim().replace(/^\[|\]$/g, "") };
  }

  private async dragFieldTo(s: EditorState, shelf: Shelf, expression: string): Promise<string> {
    const { field, agg } = this.parseExpr(expression);
    let f = s.fields.find((x) => x.name.toLowerCase() === field.toLowerCase());
    if (!f) return `ERR:数据窗格里没有字段「${field}」。现有字段：${s.fields.map((x) => x.name).join("、")}`;
    // 字段不在可视区域时先滚动到可见
    const vh = (await this.b.viewportSize()).h;
    if (f.rect.y < 150 || f.rect.y > vh - 60 || f.rect.h < 2) {
      await this.b.wc.mainFrame.executeJavaScript(
        `(() => { const t = [...document.querySelectorAll('[role=treeitem]')].find(e => (e.getAttribute('aria-label')||'').startsWith(${JSON.stringify(f.name + "，")})); t && t.scrollIntoView({ block: 'center' }); })()`,
      );
      await sleep(400);
      s = await this.state();
      f = s.fields.find((x) => x.name === f!.name)!;
    }
    const from = { x: f.rect.x + Math.min(40, f.rect.w / 2), y: f.rect.y + f.rect.h / 2 };
    let to: { x: number; y: number };
    const key = this.shelfKey(shelf);
    if (key) {
      const sh = s.shelves[key];
      if (!sh.rect) return `ERR:找不到${SHELF_CN[shelf]}功能区。`;
      to = this.emptySpot(sh.rect, sh.pills, key === "columns" || key === "rows");
    } else {
      const btn = s.encodingButtons.find((b) => ENCODING_NAMES[shelf]!.test(b.name));
      if (!btn) return `ERR:当前标记类型下没有“${SHELF_CN[shelf]}”按钮（现有：${s.encodingButtons.map((b) => b.name).join("、")}）。`;
      to = center(btn.rect);
    }
    await this.hl([from, to], `按住 ${f.name}，拖到${SHELF_CN[shelf]}`);
    await this.b.drag(from.x, from.y, to.x, to.y, 22);
    let msg = `已把字段 ${f.name} 拖到${SHELF_CN[shelf]}`;
    if (agg) {
      await sleep(1200);
      const fixed = await this.ensureAggregation(shelf, f.name, agg);
      if (fixed) msg += "；" + fixed;
    }
    return msg;
  }

  // 拖拽后如果聚合方式不对（比如要 COUNTD 却得到 SUM），通过胶囊菜单改
  private async ensureAggregation(shelf: Shelf, field: string, agg: string): Promise<string | null> {
    const AGG_LABEL: Record<string, RegExp> = {
      SUM: /^(总和|SUM)\(/i, AVG: /^(平均值|AVG)\(/i, COUNT: /^(计数|CNT|COUNT)\(/i, COUNTD: /^(计数\(不同\)|CNTD|COUNTD)\(/i,
      MIN: /^(最小值|MIN)\(/i, MAX: /^(最大值|MAX)\(/i, MEDIAN: /^(中位数|MEDIAN)\(/i, ATTR: /^ATTR\(/i,
      YEAR: /^(年|YEAR)\(/i, QUARTER: /^(季度|QUARTER)\(/i, MONTH: /^(月|MONTH)\(/i, DAY: /^(天|日|DAY)\(/i,
    };
    const MENU_NAME: Record<string, RegExp> = {
      SUM: /^(总和|Sum)$/, AVG: /^(平均值|Average)$/, COUNT: /^(计数|Count)$/, COUNTD: /^(计数\s*[(（]不同[)）]|Count \(Distinct\))$/,
      MIN: /^(最小值|Minimum)$/, MAX: /^(最大值|Maximum)$/, MEDIAN: /^(中位数|Median)$/, ATTR: /^(属性|Attribute)$/,
      YEAR: /^(年|Year)$/, QUARTER: /^(季度|Quarter)$/, MONTH: /^(月|Month)$/, DAY: /^(天|Day)$/,
    };
    const s = await this.state();
    const key = this.shelfKey(shelf);
    const pills = key ? s.shelves[key].pills : s.shelves.encoding.pills;
    const pill = [...pills].reverse().find((p) => p.label.toLowerCase().includes(field.toLowerCase()));
    if (!pill) return null;
    if (AGG_LABEL[agg]?.test(pill.label)) return null;
    // 胶囊菜单 → “在功能区中编辑”，把表达式改成目标聚合（顶层菜单项，比子菜单可靠）
    const menuPt = pill.menu && pill.menu.w > 0 ? center(pill.menu) : { x: pill.rect.x + pill.rect.w - 8, y: pill.rect.y + pill.rect.h / 2 };
    const expr = `${agg}([${field}])`;
    for (let attempt = 0; attempt < 2; attempt++) {
      await this.hl([menuPt], "点胶囊右侧的小三角打开菜单");
      await this.b.click(menuPt.x, menuPt.y);
      const edit = await this.waitFor((e) => /menuitem/.test(e.role) && /^(在功能区中编辑|Edit in Shelf)$/.test(e.name), 2500);
      if (!edit) {
        await this.b.key("Escape");
        continue;
      }
      await this.hl([{ x: edit.x, y: edit.y }], "选“在功能区中编辑”");
      await this.b.click(edit.x, edit.y);
      let editing = false;
      for (let i = 0; i < 8 && !editing; i++) {
        await sleep(250);
        editing = (await this.b.wc.mainFrame.executeJavaScript(`!!document.activeElement && document.activeElement.tagName === 'TEXTAREA'`)) as boolean;
      }
      if (!editing) continue;
      await sleep(300);
      await this.b.key("cmd+a");
      await this.b.typeText(expr);
      await sleep(200);
      await this.b.key("Enter");
      await sleep(1200);
      const after = await this.state();
      const pillsAfter = key ? after.shelves[key].pills : after.shelves.encoding.pills;
      if (pillsAfter.some((p) => AGG_LABEL[agg]?.test(p.label) && p.label.toLowerCase().includes(field.toLowerCase()))) {
        return `已通过“在功能区中编辑”把聚合改为 ${agg}`;
      }
      if (after.editing) await this.b.key("Escape");
    }
    return `⚠️ 没能把聚合改成 ${agg}，胶囊目前是 ${pill.label}。可以移除后用 method="type" 键入 ${expr}。`;
  }

  async removeFromShelf(shelf: Shelf, pillName?: string): Promise<string> {
    const removed: string[] = [];
    const norm = (t: string) => t.replace(/[\s\[\]]/g, "").toLowerCase();
    for (let i = 0; i < 12; i++) {
      const s = await this.state();
      const key = this.shelfKey(shelf);
      let pills = key ? s.shelves[key].pills : s.shelves.encoding.pills;
      if (!key) pills = pills.filter((p) => !p.encoding || ENCODING_NAMES[shelf]!.test(p.encoding));
      const target = pillName ? pills.find((p) => norm(p.label).includes(norm(pillName))) : pills[0];
      if (!target) break;
      const from = center(target.rect);
      const to = { x: 100, y: 480 }; // 拖回数据窗格即移除
      await this.hl([from, to], `把 ${target.label} 拖出功能区即可移除`);
      await this.b.drag(from.x, from.y, to.x, to.y, 14);
      await sleep(900);
      removed.push(target.label);
      if (pillName) break;
    }
    if (!removed.length) return pillName ? `${SHELF_CN[shelf]}上没有找到胶囊「${pillName}」。` : `${SHELF_CN[shelf]}已经是空的。`;
    return `已移除：${removed.join("、")}\n` + (await this.describeState());
  }

  async setMarkType(type: string): Promise<string> {
    const target = MARK_TYPES.find(([re]) => re.test(type.trim()))?.[1];
    if (!target) return `不认识的标记类型「${type}」。可选：${MARK_TYPES.map(([, n]) => n).join("、")}`;
    const s = await this.state();
    if (!s.markTypeRect) return "找不到标记类型下拉框。";
    if (s.markType === target) return `标记类型已经是 ${target}。`;
    const c = center(s.markTypeRect);
    let opt: UiElement | undefined;
    for (let i = 0; i < 3 && !opt; i++) {
      await this.hl([c], `点标记卡的下拉框，选“${target}”`);
      await this.b.click(c.x, c.y);
      opt = await this.waitFor((e) => e.role.startsWith("option") && e.name === target, 2500);
    }
    if (!opt) {
      await this.b.key("Escape");
      return `打开了下拉框，但没找到选项“${target}”。`;
    }
    await this.b.click(opt.x, opt.y);
    let after = await this.state();
    for (let i = 0; i < 8 && after.markType !== target; i++) {
      await sleep(400);
      after = await this.state();
    }
    return after.markType === target ? `标记类型已改为 ${target}。` : `⚠️ 选择后标记类型显示为 ${after.markType}，请检查。`;
  }

  async newWorksheet(name?: string): Promise<string> {
    const s0 = await this.state();
    const btn = await this.find((e) => e.role.startsWith("button") && /^(新建工作表|New Worksheet)/.test(e.name) && e.y > 600);
    if (!btn) return "找不到底部的“新建工作表”按钮。";
    await this.hl([{ x: btn.x, y: btn.y }], "底部“新建工作表”");
    await this.b.click(btn.x, btn.y);
    await sleep(1500);
    const s = await this.state();
    const created = s.sheets.find((t) => t.selected);
    if (!created || s.sheets.length <= s0.sheets.length) return "点击了新建工作表，但没看到新标签。";
    if (!name) return `已新建并切到工作表「${created.name}」。`;
    return this.renameSheet(created.name, name);
  }

  async renameSheet(oldName: string, newName: string): Promise<string> {
    let s = await this.state();
    const tab = s.sheets.find((t) => t.name === oldName) ?? s.sheets.find((t) => t.selected);
    if (!tab) return `找不到工作表「${oldName}」。`;
    const c = center(tab.rect);
    let ok = false;
    for (let i = 0; i < 3 && !ok; i++) {
      await this.hl([c], "双击底部标签可以重命名");
      await this.b.click(c.x, c.y, { clickCount: 2 });
      await sleep(700);
      const editing = (await this.b.wc.mainFrame.executeJavaScript(`(() => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable); })()`)) as boolean;
      if (!editing) {
        await sleep(1200);
        continue;
      }
      await this.b.key("cmd+a");
      await this.b.typeText(newName);
      await this.b.key("Enter");
      await sleep(900);
      s = await this.state();
      ok = s.sheets.some((t) => t.name === newName);
    }
    return ok ? `已切到工作表「${newName}」。` : `⚠️ 重命名为「${newName}」可能没成功，当前标签：${s.sheets.map((t) => t.name).join("、")}`;
  }

  async switchSheet(name: string): Promise<string> {
    const s = await this.state();
    const tab = s.sheets.find((t) => t.name === name) ?? s.sheets.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!tab) return `找不到工作表「${name}」。现有：${s.sheets.map((t) => t.name).join("、")}`;
    const c = center(tab.rect);
    await this.hl([c], `切到 ${tab.name}`);
    await this.b.click(c.x, c.y);
    await sleep(1200);
    return `已切到「${tab.name}」。`;
  }

  // 工具栏“下载”菜单导出当前工作表；有对话框时点里面的“下载”
  // ---------- 保存（发布到 Tableau Public）----------
  // Tableau Public 网页版没有“存到本地”，保存就是发布。这里按固定步骤做，避免助手自己反复摸索：
  // 第一次：顶栏“发布为...” → 对话框填名称 → 点对话框里的“发布”；之后：点顶栏“发布”覆盖同一个工作簿。
  // 顶栏上的提示条（例如“上次编辑已恢复……”）会盖住发布按钮：先把它们关掉
  private async dismissBanners() {
    const pts = (await this.b.wc.mainFrame.executeJavaScript(`(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1; };
      const out = [];
      for (const a of document.querySelectorAll('[role=alert],[role=status],[class*=Toast],[class*=toast],[class*=Banner],[class*=banner],[class*=Notification]')) {
        if (!vis(a)) continue;
        const btn = [...a.querySelectorAll('button,[role=button]')].find((x) => vis(x) && /关闭|Close|Dismiss|×|✕/i.test((x.getAttribute('aria-label') || x.title || x.textContent || '').trim()));
        if (btn) { const r = btn.getBoundingClientRect(); out.push({ x: r.x + r.width / 2, y: r.y + r.height / 2 }); }
      }
      return out;
    })()`)) as { x: number; y: number }[];
    for (const p of pts) {
      await this.b.click(p.x, p.y).catch(() => {});
      await sleep(300);
    }
    // 没有关闭按钮的提示条：按一次 Esc 让它收起
    if (!pts.length) await this.b.key("Escape").catch(() => {});
  }

  async publish(name: string, overwrite: boolean): Promise<{ ok: boolean; text: string }> {
    const b = this.b;
    await this.dismissBanners();
    if (overwrite) {
      const btn = await this.waitFor((e) => e.role.startsWith("button") && /^(发布|Publish)$/.test(e.name), 4000, "发布");
      if (btn) {
        await this.hl([{ x: btn.x, y: btn.y }], L("发布（覆盖保存）", "Publish (overwrite)"));
        await b.click(btn.x, btn.y);
        const done = await this.waitPublishDone(90000);
        return done ? { ok: true, text: "已覆盖保存到同一个工作簿。" } : { ok: false, text: "点了“发布”，但 90 秒内没看到完成提示。" };
      }
      // 没有“发布”按钮（例如打开的是草稿）就退回“发布为”
    }
    const asBtn = await this.waitFor((e) => e.role.startsWith("button") && /^(发布为|Publish As)/.test(e.name), 8000, "发布");
    if (!asBtn) return { ok: false, text: "没找到“发布为...”按钮，可能还没进入编辑界面。" };
    await this.hl([{ x: asBtn.x, y: asBtn.y }], L("发布为", "Publish As"));
    await b.click(asBtn.x, asBtn.y);
    // 对话框里的名称输入框
    let input: { x: number; y: number } | null = null;
    for (let i = 0; i < 20 && !input; i++) {
      await sleep(400);
      input = (await b.wc.mainFrame.executeJavaScript(`(() => {
        const d = [...document.querySelectorAll('[role=dialog]')].find((x) => /发布工作簿|Publish Workbook/.test(x.innerText));
        const i = d && d.querySelector('input[type=text], input:not([type])');
        if (!i) return null;
        const r = i.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      })()`)) as { x: number; y: number } | null;
    }
    if (!input) return { ok: false, text: "“发布工作簿”对话框没有出现。" };
    await b.click(input.x, input.y, { clickCount: 3 });
    await b.key("cmd+a").catch(() => {});
    await b.typeText(name);
    await sleep(500);
    const go = await this.waitFor((e) => e.role === "button" && /^(发布|Publish)$/.test(e.name) && e.y > 200, 5000);
    if (!go) return { ok: false, text: "对话框里的“发布”按钮不可用（名称可能没填上）。" };
    await this.hl([{ x: go.x, y: go.y }], L("发布", "Publish"));
    await b.click(go.x, go.y);
    const done = await this.waitPublishDone(120000);
    return done ? { ok: true, text: "已发布。" } : { ok: false, text: "点了“发布”，但 2 分钟内对话框没有关闭。" };
  }

  // 发布完成：对话框消失、没有“正在发布”的提示
  private async waitPublishDone(timeoutMs: number): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    await sleep(1500);
    while (Date.now() < end) {
      if (this.stopped()) return false;
      const busy = (await this.b.wc.mainFrame.executeJavaScript(`(() => {
        const t = document.body.innerText;
        const dlg = [...document.querySelectorAll('[role=dialog]')].some((x) => /发布工作簿|Publish Workbook|正在发布|Publishing/.test(x.innerText));
        return dlg || /正在发布|Publishing\.\.\./.test(t);
      })()`)) as boolean;
      if (!busy) return true;
      await sleep(1000);
    }
    return false;
  }

  // 当前登录的 Tableau Public 用户名：查一个不存在用户的隐藏作品，接口会在报错里说出“谁”在查
  async currentProfile(): Promise<string | null> {
    const msg = (await this.b.wc.mainFrame.executeJavaScript(
      `fetch('https://public.tableau.com/public/apis/workbooks?profileName=tabpilot-whoami-probe&start=0&count=1&visibility=HIDDEN',{credentials:'include'}).then(r=>r.text()).catch(()=> '')`,
    )) as string;
    const m = /"message":"([^"\s]+) can't see hidden workbooks/.exec(msg || "");
    return m ? m[1] : null;
  }

  // 在自己的作品里按名称找（先找隐藏的，再找主页上显示的）
  async findWorkbook(profile: string, title: string): Promise<{ repo: string; view: string; hidden: boolean } | null> {
    for (const vis of ["HIDDEN", "NON_HIDDEN"]) {
      const list = (await this.b.wc.mainFrame.executeJavaScript(
        `fetch('https://public.tableau.com/public/apis/workbooks?profileName=${encodeURIComponent(profile)}&start=0&count=50&visibility=${vis}',{credentials:'include'}).then(r=>r.json()).then(j=>Array.isArray(j.contents)?j.contents:[]).catch(()=>[])`,
      )) as { title: string; workbookRepoUrl: string; defaultViewRepoUrl: string }[];
      const hit = list.find((w) => w.title === title);
      if (hit) return { repo: hit.workbookRepoUrl, view: hit.defaultViewRepoUrl, hidden: vis === "HIDDEN" };
    }
    return null;
  }

  async listWorkbooks(profile: string): Promise<{ title: string; repo: string; hidden: boolean }[]> {
    const out: { title: string; repo: string; hidden: boolean }[] = [];
    for (const vis of ["HIDDEN", "NON_HIDDEN"]) {
      const list = (await this.b.wc.mainFrame.executeJavaScript(
        `fetch('https://public.tableau.com/public/apis/workbooks?profileName=${encodeURIComponent(profile)}&start=0&count=50&visibility=${vis}',{credentials:'include'}).then(r=>r.json()).then(j=>Array.isArray(j.contents)?j.contents:[]).catch(()=>[])`,
      )) as { title: string; workbookRepoUrl: string }[];
      for (const w of list) out.push({ title: w.title, repo: w.workbookRepoUrl, hidden: vis === "HIDDEN" });
    }
    return out;
  }

  async exportView(format: string): Promise<string> {
    const MAP: [RegExp, RegExp][] = [
      [/^(image|png|图像|图片)$/i, /^图像$|^Image$/],
      [/^(vector|svg|矢量图像|矢量)$/i, /^矢量图像|^Vector/],
      [/^(data|数据)$/i, /^数据$|^Data$/],
      [/^(crosstab|csv|excel|交叉表)$/i, /^交叉表|^Crosstab/],
      [/^(pdf)$/i, /^PDF/],
      [/^(ppt|pptx|powerpoint)$/i, /^PowerPoint/],
    ];
    const itemRe = MAP.find(([k]) => k.test(format.trim()))?.[1];
    if (!itemRe) return `不支持的导出格式「${format}」。可选：image、vector、data、crosstab、pdf、powerpoint`;
    const since = Date.now();
    let item: UiElement | undefined;
    for (let i = 0; i < 3 && !item; i++) {
      const btn = await this.waitFor((e) => e.role.startsWith("button") && /^(下载|Download)$/.test(e.name) && e.y < 120, 5000);
      if (!btn) return "工具栏上没有找到“下载”按钮（需要在工作表编辑界面）。";
      await this.hl([{ x: btn.x, y: btn.y }], "工具栏“下载”");
      await this.b.click(btn.x, btn.y);
      item = await this.waitFor((e) => /menuitem/.test(e.role) && itemRe.test(e.name), 2500);
    }
    if (!item) return "打开“下载”菜单后没找到对应选项。";
    await this.hl([{ x: item.x, y: item.y }], `选“${item.name}”`);
    await this.b.click(item.x, item.y);
    // 部分格式会弹对话框，里面有“下载”按钮
    for (let i = 0; i < 12; i++) {
      await sleep(700);
      const d = await this.b.waitDownload(since, 10);
      if (d) break;
      const list = await this.b.readElements();
      const inDialog = list.find((e) => e.role.startsWith("button") && /^(下载|Download|导出|Export)$/.test(e.name) && e.y > 120);
      if (inDialog) {
        await this.hl([{ x: inDialog.x, y: inDialog.y }], "对话框里点“下载”");
        await this.b.click(inDialog.x, inDialog.y);
        break;
      }
    }
    const d = await this.b.waitDownload(since, 60000);
    if (!d) return "已选择导出，但 60 秒内没有检测到下载完成，请截图查看是否有对话框需要处理。";
    if (d.state !== "completed") return `下载没有完成（${d.state}）。`;
    return `已导出到：${d.path}`;
  }

}
