// 右侧 Tableau 页面的控制层：通过 CDP 发送真实的鼠标/键盘事件、截图，并在各个 frame 里读取页面结构
import { nativeImage, WebContents, WebFrameMain } from "electron";
import fs from "fs";
import { CMD_MODIFIER_BIT } from "./platform";
import path from "path";

export interface UiElement {
  id: number;
  role: string;
  name: string;
  x: number; // 中心点，CSS 像素，相对右侧页面视口
  y: number;
  w: number;
  h: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 在页面里执行：收集可见、有名字的元素
const SCAN_SCRIPT = `(() => {
  const out = [];
  const seen = new Set();
  const vw = window.innerWidth, vh = window.innerHeight;
  const interactiveRoles = /button|link|tab|menuitem|option|checkbox|radio|combobox|textbox|listitem|treeitem|row|gridcell|cell|switch|slider|searchbox|spinbutton|heading|dialog|alert|region|group|img|list|tree|toolbar|tooltip|status/;
  const all = document.querySelectorAll('*');
  for (const el of all) {
    if (out.length > 2500) break;
    if (el.closest('#__tai_cursor')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw) continue;
    const role = el.getAttribute('role') || '';
    const tag = el.tagName.toLowerCase();
    const aria = el.getAttribute('aria-label') || '';
    const title = el.getAttribute('title') || '';
    const placeholder = el.getAttribute('placeholder') || '';
    const isInteractive = /^(button|a|input|select|textarea|option|summary|label)$/.test(tag) || interactiveRoles.test(role) || el.hasAttribute('tabindex') || el.hasAttribute('draggable') && el.getAttribute('draggable') === 'true';
    let text = '';
    // 只取直接文本，避免父元素重复整段文字
    for (const n of el.childNodes) if (n.nodeType === 3) text += n.textContent;
    text = text.replace(/\\s+/g, ' ').trim();
    let name = aria || title || placeholder || text;
    if (!name && tag === 'input') name = el.value || '';
    if (!name && isInteractive) {
      const t = (el.innerText || '').replace(/\\s+/g, ' ').trim();
      if (t.length <= 60) name = t;
    }
    if (!name) continue;
    if (!isInteractive && !text) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || st.display === 'none' || Number(st.opacity) === 0) continue;
    // 被遮挡的元素跳过
    const cx = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1), cy = Math.min(Math.max(r.top + r.height / 2, 0), vh - 1);
    const top = document.elementFromPoint(cx, cy);
    if (top && top !== el && !el.contains(top) && !top.contains(el)) {
      if (!(top.tagName === 'IFRAME')) continue;
    }
    name = name.slice(0, 120);
    const key = name + '|' + Math.round(cx) + '|' + Math.round(cy);
    if (seen.has(key)) continue;
    seen.add(key);
    let state = [];
    if (el.getAttribute('aria-selected') === 'true') state.push('selected');
    if (el.getAttribute('aria-checked') === 'true') state.push('checked');
    if (el.getAttribute('aria-expanded') === 'true') state.push('expanded');
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') state.push('disabled');
    if (document.activeElement === el) state.push('focused');
    out.push({ role: (role || tag) + (state.length ? '[' + state.join(',') + ']' : ''), name, x: Math.round(cx), y: Math.round(cy), w: Math.round(r.width), h: Math.round(r.height) });
  }
  return out;
})()`;

// 在父 frame 里列出 iframe 的位置，用于换算子 frame 坐标
const IFRAMES_SCRIPT = `(() => Array.from(document.querySelectorAll('iframe')).map(f => { const r = f.getBoundingClientRect(); const cs = getComputedStyle(f); return { src: f.src, name: f.name, x: r.left + parseFloat(cs.borderLeftWidth||0) + parseFloat(cs.paddingLeft||0), y: r.top + parseFloat(cs.borderTopWidth||0) + parseFloat(cs.paddingTop||0), w: r.width, h: r.height }; }))()`;

export class TableauBrowser {
  private attached = false;
  private lastElements: UiElement[] = [];
  private lastShotScale = 1;
  private fileChooserPending: { backendNodeId: number; mode: string } | null = null;
  private intercepting = false;

  downloads: { path: string; state: "progress" | "completed" | "cancelled" | "interrupted"; at: number }[] = [];

  constructor(public wc: WebContents) {}

  downloadStarted(p: string) {
    this.downloads.push({ path: p, state: "progress", at: Date.now() });
  }

  downloadFinished(p: string, state: "completed" | "cancelled" | "interrupted") {
    const d = this.downloads.find((x) => x.path === p);
    if (d) d.state = state;
  }

  // 等待某个时间点之后开始的下载完成
  async waitDownload(since: number, timeoutMs: number): Promise<{ path: string; state: string } | null> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const d = this.downloads.find((x) => x.at >= since && x.state !== "progress");
      if (d) return d;
      await sleep(400);
    }
    return this.downloads.find((x) => x.at >= since) ?? null;
  }

  private listening = false;

  async ensureAttached() {
    if (this.attached && this.wc.debugger.isAttached()) return;
    if (!this.wc.debugger.isAttached()) this.wc.debugger.attach("1.3");
    // 监听器只注册一次（重新连接时不重复注册）
    if (!this.listening) {
      this.listening = true;
      this.wc.debugger.on("message", (_e, method, params) => {
        if (method === "Page.fileChooserOpened") {
          this.fileChooserPending = { backendNodeId: params.backendNodeId, mode: params.mode };
        }
      });
      this.wc.debugger.on("detach", () => {
        this.attached = false;
        this.intercepting = false;
      });
    }
    await this.cmd("Page.enable");
    await this.cmd("Runtime.enable");
    await this.cmd("DOM.enable");
    this.attached = true;
  }

  async cmd<T = any>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    if (!this.wc.debugger.isAttached()) {
      this.attached = false;
      await this.ensureAttached();
    }
    return (await this.wc.debugger.sendCommand(method, params)) as T;
  }

  scale() {
    return this.lastShotScale;
  }

  async viewportSize(): Promise<{ w: number; h: number }> {
    const m = await this.cmd("Page.getLayoutMetrics");
    const v = m.cssVisualViewport ?? m.layoutViewport;
    return { w: Math.round(v.clientWidth), h: Math.round(v.clientHeight) };
  }

  // 截图：限制最长边，返回 PNG base64，并记录缩放比例以便把截图坐标换算回页面坐标
  async screenshot(maxEdge = 1440): Promise<{ data: string; width: number; height: number; scale: number }> {
    await this.ensureAttached();
    const { w, h } = await this.viewportSize();
    const scale = Math.min(1, maxEdge / Math.max(w, h));
    // 发给模型的截图用 JPEG，体积约为 PNG 的三分之一，长任务里历史不会膨胀太快
    // 不带 clip/scale 截图：带缩放的 clip 会让 Chromium 临时改设备尺寸重排页面，右侧画面会闪一下。
    // 按原尺寸截下来，再在主进程里缩小
    const res = await this.cmd("Page.captureScreenshot", { format: "jpeg", quality: 80, captureBeyondViewport: false });
    this.lastShotScale = scale;
    const width = Math.round(w * scale);
    const height = Math.round(h * scale);
    let img = nativeImage.createFromBuffer(Buffer.from(res.data, "base64"));
    if (img.getSize().width !== width) img = img.resize({ width, height, quality: "good" });
    return { data: img.toJPEG(75).toString("base64"), width, height, scale };
  }

  toPage(x: number, y: number, space: "screenshot" | "page" = "screenshot") {
    if (space === "page") return { x, y };
    return { x: x / this.lastShotScale, y: y / this.lastShotScale };
  }

  // 窗口在后台时页面拿不到焦点，第一下点击会被当成“激活”吞掉；每次输入前先给右侧页面焦点
  focusPage() {
    if (!this.wc.isFocused()) this.wc.focus();
  }

  private async mouse(type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
    if (type === "mouseMoved" || type === "mousePressed") this.focusPage();
    await this.cmd("Input.dispatchMouseEvent", { type, x, y, pointerType: "mouse", ...extra });
  }

  async move(x: number, y: number) {
    await this.ensureAttached();
    await this.mouse("mouseMoved", x, y, { button: "none" });
  }

  async click(x: number, y: number, opts: { button?: "left" | "right"; clickCount?: number; modifiers?: number } = {}) {
    await this.ensureAttached();
    const button = opts.button ?? "left";
    const count = opts.clickCount ?? 1;
    const modifiers = opts.modifiers ?? 0;
    // 先从旁边移进来再停一下，触发悬停状态；有些控件只响应“悬停后”的点击
    await this.mouse("mouseMoved", x - 6, y - 3, { button: "none", modifiers });
    await sleep(30);
    await this.mouse("mouseMoved", x, y, { button: "none", modifiers });
    await sleep(120);
    void this.cursor({ x, y, press: true });
    for (let i = 1; i <= count; i++) {
      await this.mouse("mousePressed", x, y, { button, clickCount: i, buttons: button === "left" ? 1 : 2, modifiers });
      await sleep(70);
      await this.mouse("mouseReleased", x, y, { button, clickCount: i, buttons: 0, modifiers });
      if (i < count) await sleep(60);
    }
  }

  async drag(x1: number, y1: number, x2: number, y2: number, steps = 18) {
    await this.ensureAttached();
    await this.mouse("mouseMoved", x1, y1, { button: "none" });
    await sleep(60);
    await this.mouse("mousePressed", x1, y1, { button: "left", clickCount: 1, buttons: 1 });
    await sleep(150);
    // 先小幅移动，触发拖拽开始
    for (let i = 1; i <= 4; i++) {
      await this.mouse("mouseMoved", x1 + i * 2, y1 + i * 2, { button: "left", buttons: 1 });
      await sleep(30);
    }
    void this.cursor({ x: x1, y: y1, press: true });
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const mx = x1 + (x2 - x1) * t;
      const my = y1 + (y2 - y1) * t;
      await this.mouse("mouseMoved", mx, my, { button: "left", buttons: 1 });
      if (i % 3 === 0 || i === steps) void this.cursor({ x: mx, y: my, instant: true });
      await sleep(25);
    }
    // 在目标处停留，让落点高亮
    for (let i = 0; i < 4; i++) {
      await this.mouse("mouseMoved", x2 + (i % 2), y2, { button: "left", buttons: 1 });
      await sleep(60);
    }
    await this.mouse("mouseReleased", x2, y2, { button: "left", clickCount: 1, buttons: 0 });
  }

  async scroll(x: number, y: number, dx: number, dy: number) {
    await this.ensureAttached();
    await this.mouse("mouseWheel", x, y, { deltaX: dx, deltaY: dy });
  }

  async typeText(text: string) {
    await this.ensureAttached();
    this.focusPage();
    await this.cmd("Input.insertText", { text });
  }

  // 逐字符发送按键事件（有些输入框不认 insertText 时使用）
  async typeKeys(text: string) {
    await this.ensureAttached();
    for (const ch of text) {
      await this.cmd("Input.dispatchKeyEvent", { type: "keyDown", text: ch, unmodifiedText: ch, key: ch });
      await this.cmd("Input.dispatchKeyEvent", { type: "keyUp", key: ch });
      await sleep(8);
    }
  }

  async key(combo: string) {
    await this.ensureAttached();
    const parts = combo.split("+").map((p) => p.trim());
    const keyName = parts.pop()!;
    let modifiers = 0;
    for (const m of parts.map((p) => p.toLowerCase())) {
      if (m === "alt" || m === "option") modifiers |= 1;
      else if (m === "ctrl" || m === "control") modifiers |= 2;
      else if (m === "cmd" || m === "meta" || m === "command") modifiers |= CMD_MODIFIER_BIT;
      else if (m === "shift") modifiers |= 8;
    }
    const def = keyDef(keyName);
    this.focusPage();
    const base = { modifiers, key: def.key, code: def.code, windowsVirtualKeyCode: def.keyCode, nativeVirtualKeyCode: def.keyCode };
    const text = modifiers & ~8 ? undefined : def.text;
    await this.cmd("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, text, unmodifiedText: text });
    await sleep(20);
    await this.cmd("Input.dispatchKeyEvent", { type: "keyUp", ...base });
  }

  // 读取所有 frame 里的可见元素，坐标统一换算到顶层页面
  async readElements(query?: string): Promise<UiElement[]> {
    await this.ensureAttached();
    const results: Omit<UiElement, "id">[] = [];
    const visit = async (frame: WebFrameMain, ox: number, oy: number, depth: number) => {
      let items: any[] = [];
      try {
        items = (await frame.executeJavaScript(SCAN_SCRIPT)) as any;
      } catch {
        return;
      }
      for (const it of items) results.push({ ...it, x: it.x + ox, y: it.y + oy });
      if (depth > 3 || frame.frames.length === 0) return;
      let iframes: any[] = [];
      try {
        iframes = (await frame.executeJavaScript(IFRAMES_SCRIPT)) as any;
      } catch {
        iframes = [];
      }
      const used = new Set<number>();
      for (const child of frame.frames) {
        let idx = iframes.findIndex((f, i) => !used.has(i) && f.name && f.name === child.name);
        if (idx < 0) idx = iframes.findIndex((f, i) => !used.has(i) && f.src && child.url && (f.src === child.url || child.url.startsWith(f.src)));
        if (idx < 0) idx = iframes.findIndex((_f, i) => !used.has(i));
        if (idx < 0) continue;
        used.add(idx);
        const f = iframes[idx];
        if (f.w < 2 || f.h < 2) continue;
        await visit(child, ox + f.x, oy + f.y, depth + 1);
      }
    };
    await visit(this.wc.mainFrame, 0, 0, 0);
    let list = results;
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((e) => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q));
    }
    this.lastElements = list.map((e, i) => ({ id: i + 1, ...e }));
    return this.lastElements;
  }

  elementById(id: number): UiElement | undefined {
    return this.lastElements.find((e) => e.id === id);
  }

  // 返回某个页面坐标处元素的描述（用于发布/保存等危险操作的拦截）
  async describeAt(x: number, y: number): Promise<string> {
    const hits = await this.readElementsAt(x, y);
    return hits;
  }

  private async readElementsAt(x: number, y: number): Promise<string> {
    // 在顶层和各 frame 里都试一下 elementFromPoint，拼出文字
    const script = (px: number, py: number) => `(() => { let el = document.elementFromPoint(${px}, ${py}); const parts = []; for (let i = 0; el && i < 4; i++, el = el.parentElement) { parts.push([el.getAttribute('aria-label'), el.getAttribute('title'), (el.innerText||'').slice(0,80)].filter(Boolean).join(' ')); } return parts.join(' / '); })()`;
    const texts: string[] = [];
    try {
      texts.push((await this.wc.mainFrame.executeJavaScript(script(x, y))) as string);
    } catch {}
    try {
      const iframes: any[] = (await this.wc.mainFrame.executeJavaScript(IFRAMES_SCRIPT)) as any;
      for (const child of this.wc.mainFrame.frames) {
        const f = iframes.find((fr) => (fr.name && fr.name === child.name) || (fr.src && child.url.startsWith(fr.src)));
        if (!f) continue;
        if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) {
          try {
            texts.push((await child.executeJavaScript(script(x - f.x, y - f.y))) as string);
          } catch {}
        }
      }
    } catch {}
    return texts.join(" | ");
  }

  async evalInFrames(script: string): Promise<{ url: string; result: unknown }[]> {
    const out: { url: string; result: unknown }[] = [];
    for (const frame of this.wc.mainFrame.framesInSubtree) {
      try {
        out.push({ url: frame.url, result: await frame.executeJavaScript(script) });
      } catch (e) {
        out.push({ url: frame.url, result: "ERR " + String(e) });
      }
    }
    return out;
  }

  // 上传文件：拦截系统文件选择框，直接把文件塞给 <input type=file>
  async armFileChooser() {
    await this.ensureAttached();
    if (!this.intercepting) {
      await this.cmd("Page.setInterceptFileChooserDialog", { enabled: true });
      this.intercepting = true;
    }
    this.fileChooserPending = null;
  }

  async waitFileChooser(timeoutMs = 8000): Promise<boolean> {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      if (this.fileChooserPending) return true;
      await sleep(150);
    }
    return false;
  }

  async fulfillFileChooser(filePath: string) {
    if (!this.fileChooserPending) throw new Error("没有检测到文件选择框");
    const { backendNodeId } = this.fileChooserPending;
    this.fileChooserPending = null;
    await this.cmd("DOM.setFileInputFiles", { files: [filePath], backendNodeId });
  }

  async disarmFileChooser() {
    if (this.intercepting) {
      try {
        await this.cmd("Page.setInterceptFileChooserDialog", { enabled: false });
      } catch {}
      this.intercepting = false;
    }
  }

  // 兜底：直接找页面里的 <input type=file> 设置文件
  async setFileOnAnyInput(filePath: string): Promise<boolean> {
    await this.ensureAttached();
    const doc = await this.cmd("DOM.getDocument", { depth: -1, pierce: true });
    const found = await this.cmd("DOM.querySelectorAll", { nodeId: doc.root.nodeId, selector: "input[type=file]" });
    if (!found.nodeIds?.length) return false;
    await this.cmd("DOM.setFileInputFiles", { files: [filePath], nodeId: found.nodeIds[found.nodeIds.length - 1] });
    return true;
  }

  // 操作光标：紫色箭头 + 70% 不透明的“TabPilot”名牌（不随模型变，不写 AI），画在页面最上层、不拦截鼠标，约 1 秒无动作后淡出；教程模式停留更久。
  static agentName = "TabPilot";

  private async cursor(op: { x?: number; y?: number; press?: boolean; caption?: string; tutorial?: boolean; instant?: boolean }) {
    const script = `(() => {
      const op = ${JSON.stringify({ ...op, name: TableauBrowser.agentName })};
      let root = document.getElementById('__tai_cursor');
      if (!root) {
        root = document.createElement('div');
        root.id = '__tai_cursor';
        root.setAttribute('aria-hidden', 'true');
        root.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483647;transition:transform .32s cubic-bezier(.3,.7,.2,1),opacity .25s;opacity:0;will-change:transform';
        root.innerHTML = '<style>#__tai_cursor *{pointer-events:none;box-sizing:border-box}#__tai_cursor .p{transform-origin:2px 2px;transition:transform .12s}#__tai_cursor.press .p{transform:scale(.8)}#__tai_cursor .tag{position:absolute;left:14px;top:18px;display:flex;align-items:center;gap:4px;white-space:nowrap;background:linear-gradient(135deg,#7c5cff,#27c6f2);color:#fff;font:600 11px/18px -apple-system,PingFang SC,sans-serif;padding:0 9px 0 3px;border-radius:99px;box-shadow:0 4px 12px rgba(124,92,255,.45)}#__tai_cursor .tag b{width:14px;height:14px;border-radius:50%;background:#fff;color:#7c5cff;font-size:8px;line-height:14px;text-align:center}#__tai_cursor .cap{position:absolute;left:14px;top:42px;max-width:260px;width:max-content;background:rgba(28,27,51,.92);color:#fff;font:13px/1.45 -apple-system,PingFang SC,sans-serif;padding:6px 10px;border-radius:10px;box-shadow:0 6px 18px rgba(0,0,0,.25);display:none}</style>' +
          '<svg class="p" width="20" height="24" viewBox="0 0 22 26" style="position:absolute;left:-2px;top:-2px;filter:drop-shadow(0 3px 6px rgba(60,40,160,.4))"><path d="M2 2l16 10-7 2-3 7z" fill="#7c5cff" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>' +
          '<div class="tag" style="opacity:.7;padding-left:9px"><span class="nm"></span></div><div class="cap" style="display:none"></div>';
        document.documentElement.appendChild(root);
      }
      root.querySelector('.nm').textContent = op.name;
      if (typeof op.x === 'number') {
        // 名牌靠右边缘时翻到左侧，避免被裁掉
        const flip = op.x > innerWidth - 200;
        root.querySelector('.tag').style.left = flip ? 'auto' : '14px';
        root.querySelector('.tag').style.right = flip ? '6px' : 'auto';
        root.querySelector('.cap').style.left = flip ? 'auto' : '14px';
        root.querySelector('.cap').style.right = flip ? '6px' : 'auto';
        root.style.transition = op.instant ? 'opacity .25s' : 'transform .32s cubic-bezier(.3,.7,.2,1),opacity .25s';
        root.style.transform = 'translate(' + op.x + 'px,' + op.y + 'px)';
      }
      const cap = root.querySelector('.cap');
      // 按用户要求光标旁边不显示任何文字，说明都放在左侧聊天里
      cap.style.display = 'none';
      root.style.opacity = '1';
      if (op.press) { root.classList.add('press'); setTimeout(() => root.classList.remove('press'), 160); }
      clearTimeout(window.__tai_cur_t);
      window.__tai_cur_t = setTimeout(() => { root.style.opacity = '0'; }, op.tutorial ? 4000 : 1100);
    })()`;
    try {
      await this.wc.mainFrame.executeJavaScript(script);
    } catch {
      // 页面切换中，忽略
    }
  }

  // 操作前先把 AI 光标移到目标（拖拽时移到起点），教程模式下显示这一步的说明
  async highlight(points: { x: number; y: number }[], label: string, tutorial: boolean) {
    const p = points[0];
    await this.cursor({ x: p.x, y: p.y, caption: tutorial ? label : "", tutorial });
    await sleep(tutorial ? 450 : 260); // 等光标滑过去
  }

  // 判断右侧页面在账户/登录流程的哪一步（只读，不点击、不读输入框内容）
  async authState(): Promise<{ state: string; url: string; title: string; expired?: boolean }> {
    const url = this.wc.getURL();
    const script = `(() => {
      const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 && getComputedStyle(el).visibility !== 'hidden'; };
      const text = (document.body && document.body.innerText || '').slice(0, 20000);
      const btn = (re) => [...document.querySelectorAll('button,a,[role=button]')].some(b => vis(b) && re.test((b.getAttribute('aria-label') || b.textContent || '').trim()));
      const pwd = [...document.querySelectorAll('input[type=password]')].some(vis);
      const email = [...document.querySelectorAll('input[type=email],input[name*=mail i],input[autocomplete=username]')].some(vis);
      const code = [...document.querySelectorAll('input[autocomplete=one-time-code],input[name*=code i],input[inputmode=numeric]')].some(vis);
      return {
        cookie: /cookie/i.test(text) && btn(/接受所有 Cookie|Accept All Cookies|接受全部|Accept/i),
        signedIn: btn(/切换用户选项菜单|User options|用户选项|Account menu/i) || !!document.getElementById('shelf-columns'),
        signInBtn: btn(/^(Sign In|登录)$/),
        signUpBtn: btn(/^(Sign Up|注册)$/),
        pwd, email, code,
        verifyText: /(验证码|verification code|verify your email|验证您的电子邮件|check your email|查看您的邮箱)/i.test(text),
        signupText: /(create (an |your )?account|创建(您的)?帐户|创建账户|注册 Tableau)/i.test(text),
        editor: !!document.getElementById('shelf-columns'),
        // 未保存的 Web 制作草稿在 Tableau 服务器上过期后，重新打开会报“意外错误 / Failed to fetch”
        missing: /(找不到(该|此|这个)?(页面|作品|可视化)|页面不存在|Page Not Found|can'?t find (that|this) (page|viz)|no longer available|已被删除)/i.test(text),
        broken: /(意外错误|Unexpected error|Failed to fetch|something has gone wrong rendering|会话已过期|session (has )?expired|无法(打开|加载)(此|该)?工作簿|could not (open|load) (the |this )?workbook)/i.test(text),
        title: document.title,
      };
    })()`;
    let r: any = {};
    try {
      r = await this.wc.mainFrame.executeJavaScript(script);
    } catch {
      return { state: "loading", url, title: "" };
    }
    let state = "other";
    if (r.cookie) state = "cookie-banner";
    // 过期草稿有两种表现：停在 newWorkbook 页报“意外错误”，或被跳到 viz_load_error.html
    else if (!r.editor && (/\/viz_load_error\.html/i.test(url) || (r.broken && /\/newWorkbook\//i.test(url)))) state = "draft-lost";
    else if ((r.missing || r.broken) && !r.editor && /\/(authoring|viz)\//i.test(url)) state = "published-lost";
    else if (r.editor) state = "authoring";
    else if (r.code || r.verifyText) state = "verify";
    else if (r.signupText && (r.pwd || r.email)) state = "signup-page";
    else if (r.pwd || (r.email && /login|signin|sso|auth/i.test(url))) state = "login-page";
    else if (r.signedIn && !r.signInBtn) state = "signed-in";
    else if (r.signInBtn) state = "signed-out";
    return { state, url, title: r.title ?? "" };
  }

  // 只移动 AI 光标指向某个元素（不点击），用于登录教程里提示“点这里”
  async pointAt(query: string, caption: string): Promise<boolean> {
    const q = query.toLowerCase();
    const list = await this.readElements();
    const el = list.find((e) => e.name.toLowerCase() === q) ?? list.find((e) => e.name.toLowerCase().includes(q));
    if (!el) return false;
    await this.cursor({ x: el.x, y: el.y + Math.min(el.h / 2, 12), caption, tutorial: true });
    return true;
  }

  saveDebugShot(dir: string, name: string, data: string) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name), Buffer.from(data, "base64"));
  }
}

function keyDef(name: string): { key: string; code: string; keyCode: number; text?: string } {
  const n = name.toLowerCase();
  const table: Record<string, { key: string; code: string; keyCode: number; text?: string }> = {
    enter: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
    return: { key: "Enter", code: "Enter", keyCode: 13, text: "\r" },
    escape: { key: "Escape", code: "Escape", keyCode: 27 },
    esc: { key: "Escape", code: "Escape", keyCode: 27 },
    tab: { key: "Tab", code: "Tab", keyCode: 9 },
    backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
    delete: { key: "Delete", code: "Delete", keyCode: 46 },
    space: { key: " ", code: "Space", keyCode: 32, text: " " },
    arrowup: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    arrowdown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    arrowleft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    arrowright: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    up: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    down: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    left: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    right: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    home: { key: "Home", code: "Home", keyCode: 36 },
    end: { key: "End", code: "End", keyCode: 35 },
    pageup: { key: "PageUp", code: "PageUp", keyCode: 33 },
    pagedown: { key: "PageDown", code: "PageDown", keyCode: 34 },
  };
  if (table[n]) return table[n];
  if (name.length === 1) {
    const upper = name.toUpperCase();
    const isLetter = /[a-z]/i.test(name);
    const isDigit = /[0-9]/.test(name);
    return {
      key: name,
      code: isLetter ? "Key" + upper : isDigit ? "Digit" + name : "",
      keyCode: isLetter || isDigit ? upper.charCodeAt(0) : name.charCodeAt(0),
      text: name,
    };
  }
  if (/^f\d{1,2}$/.test(n)) return { key: name.toUpperCase(), code: name.toUpperCase(), keyCode: 111 + Number(n.slice(1)) };
  return { key: name, code: name, keyCode: 0 };
}
