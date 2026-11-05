/* global api */
const $ = (id) => document.getElementById(id);
const log = $("log");
const input = $("input");
let running = false;
let currentAi = null;
let currentThinking = null;
let currentSteps = null;
let attachments = []; // {kind:'image', name, data(base64), mediaType} | {kind:'file', name, path}
const stepNodes = new Map();
let usage = { model: "", input: 0, output: 0, cacheRead: 0 };
const fmt = (n) => n.toLocaleString("zh-CN");

const VERBS = {
  screenshot: "截图查看",
  read_page: "读取页面元素",
  click: "点击",
  drag: "拖拽",
  type_text: "输入",
  key: "按键",
  scroll: "滚动",
  wait: "等待",
  open_url: "打开",
  tableau_state: "检查工作表状态",
  add_to_shelf: "放到",
  remove_from_shelf: "从功能区移除",
  set_mark_type: "标记类型改为",
  new_worksheet: "新建工作表",
  upload_file: "上传数据",
  parse_workbook: "解析工作簿",
  inspect_data_file: "分析数据文件",
  ask_user: "询问你",
};
const INTERNAL_TOOLS = new Set(["screenshot", "read_page", "tableau_state", "wait", "scroll"]);
const SHELF_NAMES = { columns: "列", rows: "行", filters: "筛选器", pages: "页面", color: "颜色", size: "大小", label: "标签", detail: "详细信息", tooltip: "工具提示", shape: "形状", path: "路径", angle: "角度" };

const IS_WIN = /Windows/i.test(navigator.userAgent);
const el = (tag, cls, text) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
};

function scrollDown() {
  log.scrollTop = log.scrollHeight;
  updateFade();
}
// 只在上方/下方还有内容被滚出去时，才给对应边缘加渐隐
function updateFade() {
  const top = log.scrollTop > 2;
  const bottom = log.scrollHeight - log.scrollTop - log.clientHeight > 2;
  log.style.setProperty("--mt", top ? "20px" : "0px");
  log.style.setProperty("--mb", bottom ? "20px" : "0px");
}
log.addEventListener("scroll", updateFade, { passive: true });
window.addEventListener("resize", updateFade);
new ResizeObserver(updateFade).observe(log);
function add(node) {
  $("welcome")?.remove();
  if (liveNode && liveNode.parentNode === log) log.insertBefore(node, liveNode);
  else log.appendChild(node);
  scrollDown();
  return node;
}

function pill(expr) {
  const isMeasure = /^\s*(SUM|AVG|COUNTD?|CNTD?|MIN|MAX|MEDIAN|ATTR|STDEV|VAR|AGG)\s*\(/i.test(expr) || /^[\d.]+$/.test(expr);
  return el("span", "pill " + (isMeasure ? "mea" : "dim"), expr);
}
const basename = (p) => String(p).split(/[\\/]/).pop();

function stepDetail(name, inp) {
  const d = el("span", "detail");
  if (!inp || typeof inp !== "object") return d;
  if (name === "add_to_shelf") {
    d.append(el("span", "shelf-name", SHELF_NAMES[inp.shelf] || inp.shelf), pill(inp.expression));
    if (inp.method === "drag") d.append(el("span", "shelf-name", "拖拽"));
  } else if (name === "remove_from_shelf") {
    d.append(el("span", "shelf-name", SHELF_NAMES[inp.shelf] || inp.shelf));
    if (inp.pill) d.append(pill(inp.pill));
  } else if (name === "click") {
    d.textContent = (inp.element_id ? `元素 #${inp.element_id}` : `(${Math.round(inp.x)}, ${Math.round(inp.y)})`) + (inp.double ? "，双击" : "") + (inp.button === "right" ? "，右键" : "");
  } else if (name === "drag") {
    const f = inp.from_element_id ? `#${inp.from_element_id}` : inp.from ? `(${Math.round(inp.from.x)}, ${Math.round(inp.from.y)})` : "";
    const t = inp.to_element_id ? `#${inp.to_element_id}` : inp.to ? `(${Math.round(inp.to.x)}, ${Math.round(inp.to.y)})` : "";
    d.textContent = `${f} 到 ${t}`;
  } else if (name === "upload_file" || name === "parse_workbook" || name === "inspect_data_file") d.textContent = basename(inp.path);
  else if (name === "wait") d.textContent = `${inp.seconds} 秒`;
  else if (name === "key") d.textContent = inp.combo;
  else if (name === "type_text") d.textContent = `“${inp.text}”`;
  else if (name === "set_mark_type") d.textContent = inp.mark_type;
  else if (name === "read_page" && inp.query) d.textContent = `“${inp.query}”`;
  else if (name === "open_url") d.textContent = inp.url;
  else if (name === "new_worksheet" && inp.name) d.textContent = inp.name;
  else if (name === "ask_user") d.textContent = "";
  return d;
}

// ---------- 进行中状态：脉冲点 + 当前步骤 + 计时 + 步骤小标签（参考 animate-ui 脉冲点，MIT，CSS 重写） ----------
let liveNode = null;
let liveTimer = 0;
let liveStart = 0;
let liveSteps = [];
function liveEl(cls) {
  return liveNode && liveNode.querySelector(cls);
}
function liveRenderChips() {
  const h = liveEl(".lhist");
  if (!h) return;
  const done = liveSteps.filter((x) => x.state !== "run").slice(-3);
  const en = i18n.lang() === "en";
  h.textContent = done.length ? i18n.t("已完成：") + done.map((x) => i18n.t(x.verb) + (x.det ? " " + (i18n.t(x.det)) : "")).join(en ? ", " : "、") : "";
}
function liveBegin() {
  if (liveNode) return;
  liveSteps = [];
  liveStart = Date.now();
  liveNode = el("div", "live");
  const now = el("div", "lnow");
  now.append(el("span", "lt shiny", "正在斟酌…"), el("span", "ls", "0s"));
  liveNode.append(now, el("div", "lhist"));
  $("welcome")?.remove();
  log.appendChild(liveNode);
  clearInterval(liveTimer);
  liveTimer = setInterval(() => {
    const e = liveEl(".ls");
    if (e) e.textContent = Math.floor((Date.now() - liveStart) / 1000) + "s";
  }, 500);
  scrollDown();
}
function liveText(t, waiting) {
  const e = liveEl(".lt");
  if (e) e.textContent = t;
  if (e) {
    e.classList.toggle("shiny", !waiting);
    e.classList.toggle("waiting", !!waiting);
  }
}
function liveEnd() {
  if (!liveNode) return;
  clearInterval(liveTimer);
  const node = liveNode;
  const n = liveSteps.length;
  const lt = node.querySelector(".lt");
  lt.textContent = n ? `已完成 ${n} 步` : "完成";
  lt.className = "lt done";
  node.querySelector(".ls").textContent = Math.floor((Date.now() - liveStart) / 1000) + "s";
  liveNode = null;
  setTimeout(() => {
    node.classList.add("out");
    setTimeout(() => node.remove(), 220);
  }, 2000);
}
function setRunning(v, text) {
  running = v;
  if (v) liveBegin();
  else liveEnd();
  const b = $("btnSend");
  b.textContent = v ? "停止" : "发送";
  b.className = "btn " + (v ? "stop" : "primary");
  setStatus(text ?? (v ? "正在操作 Tableau…" : ""), v);
}
function setStatus(text, busy) {
  const s = $("status");
  // 进行中的状态只在对话区的闪光行里显示；输入栏左边只留“正在听…”这类非运行提示
  if (running && !listening) text = "";
  s.textContent = text;
  s.classList.toggle("busy", !!busy);
}

// ---------- 发送 ----------
async function send(text) {
  text = (text ?? input.value).trim();
  if (running) return;
  if (!text && attachments.length === 0) return;
  if (!$("coach").classList.contains("hidden")) endCoach();
  await flushPendingReset();
  const bubble = el("div", "msg user", text || "（附件）");
  if (attachments.length) {
    const row = el("div", "attach-row in-bubble");
    for (const a of attachments) row.append(attachChip(a, false));
    bubble.append(row);
  }
  add(bubble);
  const tutorial = $("tutorial").checked;
  if (tutorial) bubble.append(el("span", "mode", "教我做：开启"));
  const payload = {
    tutorial,
    lang: i18n.lang(),
    text,
    images: attachments.filter((a) => a.kind === "image").map((a) => ({ data: a.data, mediaType: a.mediaType, name: a.name })),
    files: attachments.filter((a) => a.kind === "file").map((a) => a.path),
  };
  input.value = "";
  attachments = [];
  renderAttachments();
  autosize();
  currentAi = currentThinking = currentSteps = null;
  usage = { model: "", input: 0, output: 0, cacheRead: 0 };
  setRunning(true);
  const r = await api.send(payload);
  if (r && r.error) {
    add(el("div", "msg error", r.error));
    setRunning(false);
    if (/API Key/.test(r.error)) openSettings();
  }
}

// 不是从输入框发出的用户消息（例如验收脚本代发）：显示成用户气泡并进入运行中
if (api.onExternalMessage) {
  api.onExternalMessage((m) => {
    add(el("div", "msg user", m.text));
    currentAi = currentThinking = currentSteps = null;
    usage = { model: "", input: 0, output: 0, cacheRead: 0 };
    setRunning(true);
  });
}

api.onEvent((ev) => {
  switch (ev.type) {
    case "text":
      liveText("正在组织回答…");
      currentThinking = null;
      currentSteps = null;
      if (!currentAi) currentAi = add(el("div", "msg ai", ""));
      currentAi.textContent += ev.delta;
      scrollDown();
      break;
    case "thinking": {
      if (!String(ev.delta || "").trim() && !currentThinking) break; // 空内容不建折叠项
      if (!currentThinking) {
        const d = el("details", "thinking");
        d.append(el("summary", "", "思考过程"), el("div"));
        currentThinking = add(d);
        currentAi = null;
      }
      currentThinking.querySelector("div").textContent += ev.delta;
      break;
    }
    case "tool": {
      currentAi = null;
      currentThinking = null;
      if (!currentSteps) currentSteps = add(el("div", "steps"));
      const s = el("div", "step run");
      const row = el("button", "row");
      row.type = "button";
      row.setAttribute("aria-expanded", "false");
      row.append(el("span", "verb", VERBS[ev.name] || ev.name), stepDetail(ev.name, ev.input));
      row.onclick = () => {
        s.classList.toggle("open");
        row.setAttribute("aria-expanded", s.classList.contains("open") ? "true" : "false");
      };
      const out = el("div", "out", JSON.stringify(ev.input, null, 1));
      s.append(row, out);
      if (INTERNAL_TOOLS.has(ev.name)) {
        s.classList.add("internal");
        const grp = currentSteps;
        grp.dataset.hidden = String((Number(grp.dataset.hidden) || 0) + 1);
        let tgl = grp.querySelector(".steps-more");
        if (!tgl) {
          tgl = el("button", "steps-more");
          tgl.type = "button";
          tgl.onclick = () => {
            const on = grp.classList.toggle("show-all");
            tgl.setAttribute("aria-expanded", on ? "true" : "false");
            tgl.textContent = on ? "收起内部步骤" : `显示全部（含 ${grp.dataset.hidden} 个内部步骤）`;
          };
          grp.append(tgl);
        }
        tgl.textContent = grp.classList.contains("show-all") ? "收起内部步骤" : `显示全部（含 ${grp.dataset.hidden} 个内部步骤）`;
        grp.insertBefore(s, tgl);
      } else {
        const tgl = currentSteps.querySelector(".steps-more");
        if (tgl) currentSteps.insertBefore(s, tgl);
        else currentSteps.append(s);
      }
      stepNodes.set(ev.id, s);
      setStatus(`${VERBS[ev.name] || ev.name}…`, true);
      {
        const verb = VERBS[ev.name] || ev.name;
        const det = [...row.querySelectorAll(".detail > *")].map((n) => n.textContent.trim()).filter(Boolean).join(" ").slice(0, 28) || (row.querySelector(".detail")?.textContent || "").trim().slice(0, 28);
        liveText(`正在${verb}${det ? " " + det : ""}…`);
        liveSteps.push({ id: ev.id, label: verb + (det ? " " + det : ""), verb, det, state: "run" });
        liveRenderChips();
      }
      scrollDown();
      break;
    }
    case "tool_result": {
      const s = stepNodes.get(ev.id);
      if (!s) break;
      s.classList.remove("run");
      s.classList.add(ev.isError ? "err" : "ok");
      {
        const ls = liveSteps.find((x) => x.id === ev.id);
        if (ls) ls.state = ev.isError ? "err" : "ok";
        liveRenderChips();
        liveText("正在斟酌下一步…");
      }
      s.querySelector(".out").textContent = ev.text;
      if (ev.isError) s.classList.add("open");
      if (ev.image) {
        const img = el("img");
        img.src = "data:image/png;base64," + ev.image;
        img.alt = "操作后的截图";
        img.onclick = (e) => {
          e.stopPropagation();
          $("lightboxImg").src = img.src;
          $("lightbox").classList.remove("hidden");
        };
        s.append(img);
        const imgs = log.querySelectorAll(".step img");
        for (let i = 0; i < imgs.length - 2; i++) imgs[i].remove();
      }
      scrollDown();
      break;
    }
    case "ask":
      liveText("静候你的回答", true);
      currentSteps = null;
      renderAsk(ev);
      break;
    case "confirm":
      liveText("静候你的确认", true);
      currentSteps = null;
      renderConfirm(ev);
      break;
    case "change":
      currentSteps = null;
      renderChange(ev);
      break;
    case "suggest":
      currentSteps = null;
      renderSuggest(ev);
      break;
    case "file": {
      const f = el("div", "msg file");
      f.append(el("b", "", "已保存文件："), document.createTextNode(ev.path));
      add(f);
      break;
    }
    case "usage":
      usage.model = ev.model || usage.model;
      usage.input += ev.input || 0;
      usage.output += ev.output || 0;
      usage.cacheRead += ev.cacheRead || 0;
      break;
    case "ask_resolved":
      resolveCard(ev.id, ev.answer, "");
      break;
    case "status":
      setStatus(ev.text, true);
      break;
    case "error":
      currentSteps = null;
      add(el("div", "msg error", ev.text));
      break;
    case "done":
      renderUsage();
      currentAi = currentThinking = currentSteps = null;
      log.querySelectorAll(".step.run").forEach((s) => s.classList.remove("run"));
      log.querySelectorAll("details.thinking").forEach((d) => !d.textContent.replace("思考过程", "").trim() && d.remove());
      if (ev.stopped) add(el("div", "msg note", "已停止"));
      setRunning(false);
      break;
  }
});

// 被解决的“需要你处理 / 请确认”卡片：自动收起成一行小字（无论是在卡片上、别处回答，还是停止）
const askCards = new Map();
function resolveCard(id, answer, label) {
  const box = askCards.get(id);
  if (!box || !box.isConnected) return;
  askCards.delete(id);
  box.querySelectorAll("button,input").forEach((b) => (b.disabled = true));
  const note = el("div", "msg note", `已处理${label ? "：" + label : ""}${answer ? "（" + String(answer).slice(0, 40) + "）" : ""}`);
  box.classList.add("resolving");
  setTimeout(() => {
    box.replaceWith(note);
  }, 700);
}
function renderAsk(ev) {
  const box = el("div", "ask" + (ev.danger ? " danger" : ""));
  askCards.set(ev.id, box);
  box.append(el("div", "who", ev.danger ? "需要你确认（会改动或公开内容）" : "需要你处理"), el("div", "q", ev.question));
  const finish = (answer) => {
    if (box.classList.contains("answered")) return;
    box.classList.add("answered");
    box.querySelectorAll("button,input").forEach((b) => (b.disabled = true));
    box.append(el("div", "answer", "你的回答：" + answer));
    api.answer(ev.id, answer);
    setTimeout(() => resolveCard(ev.id, answer, "问题"), 900);
    setStatus("正在操作 Tableau…", true);
  };
  if (ev.options && ev.options.length) {
    const opts = el("div", "opts");
    ev.options.forEach((o, i) => {
      const b = el("button", "btn " + (ev.danger && i === 0 ? "danger" : ""), o);
      b.onclick = () => finish(o);
      opts.append(b);
    });
    box.append(opts);
  }
  const free = el("div", "free");
  free.hidden = true;
  const inp = el("input", "text");
  inp.placeholder = "写下你的回答";
  const ok = el("button", "btn", "回答");
  ok.onclick = () => inp.value.trim() && finish(inp.value.trim());
  inp.onkeydown = (e) => e.key === "Enter" && !e.isComposing && ok.click();
  free.append(inp, ok);
  const other = el("button", "btn quiet", "其他回答…");
  other.type = "button";
  other.onclick = () => {
    other.hidden = true;
    free.hidden = false;
    inp.focus();
  };
  if (ev.options && ev.options.length) box.append(other);
  else {
    other.hidden = true;
    free.hidden = false;
  }
  box.append(free);
  add(box);
  setStatus("静候你的回答", false);
}

// 多步操作前的确认卡：用户点了才执行
function renderConfirm(ev) {
  const anyDanger = ev.danger || (ev.steps || []).some((st) => typeof st === "object" && st && st.danger);
  const box = el("div", "confirm" + (anyDanger ? " has-danger" : ""));
  askCards.set(ev.id, box);
  box.append(el("div", "title", ev.title || "请确认以下操作"));
  const ol = el("ol");
  for (const st of ev.steps || []) {
    const o = typeof st === "string" ? { text: st } : st;
    ol.append(el("li", o.danger ? "danger" : "", o.text));
  }
  box.append(ol);
  if (anyDanger) box.append(el("div", "warn", "标红的步骤会改动或公开内容，请先看清楚再确认。"));
  const acts = el("div", "actions");
  const done = (label, text) => {
    if (box.classList.contains("done")) return;
    box.classList.add("done");
    acts.querySelectorAll("button").forEach((b) => (b.disabled = true));
    box.append(el("div", "result", text));
    api.answer(ev.id, label);
    setTimeout(() => resolveCard(ev.id, label, "确认"), 900);
    setStatus(label === ev.okLabel ? "正在操作 Tableau…" : "已取消", label === ev.okLabel);
  };
  const ok = el("button", "btn " + (anyDanger ? "danger" : "primary"), ev.okLabel || "确认执行");
  ok.onclick = () => done(ev.okLabel || "确认执行", "你选择了：" + (ev.okLabel || "确认执行"));
  const no = el("button", "btn", ev.cancelLabel || "取消");
  no.onclick = () => done(ev.cancelLabel || "取消", "已取消，没有做任何改动");
  acts.append(ok, no);
  box.append(acts);
  add(box);
  setStatus("静候你的确认", false);
}

// 一步操作完成后的一句话说明，可撤销时带“撤销”
function renderChange(ev) {
  const n = el("div", "change-note");
  const w = el("span", "what");
  w.append(el("b", "", "改了什么："), document.createTextNode(ev.text));
  n.append(w);
  const tag = el("span", "undone-tag", "");
  n.append(tag);
  add(n);
  if (ev.undoable) {
    // 只留一个撤销入口：输入框顶部的撤销条；聊天里的说明行只读，撤销后标“已撤销”
    showToast("已完成：" + ev.text, async () => {
      let r;
      try {
        r = await api.undo(ev.id);
      } catch (e) {
        r = { ok: false, message: "撤销失败" };
      }
      tag.textContent = r && r.ok ? "已撤销" : "不能撤销";
      if (!(r && r.ok)) {
        tag.dataset.tip = (r && r.message) || "只能撤销最近连续的几步";
        tag.tabIndex = 0;
      }
      n.classList.toggle("is-undone", !!(r && r.ok));
    });
  }
}

// 撤销提示条：能撤销的操作直接做，只在底部给一个“撤销”；鼠标放上去会暂停倒计时
function showToast(text, onUndo, secs, onExpire) {
  const box = $("toasts");
  while (box.children.length >= 2) box.firstChild.remove();
  const t = el("div", "toast");
  const msg = el("span", "t", text);
  const undo = el("button", "", "撤销");
  const bar = el("span", "tbar");
  let settled = false;
  const close = () => {
    t.classList.add("out");
    setTimeout(() => t.remove(), 220);
  };
  undo.onclick = () => {
    settled = true;
    if (onUndo) onUndo();
    close();
  };
  bar.addEventListener("animationend", () => {
    if (!settled && onExpire) onExpire();
    close();
  });
  if (secs) t.style.setProperty("--dur", secs + "s");
  if (!onUndo) undo.remove();
  t.append(msg, undo, bar);
  box.append(t);
  scrollDown();
}

// 主动建议卡
// 把文字里的网址变成可点的链接（只认 http/https，用系统浏览器打开，不在软件里跳转）
function linkify(text, parent) {
  const re = /https?:\/\/[^\s，。）)）]+/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) parent.append(document.createTextNode(text.slice(last, m.index)));
    const url = m[0];
    const a = el("a", "ext-link", url.replace(/^https?:\/\//, "").slice(0, 48));
    a.href = url;
    a.dataset.tip = url;
    a.onclick = (e) => {
      e.preventDefault();
      if (api.openExternal) api.openExternal(url);
    };
    parent.append(a);
    last = m.index + url.length;
  }
  if (last < text.length) parent.append(document.createTextNode(text.slice(last)));
}
function renderSuggest(ev) {
  const box = el("div", "suggest");
  box.append(el("div", "title", ev.title || "可以这样改进"));
  if (ev.detail) {
    const d = el("div", "body");
    linkify(String(ev.detail), d);
    box.append(d);
  }
  const actions = ev.actions || [];
  const multi = !!ev.multi && actions.length > 1;
  const list = el("div", "sopts");
  const picked = new Set();
  const acts = el("div", "acts");
  const go = el("button", "btn primary", multi ? "按所选去做" : "");
  const finish = () => {
    box.classList.add("done");
    box.querySelectorAll("button").forEach((b) => (b.disabled = true));
  };
  const sendPicked = (labels) => {
    finish();
    send("按这几条改：\n" + labels.map((t, i) => `${i + 1}. ${t}`).join("\n"));
  };
  const refreshGo = () => {
    const n = picked.size;
    go.setAttribute("aria-disabled", n ? "false" : "true");
    if (n) delete go.dataset.tip;
    else go.dataset.tip = "先勾选至少一项";
    go.textContent = n ? `按所选去做（${n}）` : "按所选去做";
  };
  actions.forEach((a, i) => {
    const opt = el("button", "sopt" + (multi ? " multi" : ""), "");
    opt.type = "button";
    opt.append(el("span", "sbox"), el("span", "stx", a.label));
    opt.onclick = () => {
      if (!multi) return sendPicked([a.label]); // 只有一条（或不可多选）：点一下就直接做
      if (picked.has(i)) picked.delete(i);
      else picked.add(i);
      opt.classList.toggle("on", picked.has(i));
      refreshGo();
    };
    list.append(opt);
  });
  box.append(list);
  if (multi) {
    refreshGo();
    go.onclick = () => {
      if (go.getAttribute("aria-disabled") === "true") return;
      sendPicked([...picked].sort((x, y) => x - y).map((i) => actions[i].label));
    };
    const all = el("button", "btn", "全选");
    all.onclick = () => {
      const every = picked.size === actions.length;
      picked.clear();
      if (!every) actions.forEach((_, i) => picked.add(i));
      list.querySelectorAll(".sopt").forEach((o, i) => o.classList.toggle("on", picked.has(i)));
      refreshGo();
    };
    acts.append(go, all);
  }
  const skip = el("button", "btn quiet", "忽略");
  skip.style.color = "var(--ink-3)";
  skip.onclick = finish;
  acts.append(skip);
  box.append(acts);
  add(box);
}

// 本轮用量：模型、token（每轮结束后一行小字）
function renderUsage() {
  if (usage.input + usage.output > 0) {
    const m = el("div", "meta");
    if (usage.model) m.append(el("span", "", usage.model));
    m.append(el("span", "", `输入 ${fmt(usage.input)} · 输出 ${fmt(usage.output)} tokens`));
    if (usage.cacheRead) m.append(el("span", "", `缓存命中 ${fmt(usage.cacheRead)}`));
    add(m);
  }
  usage = { model: "", input: 0, output: 0, cacheRead: 0 };
}

// ---------- 附件 ----------
const IMAGE_EXT = /\.(png|jpe?g|gif|webp)$/i;
function attachChip(a, removable) {
  const c = el("span", "attach " + a.kind);
  if (a.kind === "image") {
    const img = el("img");
    img.src = `data:${a.mediaType};base64,${a.data}`;
    img.alt = a.name;
    c.append(img);
  } else c.append(el("span", "ext", (a.name.split(".").pop() || "").slice(0, 4)));
  c.append(el("span", "nm", a.name));
  if (removable) {
    const x = el("button", "x", "×");
    x.title = "移除";
    x.onclick = () => {
      attachments = attachments.filter((t) => t !== a);
      renderAttachments();
    };
    c.append(x);
  }
  return c;
}
function renderAttachments() {
  const box = $("attachments");
  box.innerHTML = "";
  for (const a of attachments) box.append(attachChip(a, true));
  box.classList.toggle("hidden", attachments.length === 0);
}
async function addPaths(paths) {
  for (const p of paths) {
    if (IMAGE_EXT.test(p)) {
      const img = await api.readImage(p);
      if (img) attachments.push({ kind: "image", name: basename(p), data: img.data, mediaType: img.mediaType });
    } else attachments.push({ kind: "file", name: basename(p), path: p });
  }
  renderAttachments();
}
$("btnAttach").onclick = async () => addPaths((await api.pickFiles()) || []);
$("btnShot").onclick = async () => {
  const shot = await api.captureTableau();
  if (shot) {
    attachments.push({ kind: "image", name: "Tableau 截图.png", data: shot, mediaType: "image/png" });
    renderAttachments();
  }
};
input.addEventListener("paste", (e) => {
  for (const item of e.clipboardData.items) {
    if (item.type.startsWith("image/")) {
      e.preventDefault();
      const f = item.getAsFile();
      const r = new FileReader();
      r.onload = () => {
        const [head, data] = String(r.result).split(",");
        attachments.push({ kind: "image", name: "粘贴的图片.png", data, mediaType: head.slice(5, head.indexOf(";")) });
        renderAttachments();
      };
      r.readAsDataURL(f);
    }
  }
});
const left = $("left");
left.addEventListener("dragover", (e) => {
  e.preventDefault();
  left.classList.add("dropping");
});
left.addEventListener("dragleave", (e) => {
  if (e.target === left || !left.contains(e.relatedTarget)) left.classList.remove("dropping");
});
left.addEventListener("drop", (e) => {
  e.preventDefault();
  left.classList.remove("dropping");
  const paths = [...e.dataTransfer.files].map((f) => api.pathForFile(f)).filter(Boolean);
  addPaths(paths);
});

// ---------- 语音输入 ----------
let listening = false;
let voiceBase = "";
$("btnMic").onclick = async () => {
  if (listening) {
    api.voiceStop();
    return;
  }
  voiceBase = input.value ? input.value.replace(/\s*$/, "") + " " : "";
  const r = await api.voiceStart();
  if (r && r.error) {
    if (/权限|麦克风|语音识别|permission/i.test(r.error)) renderPermissionGuide(r.error);
    else add(el("div", "msg error", r.error));
    return;
  }
  listening = true;
  $("btnMic").classList.add("live");
  setStatus("正在听，说完再点一下麦克风", true);
};
api.onVoice((ev) => {
  if (ev.type === "partial" || ev.type === "final") {
    input.value = voiceBase + ev.text;
    autosize();
  }
  if (ev.type === "error") (/权限|麦克风|语音识别|permission/i.test(ev.text) ? renderPermissionGuide(ev.text) : add(el("div", "msg error", ev.text)));
  if (ev.type === "final" || ev.type === "end" || ev.type === "error") {
    listening = false;
    $("btnMic").classList.remove("live");
    if (!running) setStatus("");
    input.focus();
  }
});

// 权限被拒时就地给出步骤，不跳走、不遮挡
function renderPermissionGuide(why) {
  const g = el("div", "guide");
  g.append(el("b", "", "语音输入需要你允许权限"), el("div", "", why));
  const ol = el("ol");
  const steps = IS_WIN
    ? ["打开“设置 > 隐私和安全性 > 麦克风”，打开“允许桌面应用使用麦克风”。", "如果提示没有中文语音包，到“设置 > 时间和语言 > 语言和区域”里安装；也可以按 Win+H 用系统听写。", "回到这里，再点一次麦克风。如果还不行，退出 TabPilot 重新打开。"]
    : ["打开 macOS 的“系统设置”。", "进入“隐私与安全性”，分别在“麦克风”和“语音识别”里，把 TabPilot 打开。", "回到这里，再点一次麦克风。如果还不行，退出 TabPilot 重新打开。"];
  steps.forEach((t) => ol.append(el("li", "", t)));
  g.append(ol);
  const acts = el("div", "acts");
  const ok = el("button", "btn", "知道了");
  ok.onclick = () => g.remove();
  acts.append(ok);
  g.append(acts);
  add(g);
}

// ---------- 输入框 ----------
function autosize() {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
}
input.addEventListener("input", autosize);
$("btnSend").onclick = () => {
  if (running) {
    api.stop();
    setStatus("正在停止…", true);
  } else send();
};
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    send();
  }
});
const welcomeStatic = $("welcome") ? $("welcome").innerHTML : "";
const welcomeOuter = $("welcome") ? $("welcome").outerHTML : "";
let lastTableauState = null;
function bindChips(root) {
  root.querySelectorAll(".chip").forEach((c) => (c.onclick = () => send(c.textContent)));
}
bindChips(document);
// 新对话：先把旧记录收起来，给 8 秒撤销；到时间（或你发出下一条）才真正清空助手的上下文
let pendingReset = null; // { timer, stash }
async function flushPendingReset() {
  if (!pendingReset) return;
  clearTimeout(pendingReset.timer);
  pendingReset = null;
  await api.reset();
  askCards.clear();
}
$("btnNew").onclick = async () => {
  if (running) {
    showToast("请先停止当前操作，再开始新对话", null, 4);
    return;
  }
  await flushPendingReset();
  const hasContent = log.querySelector(".msg, .steps, .ask, .confirm, .suggest, .change-note, details.thinking");
  const stash = document.createDocumentFragment();
  [...log.childNodes].forEach((n) => stash.append(n));
  log.innerHTML = welcomeOuter; // 清空对话后，欢迎页重新出现；开始使用后又会收起
  bindChips(log);
  dynKey = "";
  setRunning(false);
  if (lastTableauState) refreshWelcome(lastTableauState);
  if (!hasContent) {
    await api.reset();
    return;
  }
  const expire = async () => {
    if (!pendingReset) return;
    pendingReset = null;
    await api.reset();
    askCards.clear();
  };
  pendingReset = { stash, timer: setTimeout(expire, 8000) };
  showToast("已开始新对话", () => {
    clearTimeout(pendingReset && pendingReset.timer);
    pendingReset = null;
    log.innerHTML = "";
    log.append(stash);
    scrollDown();
  }, 8);
};
$("btnTwb").onclick = async () => {
  const p = await api.pickWorkbook();
  if (!p) return;
  input.value = `按这个工作簿复刻图表：${p}\n先解析出所有工作表的规格列给我看，然后从第一张开始逐张在 Tableau 里做出来，每张单独一个工作表。`;
  autosize();
  input.focus();
};
$("navBack").onclick = () => api.nav("back");
$("navReload").onclick = () => api.nav("reload");
$("navHome").onclick = () => api.nav("home");
api.onUrl((u) => ($("url").textContent = String(u).replace(/^https?:\/\//, "")));
$("lightbox").onclick = () => $("lightbox").classList.add("hidden");
$("lightboxX").onclick = (e) => {
  e.stopPropagation();
  $("lightbox").classList.add("hidden");
};

// ---------- 教程模式与导出 ----------
try {
  $("tutorial").checked = localStorage.getItem("tutorial") === "1";
} catch {}
$("tutorial").onchange = () => {
  try {
    localStorage.setItem("tutorial", $("tutorial").checked ? "1" : "0");
  } catch {}
};
$("btnExport").onclick = async () => {
  const lines = [`# Tableau 制作步骤`, ``, `导出时间：${new Date().toLocaleString("zh-CN")}`, ``];
  let n = 0;
  for (const node of log.children) {
    if (node.classList.contains("msg") && node.classList.contains("user")) {
      lines.push(`## 需求：${node.firstChild?.textContent || ""}`, "");
      n = 0;
    } else if (node.classList.contains("msg") && node.classList.contains("ai")) lines.push(node.textContent.trim(), "");
    else if (node.classList.contains("steps")) {
      for (const st of node.querySelectorAll(".step")) {
        const verb = st.querySelector(".verb")?.textContent || "";
        const detail = st.querySelector(".detail")?.textContent || "";
        const mark = st.classList.contains("err") ? "（失败）" : "";
        lines.push(`${++n}. ${verb} ${detail}${mark}`);
      }
      lines.push("");
    } else if (node.classList.contains("ask")) lines.push(`> ${node.querySelector(".q")?.textContent || ""}`, `> ${node.querySelector(".answer")?.textContent || "（未回答）"}`, "");
    else if (node.classList.contains("error")) lines.push(`> 出错：${node.textContent}`, "");
  }
  if (lines.length <= 4) {
    add(el("div", "msg note", "还没有可导出的步骤"));
    return;
  }
  const p = await api.exportSteps(lines.join("\n"));
  if (p) add(el("div", "msg note", "已导出到 " + p));
};

// ---------- 主题：跟随系统 / 白天 / 夜间 ----------
let chosenTheme = "system";
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
function paintTheme() {
  document.querySelectorAll("#themeSeg button").forEach((b) => b.classList.toggle("on", b.dataset.t === chosenTheme));
}
document.querySelectorAll("#themeSeg button").forEach(
  (b) =>
    (b.onclick = () => {
      chosenTheme = b.dataset.t;
      paintTheme();
      applyTheme(chosenTheme); // 立刻生效，并马上存进设置（主进程同步系统外观）
      api.updateSettings({ theme: chosenTheme });
    }),
);

// ---------- ⓘ 小提示：点一下在原位展开一行说明，再点收起；不盖住任何东西 ----------
function addInfo(host, text) {
  const b = el("button", "info", "i");
  b.type = "button";
  b.setAttribute("aria-label", "这是什么");
  b.dataset.help = text;
  host.append(" ", b);
  return b;
}
document.addEventListener("click", (e) => {
  const b = e.target.closest && e.target.closest(".info");
  if (!b) return;
  e.preventDefault();
  e.stopPropagation();
  const host = b.closest("h3, p, .field, label, .row-switch") || b.parentElement;
  const open = b.getAttribute("aria-expanded") === "true";
  b.setAttribute("aria-expanded", open ? "false" : "true");
  if (open) {
    b._note?.remove();
    b._note = null;
  } else {
    const n = el("div", "help-note", b.dataset.help);
    host.after(n);
    b._note = n;
  }
});

// ---------- 小白新手小贴士：输入框上方一条，可关、只出现一次、不盖住内容 ----------
const COACH = [
  "像对同事说话那样描述就好，例如：“按地区看销售额，用柱状图”。",
  "数据文件可以直接拖入，截图可以直接粘贴，也可以点麦克风开口说。",
  "右侧是真实的 Tableau，随时可以亲自动手；想学一学，就打开“教我做”。",
];
let coachIdx = 0;
function coachDone() {
  try {
    return localStorage.getItem("coachDone") === "1";
  } catch {
    return false;
  }
}
function showCoach() {
  $("coach").querySelector(".ct").textContent = COACH[coachIdx];
  $("coachNext").textContent = coachIdx < COACH.length - 1 ? "下一条" : "知道了";
  $("coach").classList.remove("hidden");
}
function endCoach() {
  $("coach").classList.add("hidden");
  try {
    localStorage.setItem("coachDone", "1");
  } catch {}
}
$("coachNext").onclick = () => (coachIdx < COACH.length - 1 ? (coachIdx++, showCoach()) : endCoach());
$("coachX").onclick = endCoach;
$("coachX").dataset.tip = "不再提示";

// ---------- Tableau 登录实时指引（不依赖 AI；账号密码请用户自己填） ----------
const AUTH = {
  "cookie-banner": {
    chip: "Cookie", title: "先处理页面上的 Cookie 提示",
    steps: ["在右边页面里找到 Cookie 提示（通常在页面底部或中间）。", "按你的意愿选“接受”或“拒绝非必要”，两个都可以继续。"],
    now: 0, points: [{ q: ["Accept", "接受", "Cookie", "Reject", "拒绝"], c: "Cookie 提示在这里，请自己选择", label: "指给我看 Cookie 提示" }],
  },
  "signed-out": {
    chip: "登录", title: "点右上角“登录”",
    steps: ["在右边页面右上角点“登录（Sign In）”。", "还没有账号？点“注册 / 创建账户”，免费的。", "登录或注册都在右边页面里完成。"],
    now: 0, points: [{ q: ["Sign In", "登录", "Log in"], c: "点这里登录", label: "指给我看“登录”" }, { q: ["Sign Up", "注册", "Create", "创建账户"], c: "没有账号点这里注册", label: "指给我看“注册”" }],
  },
  "login-page": {
    chip: "登录", title: "输入邮箱和密码",
    steps: ["在右边页面的框里输入你的邮箱。", "输入密码（自己输入，TabPilot 不会代填）。", "点“登录”。"],
    now: 0, points: [{ q: ["Email", "邮箱", "Username", "用户名"], c: "在这里输入邮箱", label: "指给我看邮箱框" }, { q: ["Sign In", "登录", "Log In", "Continue", "继续"], c: "填好后点这里", label: "指给我看“登录”按钮" }],
  },
  "signup-page": {
    chip: "注册", title: "填写注册信息",
    steps: ["填写邮箱、姓名，设一个密码（自己填，TabPilot 不会代填）。", "按页面要求勾选同意条款。", "提交后，去邮箱收验证邮件。"],
    now: 0, points: [{ q: ["Email", "邮箱"], c: "在这里输入邮箱", label: "指给我看邮箱框" }, { q: ["Create", "Sign Up", "注册", "创建"], c: "填好后点这里", label: "指给我看提交按钮" }],
  },
  verify: {
    chip: "验证", title: "完成验证",
    steps: ["打开你的邮箱，找到来自 Tableau 的邮件。", "把邮件里的验证码填回右边页面，或点邮件里的验证链接。", "如果开了两步验证，用手机验证器里的 6 位数字。"],
    now: 0, points: [{ q: ["code", "验证码", "Verification", "验证"], c: "验证码填在这里", label: "指给我看验证码框" }],
  },
  "signed-in": {
    chip: "已登录", ok: true, title: "登录成功，下一步创建图表",
    steps: ["点上方的“创建（Create）”。", "选“Web 制作”，进入编辑器。", "进入编辑器后，就可以在左边告诉 TabPilot 想要什么图了。"],
    now: 0, points: [{ q: ["Create", "创建"], c: "点这里创建", label: "指给我看“创建”" }],
  },
};
let authCollapsed = false;
let authLast = "";
function renderAuth(st) {
  const box = $("auth");
  const info = st && AUTH[st.state];
  if (!info) {
    box.classList.add("hidden");
    authLast = "";
    return;
  }
  if (authLast === st.state) return;
  authLast = st.state;
  box.classList.remove("hidden");
  box.classList.toggle("collapsed", authCollapsed);
  box.innerHTML = "";
  const head = el("div", "ah");
  head.append(el("span", "chip2" + (info.ok ? " ok" : ""), info.chip), el("span", "at", info.title));
  const tog = el("button", "icon", "");
  tog.type = "button";
  tog.dataset.tip = "收起或展开";
  tog.setAttribute("aria-label", "收起或展开");
  tog.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 8l5 5 5-5"/></svg>';
  tog.onclick = () => {
    authCollapsed = !authCollapsed;
    box.classList.toggle("collapsed", authCollapsed);
  };
  head.append(tog);
  const body = el("div", "ab");
  const ol = el("ol");
  info.steps.forEach((t, i) => ol.append(el("li", i === info.now ? "now" : "", t)));
  body.append(ol);
  const acts = el("div", "acts");
  const miss = el("div", "miss");
  miss.hidden = true;
  for (const p of info.points || []) {
    const b = el("button", "btn", p.label);
    b.type = "button";
    b.onclick = async () => {
      miss.hidden = true;
      let ok = false;
      try {
        for (const q of p.q) {
          if (api.pointAt && (await api.pointAt(q, p.c))) {
            ok = true;
            break;
          }
        }
      } catch {}
      if (!ok) {
        miss.textContent = "没找到这个位置，页面可能还在加载，或者布局有变化。请对照右边页面自己找一下。";
        miss.hidden = false;
      }
    };
    acts.append(b);
  }
  body.append(acts, miss);
  const note = el("div", "note");
  note.append(el("b", "", "账号与密码请由你亲自输入，"), document.createTextNode("TabPilot 不会代填，也不会替你点击登录或注册。"));
  body.append(note);
  box.append(head, body);
}
// ---------- 空状态由用户绑定的 AI 根据右边页面决定显示什么（只在页面状态变化时请求；没有 Key 或失败就退回静态内容） ----------
let suggestOn = true;
let dynKey = "";
let dynTimer = 0;
let dynToken = 0;
function restoreWelcome() {
  const w = $("welcome");
  if (!w) return;
  w.classList.remove("collapsed", "loading");
  w.innerHTML = welcomeStatic;
  bindChips(w);
}
function renderDynWelcome(r) {
  const w = $("welcome");
  if (!w) return;
  w.classList.remove("loading");
  if (r.show === false) {
    w.classList.add("collapsed"); // 不需要提示时整块收起
    return;
  }
  w.classList.remove("collapsed");
  w.innerHTML = "";
  w.append(el("h1", "", String(r.title || "").slice(0, 60)));
  if (r.lead) w.append(el("p", "", String(r.lead).slice(0, 160)));
  const list = Array.isArray(r.suggestions) ? r.suggestions.slice(0, 4) : [];
  if (list.length) {
    const box = el("div", "starter");
    box.append(el("div", "starter-title", "下一步可以这样做"));
    list.forEach((t) => box.append(el("button", "chip", String(t).slice(0, 90))));
    w.append(box);
    bindChips(w);
  }
  w.append(el("div", "dyn-tag", "依据右侧页面所见而定"));
}
function refreshWelcome(st) {
  const w = $("welcome");
  if (!w || !api.suggestNext || !suggestOn || !st) return;
  const key = st.state + "|" + st.url;
  if (key === dynKey) return;
  dynKey = key;
  clearTimeout(dynTimer);
  dynTimer = setTimeout(async () => {
    const token = ++dynToken;
    const cur = $("welcome");
    if (!cur) return;
    cur.classList.add("loading");
    let r = null;
    try {
      r = await api.suggestNext({ state: st.state, url: st.url, title: st.title, lang: i18n.lang() });
    } catch {}
    if (token !== dynToken || !$("welcome")) return;
    if (!r) return restoreWelcome();
    renderDynWelcome(r);
  }, 1500);
}
if (api.tableauState) {
  api.tableauState().then((s) => ((lastTableauState = s), renderAuth(s), refreshWelcome(s))).catch(() => {});
  api.onTableauState((s) => ((lastTableauState = s), renderAuth(s), refreshWelcome(s)));
}

// ---------- 版本号与旧版本清理 ----------
if (api.appVersion) api.appVersion().then((v) => ($("verLine").textContent = "TabPilot v" + v));
const TRASH_WORD = IS_WIN ? "回收站" : "废纸篓";
if (api.onOldCopies) {
  api.onOldCopies((s) => {
    if (!s || !s.copies || !s.copies.length || document.querySelector(".oldcard")) return;
    const card = el("div", "oldcard");
    card.append(el("b", "", "发现旧版本"));
    card.append(el("div", "", `你现在用的是 v${s.current}。下面这些旧版本可以清理掉，避免点错。勾选要处理的：`));
    const items = [];
    for (const c of s.copies) {
      const lab = el("label", "row");
      const cb = el("input");
      cb.type = "checkbox";
      cb.checked = true;
      const t = el("div");
      t.append(el("div", "pth", c.path), el("div", "ver", `${c.kind === "installer" ? "安装包" : "应用"} · v${c.version}`));
      lab.append(cb, t);
      card.append(lab);
      items.push({ cb, path: c.path });
    }
    card.append(el("div", "hint", `将移入${TRASH_WORD}，随时可以恢复；你的设置、密钥与登录状态不受影响。`));
    const nm = el("label", "nomore");
    const nmc = el("input");
    nmc.type = "checkbox";
    nm.append(nmc, document.createTextNode("以后不再提醒"));
    const res = el("div", "res");
    const acts = el("div", "acts");
    const go = el("button", "btn danger", `移到${TRASH_WORD}`);
    const later = el("button", "btn", "以后再说");
    const finish = () => {
      if (nmc.checked && api.oldCopies) api.oldCopies.ignore();
      card.remove();
    };
    go.onclick = async () => {
      const paths = items.filter((i) => i.cb.checked).map((i) => i.path);
      if (!paths.length) return (res.textContent = "还没有勾选任何项。");
      go.setAttribute("aria-disabled", "true");
      let r;
      try {
        r = await api.oldCopies.trash(paths);
      } catch (e) {
        r = { removed: [], failed: paths };
      }
      const ok = (r.removed || []).length;
      const bad = (r.failed || []).length;
      res.textContent = `已移到${TRASH_WORD}：${ok} 项` + (bad ? `；${bad} 项没能处理，可以自己手动删除。` : "。");
      setTimeout(finish, 2200);
    };
    later.onclick = finish;
    acts.append(go, later);
    card.append(acts, nm, res);
    log.prepend(card);
  });
}

// ---------- 界面语言：跟随系统 / 简体中文 / English ----------
function paintLang() {
  document.querySelectorAll("#langSeg button").forEach((b) => b.classList.toggle("on", b.dataset.l === i18n.pref()));
}
document.querySelectorAll("#langSeg button").forEach(
  (b) =>
    (b.onclick = () => {
      i18n.set(b.dataset.l);
      paintLang();
      if (api.updateSettings) api.updateSettings({ language: b.dataset.l, uiLang: i18n.lang() });
    }),
);
paintLang();

// ---------- 减少动画：应用内开关（系统“减少动态效果”由样式自动响应） ----------
function applyMotion(reduce) {
  if (reduce) document.documentElement.dataset.motion = "reduce";
  else delete document.documentElement.dataset.motion;
  try {
    localStorage.setItem("reduceMotion", reduce ? "1" : "0");
  } catch {}
}
try {
  applyMotion(localStorage.getItem("reduceMotion") === "1");
} catch {}
$("optMotion").onchange = () => applyMotion($("optMotion").checked);

// ---------- 自绘提示气泡：不用浏览器自带的 title ----------
const tip = $("tip");
function convertTitles(root) {
  if (!root.querySelectorAll) return;
  const nodes = root.matches && root.matches("[title]") ? [root] : [];
  nodes.push(...root.querySelectorAll("[title]"));
  for (const n of nodes) {
    n.dataset.tip = n.getAttribute("title");
    if (!n.getAttribute("aria-label") && !n.textContent.trim()) n.setAttribute("aria-label", n.dataset.tip);
    n.removeAttribute("title");
  }
}
convertTitles(document.body);
new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === "attributes") convertTitles(m.target);
    else m.addedNodes.forEach((n) => n.nodeType === 1 && convertTitles(n));
  }
}).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["title"] });
let tipTimer = 0;
function hideTip() {
  clearTimeout(tipTimer);
  tip.classList.remove("show");
}
document.addEventListener("mouseover", (e) => {
  if (matchMedia("(pointer: coarse)").matches) return;
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) return hideTip();
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => {
    tip.textContent = t.dataset.tip;
    const r = t.getBoundingClientRect();
    tip.style.left = "0px";
    tip.style.top = "0px";
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const below = r.bottom + 8 + h < window.innerHeight;
    tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)) + "px";
    tip.style.top = (below ? r.bottom + 8 : r.top - h - 8) + "px";
    tip.classList.add("show");
  }, 250);
});
document.addEventListener("mouseout", (e) => e.target.closest && e.target.closest("[data-tip]") && hideTip());
document.addEventListener("pointerdown", hideTip, true);
document.addEventListener("focusin", (e) => {
  if (!e.target.matches || !e.target.matches(":focus-visible")) return;
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) return;
  tip.textContent = t.dataset.tip;
  const r = t.getBoundingClientRect();
  tip.style.left = "0px";
  tip.style.top = "0px";
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const below = r.bottom + 8 + h < window.innerHeight;
  tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)) + "px";
  tip.style.top = (below ? r.bottom + 8 : r.top - h - 8) + "px";
  tip.classList.add("show");
});
document.addEventListener("focusout", hideTip);

// ---------- 设置 ----------
// 当前提供商正在用的模型：新提供商存在 settings.models，旧的两家兜底到各自的模型名
function modelOf(s) {
  const m = s.models && s.models[s.provider];
  if (m) return m;
  return s.provider === "claude" ? s.claudeModel : s.provider === "deepseek" ? s.deepseekModel : "";
}
async function refreshSettings() {
  const s = await api.getSettings();
  applyTheme(s.theme);
  suggestOn = s.suggestions !== false;
  $("modelTag").textContent = modelOf(s);
  return s;
}
async function openSettings() {
  await loadProviders();
  const s = await refreshSettings();
  chosenTheme = s.theme || "system";
  paintTheme();
  $("optSuggest").checked = s.suggestions !== false;
  $("optMotion").checked = document.documentElement.dataset.motion === "reduce";
  $("optJev").checked = !!s.jevVerify;
  $("jevKey").value = "";
  $("jevHas").textContent = s.hasKey.jev ? "已保存" : "未设置";
  $("jevHas").className = "badge" + (s.hasKey.jev ? " ok" : "");
  paintCurrentProvider(s);
  resetClearBox();
  $("settings").classList.remove("hidden");
  setInertUnder(true);
  $("settingsDone").focus();
}
// 当前助手卡片：名字、模型、Key 是否已保存（和首次设置共用同一份提供商列表）
function paintCurrentProvider(s) {
  const p = provOf(s.provider);
  $("curName").textContent = p.name;
  $("curModel").textContent = modelOf(s) || "—";
  const has = !!(s.hasKey && s.hasKey[s.provider]);
  $("curHas").textContent = has ? "已保存" : "未设置";
  $("curHas").className = "badge" + (has ? " ok" : "");
  $("clearBox").hidden = !has;
}
// 设置页盖在上面时，底下的界面不能被键盘或读屏访问
function setInertUnder(on) {
  document.querySelectorAll("#left > header, #left > main, #left > footer, #left > #auth, #tabbar").forEach((n) => (on ? n.setAttribute("inert", "") : n.removeAttribute("inert")));
}
const closeSettings = () => {
  $("settings").classList.add("hidden");
  if ($("onboard").classList.contains("hidden")) setInertUnder(false);
  api.getSettings().then((s) => applyTheme(s.theme));
};
$("btnSettings").onclick = openSettings;
$("modelTag").onclick = openSettings;
$("modelTag").setAttribute("role", "button");
$("modelTag").tabIndex = 0;
$("modelTag").dataset.tip = "点一下更换助手或模型";
$("modelTag").onkeydown = (e) => (e.key === "Enter" || e.key === " ") && openSettings();
$("settingsClose").onclick = closeSettings;
$("settingsDone").onclick = closeSettings;
// 设置都是即点即生效，不再有“保存”；只有换助手或模型才会开始新对话（在首次设置流程里完成）
$("optSuggest").onchange = () => {
  suggestOn = $("optSuggest").checked;
  api.updateSettings({ suggestions: suggestOn });
};
$("optJev").onchange = () => api.updateSettings({ jevVerify: $("optJev").checked });
$("jevKey").onkeydown = async (e) => {
  if (e.key !== "Enter" || e.isComposing) return;
  const v = $("jevKey").value.trim();
  if (!v) return;
  await api.setKey("jev", v);
  $("jevKey").value = "";
  $("jevHas").textContent = "已保存";
  $("jevHas").className = "badge ok";
};
$("btnChange").onclick = () => {
  closeSettings();
  openOnboard();
};
$("btnUpdateKey").onclick = () => {
  closeSettings();
  openOnboard({ step: 1 });
};
// 清除 Key：不可恢复，所以就地二次确认并写出是哪一家
function resetClearBox() {
  const box = $("clearBox");
  box.innerHTML = "";
  const b = el("button", "btn quiet danger", "清除这家的 Key");
  b.id = "clearKeys";
  b.type = "button";
  b.onclick = askClear;
  box.append(b);
}
async function askClear() {
  const s = await api.getSettings();
  const p = provOf(s.provider);
  const box = $("clearBox");
  box.innerHTML = "";
  const row = el("div", "clearask");
  row.append(el("div", "", `清除 ${p.name} 的 Key？之后需要重新粘贴才能继续使用。`));
  const acts = el("div", "acts");
  const no = el("button", "btn", "取消");
  no.onclick = resetClearBox;
  const yes = el("button", "btn danger", "清除");
  yes.onclick = async () => {
    yes.setAttribute("aria-disabled", "true");
    await api.setKey(s.provider, "");
    paintCurrentProvider(await refreshSettings());
    resetClearBox();
    $("clearBox").hidden = true;
  };
  acts.append(no, yes);
  row.append(acts);
  box.append(row);
}
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeSettings();
    if (!$("onboard").classList.contains("hidden")) closeOnboard();
    $("lightbox").classList.add("hidden");
  }
});

// ---------- 分栏拖动 ----------
const divider = $("divider");
const clampW = (x) => Math.max(320, Math.min(x, window.innerWidth - 480));
function applyWidth(w) {
  left.style.width = w + "px";
}
divider.addEventListener("mousedown", (e) => {
  e.preventDefault();
  divider.classList.add("active");
  document.body.style.cursor = "col-resize";
  api.splitDrag("start", left.offsetWidth);
  const move = (ev) => {
    const w = clampW(ev.clientX);
    applyWidth(w);
    api.splitDrag("move", w);
  };
  const up = (ev) => {
    divider.classList.remove("active");
    document.body.style.cursor = "";
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", up);
    const w = clampW(ev.clientX);
    applyWidth(w);
    api.splitDrag("end", w);
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", up);
});

// ---------- 首次设置向导：选提供商 → 填 Key 并测试 → 选模型（带推荐）→ 完成 ----------
// 提供商列表由主进程提供（providers.list）；拿不到时用下面两个兜底
const FALLBACK_PROVIDERS = [
  { id: "claude", name: "Claude", desc: "能看懂截图，操作最稳，适合复杂的图。", vision: true, placeholder: "sk-ant-…", help: "在 console.anthropic.com 创建 API Key" },
  { id: "deepseek", name: "DeepSeek", desc: "便宜、中文好；看不到截图，靠读取页面结构完成每一步。", vision: false, placeholder: "sk-…", help: "在 platform.deepseek.com 创建 API Key" },
];
let provList = FALLBACK_PROVIDERS;
const provOf = (id) => provList.find((p) => p.id === id) || { id, name: id, desc: "", vision: true };
const AVATAR_COLORS = ["#7c5cff", "#27a4f2", "#12a37a", "#e8890c", "#e5484d", "#d6409f", "#5b6ee1", "#0e9aa7"];
const avatarColor = (id) => AVATAR_COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
async function loadProviders() {
  try {
    const l = api.providers && api.providers.list ? await api.providers.list() : null;
    if (Array.isArray(l) && l.length) provList = l;
  } catch {}
}
const ob = { step: 0, provider: "claude", key: "", models: [], model: "", tested: false, rec: "idle", picked: false, builtin: null }; // rec: idle | loading | ai | fallback
// 测试通过后让 AI 自己根据本软件的需求推荐模型；失败就用内置推荐
let recToken = 0;
async function startRecommend() {
  const token = ++recToken;
  ob.rec = "loading";
  let r = null;
  try {
    r = api.providers && api.providers.recommend ? await api.providers.recommend(ob.provider, ob.key, ob.models.map((m) => m.id)) : null;
  } catch {
    r = null;
  }
  if (token !== recToken) return; // 期间换了提供商或重新测试
  if (r && r.recommended) {
    ob.models = ob.models.map((m) => ({ ...m, recommended: m.id === r.recommended, note: (r.notes && r.notes[m.id]) || m.note }));
    if (!ob.picked) ob.model = r.recommended;
    ob.rec = "ai";
  } else {
    ob.rec = "fallback";
  }
  if (ob.step === 2) obRender();
}
// 提供商选择：左边列表（滑动高亮 + 依次弹入），右边详情卡（光斑跟随 + 3D 倾斜）
// 交互效果参考 animate-ui Highlight、reactbits Animated List / Spotlight Card / Tilted Card（均为 MIT，手写移植）
// 品牌 Logo（单色版，来自 lobe-icons 静态 SVG，MIT；品牌标识归各自所有者，此处仅用于标识提供商）
const GLYPHS = {"claude": "<path d=\"M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z\"></path>", "openai": "<path d=\"M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z\"></path>", "gemini": "<path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\"></path>", "qwen": "<path d=\"M19.713 2.825h-5.907c0-.251-.066-.503-.196-.728L12.819.728A1.46 1.46 0 0 0 11.559 0h-1.58c-.52 0-1 .275-1.26.728l-2.42 4.19a1.45 1.45 0 0 0 0 1.453l.791 1.37c.26.448.74.727 1.26.727h11.36c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451l-.79-1.37a1.46 1.46 0 0 0-1.26-.728zM.195 9.905l2.951 5.115a1.46 1.46 0 0 0-.531.531l-.791 1.37a1.45 1.45 0 0 0 0 1.452l.79 1.37c.26.448.74.727 1.26.727h4.84c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451L5.086 7.083a1.46 1.46 0 0 0-1.26-.728h-1.58c-.52 0-1 .276-1.26.728l-.79 1.37a1.45 1.45 0 0 0 0 1.452m15.888 13.367 2.951-5.115c.217.125.469.196.728.196h1.582c.52 0 1-.275 1.26-.728l.79-1.37a1.45 1.45 0 0 0 0-1.451l-2.42-4.191a1.46 1.46 0 0 0-1.259-.728h-1.582c-.52 0-1 .276-1.259.728l-5.678 9.838a1.45 1.45 0 0 0 0 1.452l.79 1.37c.26.448.74.727 1.26.727h1.582c.52 0 1-.275 1.26-.728z\"></path>", "zhipu": "<path d=\"M11.991 23.503a.24.24 0 00-.244.248.24.24 0 00.244.249.24.24 0 00.245-.249.24.24 0 00-.22-.247l-.025-.001zM9.671 5.365a1.697 1.697 0 011.099 2.132l-.071.172-.016.04-.018.054c-.07.16-.104.32-.104.498-.035.71.47 1.279 1.186 1.314h.366c1.309.053 2.338 1.173 2.286 2.523-.052 1.332-1.152 2.38-2.478 2.327h-.174c-.715.018-1.274.64-1.239 1.368 0 .124.018.23.053.337.209.373.54.658.96.8.75.23 1.517-.125 1.9-.782l.018-.035c.402-.64 1.17-.96 1.92-.711.854.284 1.378 1.226 1.099 2.167a1.661 1.661 0 01-2.077 1.102 1.711 1.711 0 01-.907-.711l-.017-.035c-.2-.323-.463-.58-.851-.711l-.056-.018a1.646 1.646 0 00-1.954.746 1.66 1.66 0 01-1.065.764 1.677 1.677 0 01-1.989-1.279c-.209-.906.332-1.83 1.257-2.043a1.51 1.51 0 01.296-.035h.018c.68-.071 1.151-.622 1.116-1.333a1.307 1.307 0 00-.227-.693 2.515 2.515 0 01-.366-1.403 2.39 2.39 0 01.366-1.208c.14-.195.21-.444.227-.693.018-.71-.506-1.261-1.186-1.332l-.07-.018a1.43 1.43 0 01-.299-.07l-.05-.019a1.7 1.7 0 01-1.047-2.114 1.68 1.68 0 012.094-1.101zm-5.575 10.11c.26-.264.639-.367.994-.27.355.096.633.379.728.74.095.362-.007.748-.267 1.013-.402.41-1.053.41-1.455 0a1.062 1.062 0 010-1.482zm14.845-.294c.359-.09.738.024.992.297.254.274.344.665.237 1.025-.107.36-.396.634-.756.718-.551.128-1.1-.22-1.23-.781a1.05 1.05 0 01.757-1.26zm-.064-4.39c.314.32.49.753.49 1.206 0 .452-.176.886-.49 1.206-.315.32-.74.5-1.185.5-.444 0-.87-.18-1.184-.5a1.727 1.727 0 010-2.412 1.654 1.654 0 012.369 0zm-11.243.163c.364.484.447 1.128.218 1.691a1.665 1.665 0 01-2.188.923c-.855-.36-1.26-1.358-.907-2.228a1.68 1.68 0 011.33-1.038c.593-.08 1.183.169 1.547.652zm11.545-4.221c.368 0 .708.2.892.524.184.324.184.724 0 1.048a1.026 1.026 0 01-.892.524c-.568 0-1.03-.47-1.03-1.048 0-.579.462-1.048 1.03-1.048zm-14.358 0c.368 0 .707.2.891.524.184.324.184.724 0 1.048a1.026 1.026 0 01-.891.524c-.569 0-1.03-.47-1.03-1.048 0-.579.461-1.048 1.03-1.048zm10.031-1.475c.925 0 1.675.764 1.675 1.706s-.75 1.705-1.675 1.705-1.674-.763-1.674-1.705c0-.942.75-1.706 1.674-1.706zm-2.626-.684c.362-.082.653-.356.761-.718a1.062 1.062 0 00-.238-1.028 1.017 1.017 0 00-.996-.294c-.547.14-.881.7-.752 1.257.13.558.675.907 1.225.783zm0 16.876c.359-.087.644-.36.75-.72a1.062 1.062 0 00-.237-1.019 1.018 1.018 0 00-.985-.301 1.037 1.037 0 00-.762.717c-.108.361-.017.754.239 1.028.245.263.606.377.953.305l.043-.01zM17.19 3.5a.631.631 0 00.628-.64c0-.355-.279-.64-.628-.64a.631.631 0 00-.628.64c0 .355.28.64.628.64zm-10.38 0a.631.631 0 00.628-.64c0-.355-.28-.64-.628-.64a.631.631 0 00-.628.64c0 .355.279.64.628.64zm-5.182 7.852a.631.631 0 00-.628.64c0 .354.28.639.628.639a.63.63 0 00.627-.606l.001-.034a.62.62 0 00-.628-.64zm5.182 9.13a.631.631 0 00-.628.64c0 .355.279.64.628.64a.631.631 0 00.628-.64c0-.355-.28-.64-.628-.64zm10.38.018a.631.631 0 00-.628.64c0 .355.28.64.628.64a.631.631 0 00.628-.64c0-.355-.279-.64-.628-.64zm5.182-9.148a.631.631 0 00-.628.64c0 .354.279.639.628.639a.631.631 0 00.628-.64c0-.355-.28-.64-.628-.64zm-.384-4.992a.24.24 0 00.244-.249.24.24 0 00-.244-.249.24.24 0 00-.244.249c0 .142.122.249.244.249zM11.991.497a.24.24 0 00.245-.248A.24.24 0 0011.99 0a.24.24 0 00-.244.249c0 .133.108.236.223.247l.021.001zM2.011 6.36a.24.24 0 00.245-.249.24.24 0 00-.244-.249.24.24 0 00-.244.249.24.24 0 00.244.249zm0 11.263a.24.24 0 00-.243.248.24.24 0 00.244.249.24.24 0 00.244-.249.252.252 0 00-.244-.248zm19.995-.018a.24.24 0 00-.245.248.24.24 0 00.245.25.24.24 0 00.244-.25.252.252 0 00-.244-.248z\"></path>", "moonshot": "<path d=\"M21.846 0a1.923 1.923 0 110 3.846H20.15a.226.226 0 01-.227-.226V1.923C19.923.861 20.784 0 21.846 0z\"></path><path d=\"M11.065 11.199l7.257-7.2c.137-.136.06-.41-.116-.41H14.3a.164.164 0 00-.117.051l-7.82 7.756c-.122.12-.302.013-.302-.179V3.82c0-.127-.083-.23-.185-.23H3.186c-.103 0-.186.103-.186.23V19.77c0 .128.083.23.186.23h2.69c.103 0 .186-.102.186-.23v-3.25c0-.069.025-.135.069-.178l2.424-2.406a.158.158 0 01.205-.023l6.484 4.772a7.677 7.677 0 003.453 1.283c.108.012.2-.095.2-.23v-3.06c0-.117-.07-.212-.164-.227a5.028 5.028 0 01-2.027-.807l-5.613-4.064c-.117-.078-.132-.279-.028-.381z\"></path>", "doubao": "<path d=\"M5.31 15.756c.172-3.75 1.883-5.999 2.549-6.739-3.26 2.058-5.425 5.658-6.358 8.308v1.12C1.501 21.513 4.226 24 7.59 24a6.59 6.59 0 002.2-.375c.353-.12.7-.248 1.039-.378.913-.899 1.65-1.91 2.243-2.992-4.877 2.431-7.974.072-7.763-4.5l.002.001z\" fill-opacity=\".5\"></path><path d=\"M22.57 10.283c-1.212-.901-4.109-2.404-7.397-2.8.295 3.792.093 8.766-2.1 12.773a12.782 12.782 0 01-2.244 2.992c3.764-1.448 6.746-3.457 8.596-5.219 2.82-2.683 3.353-5.178 3.361-6.66a2.737 2.737 0 00-.216-1.084v-.002zM14.303 1.867C12.955.7 11.248 0 9.39 0 7.532 0 5.883.677 4.545 1.807 2.791 3.29 1.627 5.557 1.5 8.125v9.201c.932-2.65 3.097-6.25 6.357-8.307.5-.318 1.025-.595 1.569-.829 1.883-.801 3.878-.932 5.746-.706-.222-2.83-.718-5.002-.87-5.617h.001z\"></path><path d=\"M17.305 4.961a199.47 199.47 0 01-1.08-1.094c-.202-.213-.398-.419-.586-.622l-1.333-1.378c.151.615.648 2.786.869 5.617 3.288.395 6.185 1.898 7.396 2.8-1.306-1.275-3.475-3.487-5.266-5.323z\" fill-opacity=\".5\"></path>", "xai": "<path d=\"M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815\"></path>", "mistral": "<path clip-rule=\"evenodd\" d=\"M3.428 3.4h3.429v3.428h3.429v3.429h-.002 3.431V6.828h3.427V3.4h3.43v13.714H24v3.429H13.714v-3.428h-3.428v-3.429h-3.43v3.428h3.43v3.429H0v-3.429h3.428V3.4zm10.286 13.715h3.428v-3.429h-3.427v3.429z\"></path>", "deepseek": "<path d=\"M23.748 4.482c-.254-.124-.364.113-.512.234-.051.039-.094.09-.137.136-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.156-.708-.311-.955-.65-.172-.241-.219-.51-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.093.172.187.129.323-.082.28-.18.552-.266.833-.055.179-.137.217-.329.14a5.526 5.526 0 01-1.736-1.18c-.857-.828-1.631-1.742-2.597-2.458a11.365 11.365 0 00-.689-.471c-.985-.957.13-1.743.388-1.836.27-.098.093-.432-.779-.428-.872.004-1.67.295-2.687.684a3.055 3.055 0 01-.465.137 9.597 9.597 0 00-2.883-.102c-1.885.21-3.39 1.102-4.497 2.623C.082 8.606-.231 10.684.152 12.85c.403 2.284 1.569 4.175 3.36 5.653 1.858 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.133-.284 4.994-1.86.47.234.962.327 1.78.397.63.059 1.236-.03 1.705-.128.735-.156.684-.837.419-.961-2.155-1.004-1.682-.595-2.113-.926 1.096-1.296 2.746-2.642 3.392-7.003.05-.347.007-.565 0-.845-.004-.17.035-.237.23-.256a4.173 4.173 0 001.545-.475c1.396-.763 1.96-2.015 2.093-3.517.02-.23-.004-.467-.247-.588zM11.581 18c-2.089-1.642-3.102-2.183-3.52-2.16-.392.024-.321.471-.235.763.09.288.207.486.371.739.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.167-1.361-.802-2.5-1.86-3.301-3.307-.774-1.393-1.224-2.887-1.298-4.482-.02-.386.093-.522.477-.592a4.696 4.696 0 011.529-.039c2.132.312 3.946 1.265 5.468 2.774.868.86 1.525 1.887 2.202 2.891.72 1.066 1.494 2.082 2.48 2.914.348.292.625.514.891.677-.802.09-2.14.11-3.054-.614zm1-6.44a.306.306 0 01.415-.287.302.302 0 01.2.288.306.306 0 01-.31.307.303.303 0 01-.304-.308zm3.11 1.596c-.2.081-.399.151-.59.16a1.245 1.245 0 01-.798-.254c-.274-.23-.47-.358-.552-.758a1.73 1.73 0 01.016-.588c.07-.327-.008-.537-.239-.727-.187-.156-.426-.199-.688-.199a.559.559 0 01-.254-.078c-.11-.054-.2-.19-.114-.358.028-.054.16-.186.192-.21.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.391.451.462.576.685.914.176.265.336.537.445.848.067.195-.019.354-.25.452z\"></path>"};
const GENERIC_GLYPH = '<circle cx="10" cy="10" r="6.5"/><path d="M10 6.5v7M6.5 10h7"/>';
function glyph(id, cls) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", GLYPHS[id] ? "0 0 24 24" : "0 0 20 20");
  s.setAttribute("class", "pg " + (GLYPHS[id] ? "logo " : "") + (cls || ""));
  s.innerHTML = GLYPHS[id] || GENERIC_GLYPH;
  return s;
}
function moveHl(wrap, target) {
  const hl = wrap.querySelector(".hl");
  if (!hl || !target) return;
  const w = wrap.getBoundingClientRect();
  const t = target.getBoundingClientRect();
  hl.style.left = t.left - w.left + wrap.scrollLeft + "px";
  hl.style.top = t.top - w.top + wrap.scrollTop + "px";
  hl.style.width = t.width + "px";
  hl.style.height = t.height + "px";
}
function renderProviderSplit(body) {
  const split = el("div", "psplit");
  const list = el("div", "plist");
  const hl = el("div", "hl");
  list.append(hl);
  const det = el("div", "pdet");
  const fillDet = () => {
    const p = provOf(ob.provider);
    det.innerHTML = "";
    det.append(glyph(p.id, "big"), el("b", "", p.name), el("p", "", p.desc || ""));
    det.append(el("span", "vtag" + (p.vision === false ? " no" : ""), p.vision === false ? "不能看图" : "支持图片"));
    const kv = el("div", "kv");
    if (p.region) kv.append(el("span", "", "地区"), el("span", "", p.region === "cn" ? "国内可直连" : "国际"));
    kv.append(el("span", "", "看图"), el("span", "", p.vision === false ? "不支持（靠读取页面结构）" : "支持"), el("span", "", "下一步"), el("span", "", "填入 API Key"));
    det.append(kv);
  };
  provList.forEach((p, i) => {
    const b = el("button", "prow" + (ob.provider === p.id ? " on" : ""));
    b.style.setProperty("--i", i);
    const short = String(p.name).split(/[（(]/)[0].trim();
    b.title = p.name;
    b.append(glyph(p.id), el("span", "n", short));
    b.onclick = () => {
      if (ob.provider !== p.id) Object.assign(ob, { provider: p.id, key: "", models: [], model: "", tested: false, rec: "idle", picked: false });
      recToken++;
      list.querySelectorAll(".prow").forEach((r) => r.classList.toggle("on", r === b));
      moveHl(list, b);
      fillDet();
    };
    list.append(b);
  });
  fillDet();
  det.addEventListener("mousemove", (e) => {
    const r = det.getBoundingClientRect();
    det.style.setProperty("--mx", e.clientX - r.left + "px");
    det.style.setProperty("--my", e.clientY - r.top + "px");
    det.style.transform = `perspective(700px) rotateX(${-((e.clientY - r.top) / r.height - 0.5) * 5}deg) rotateY(${((e.clientX - r.left) / r.width - 0.5) * 5}deg)`;
  });
  det.addEventListener("mouseleave", () => (det.style.transform = ""));
  split.append(list, det);
  body.append(split);
  const place = () => moveHl(list, list.querySelector(".prow.on"));
  [30, 400].forEach((d) => setTimeout(place, d));
}

// 不能点时显示灰色，并用提示气泡说明原因（用 aria-disabled，这样鼠标移上去仍能看到原因）
function setNext(disabled, reason) {
  const n = $("obNext");
  n.setAttribute("aria-disabled", disabled ? "true" : "false");
  if (disabled) n.dataset.tip = reason || (ob.step === 1 ? "先点“测试连接”，成功后才能继续" : "先选一个模型");
  else delete n.dataset.tip;
}
function obRender() {
  const body = $("obBody");
  body.innerHTML = "";
  document.querySelectorAll("#obDots i").forEach((d, i) => d.classList.toggle("on", i <= ob.step));
  $("obBack").style.visibility = ob.step === 0 || ob.step === 3 ? "hidden" : "visible";
  $("obSkip").style.visibility = ob.step === 3 ? "hidden" : "visible";
  const next = $("obNext");
  setNext(false);
  next.textContent = ob.step === 3 ? "开始使用" : "下一步";
  if (ob.step === 0) {
    body.append(el("h1", "", "选择你的助手"), el("p", "", "它将在右侧的 Tableau 中代你操作，之后可随时在设置中更换。"));
    renderProviderSplit(body);
  } else if (ob.step === 1) {
    const p = provOf(ob.provider);
    body.append(el("h1", "", `填写 ${p.name} 的密钥`), el("p", "", "密钥仅保存在本机，并经系统钥匙串加密。填好后，先测试连接。"));
    const inp = el("input", "text");
    inp.type = "password";
    inp.placeholder = p.placeholder || "API Key";
    inp.autocomplete = "off";
    inp.value = ob.key;
    const res = el("span", "res");
    const test = el("button", "btn", "测试连接");
    const run = async () => {
      ob.key = inp.value.trim();
      if (!ob.key) return;
      test.disabled = true;
      res.className = "res";
      res.textContent = "正在检测可用模型…";
      let r;
      try {
        r = api.providers ? await api.providers.test(ob.provider, ob.key) : { ok: false, error: "当前版本不支持检测" };
      } catch (e) {
        r = { ok: false, error: String((e && e.message) || e) };
      }
      test.disabled = false;
      if (r && r.ok) {
        ob.models = (r.models || []).map((m) => (typeof m === "string" ? { id: m, note: "" } : m));
        ob.builtin = ob.models.map((m) => ({ ...m }));
        const rec = ob.models.find((m) => m.recommended) || ob.models[0];
        ob.model = rec ? rec.id : "";
        ob.picked = false;
        ob.tested = true;
        startRecommend();
        res.className = "res ok";
        res.textContent = `连接成功，找到 ${ob.models.length} 个模型`;
        setNext(false);
      } else {
        ob.tested = false;
        res.className = "res bad";
        res.textContent = (r && r.error) || "连接失败，请检查 Key";
        setNext(true);
      }
    };
    test.onclick = run;
    inp.onkeydown = (e) => e.key === "Enter" && !e.isComposing && run();
    inp.oninput = () => {
      recToken++;
      ob.rec = "idle";
      ob.tested = false;
      setNext(true);
      res.textContent = "";
    };
    const row = el("div", "ob-test");
    row.append(test, res);
    const lead = body.querySelector("p");
    if (lead) addInfo(lead, "API Key 相当于你的“通行证”：TabPilot 用它替你调用 AI。它只保存在这台电脑上，用系统钥匙串加密，不会发给别人；也不要把它发给别人。");
    const guide = el("div", "keyguide");
    guide.append(el("b", "", "还没有密钥？三步即可获得"));
    const ol = el("ol");
    ["打开下面的网址（点“复制网址”，粘贴到浏览器里）并登录。", "找到“API Keys / 密钥”页面，点“创建”。", "复制那一串字符，回到这里粘贴到上面的框里。"].forEach((t) => ol.append(el("li", "", t)));
    guide.append(ol);
    const isUrl = /^https?:\/\//.test(p.help || "");
    if (isUrl) {
      guide.append(el("span", "url", p.help));
      const acts = el("div", "acts");
      if (api.openExternal) {
        const open = el("button", "btn", "打开网页");
        open.onclick = () => api.openExternal(p.help);
        acts.append(open);
      }
      const copy = el("button", "btn", "复制网址");
      copy.onclick = async () => {
        try {
          await navigator.clipboard.writeText(p.help);
          copy.textContent = "已复制";
        } catch {
          copy.textContent = "请手动选中复制";
        }
        setTimeout(() => (copy.textContent = "复制网址"), 1600);
      };
      acts.append(copy);
      guide.append(acts);
    } else if (p.help) guide.append(el("div", "hint", p.help));
    guide.append(el("div", "hint", "第一次使用可能要先充值或绑定付款方式，按对方页面提示完成即可。"));
    body.append(inp, row, guide);
    setNext(!ob.tested);
    setTimeout(() => inp.focus(), 50);
  } else if (ob.step === 2) {
    body.append(el("h1", "", "选择模型"), el("p", "", "以下是这把密钥可用的模型，推荐项已为你标出。"));
    addInfo(body.querySelector("p"), "模型就像不同档次的助手：贵的更稳、更聪明，便宜的更快。不确定就选带“推荐”的那个。");
    if (ob.rec === "loading") {
      const l = el("div", "rec-loading");
      l.append(el("span", "spin-dot"), document.createTextNode("正在为你挑选模型…"));
      body.append(l);
    } else if (ob.rec === "ai") body.append(el("div", "hint", "推荐由 TabPilot 根据自己的需要挑选。"));
    else if (ob.rec === "fallback") body.append(el("div", "hint", "TabPilot 暂时没能给出推荐，下面用的是内置推荐。"));
    if (!ob.models.length) body.append(el("div", "hint", "没有检测到模型，可以返回上一步重新测试。"));
    for (const m of ob.models) {
      const b = el("button", "opt" + (ob.model === m.id ? " on" : ""));
      b.append(el("span", "mk"));
      const t = el("div");
      const tt = el("div", "tt");
      tt.append(document.createTextNode(m.name || m.id));
      if (m.recommended && ob.rec !== "loading") tt.append(el("span", "rec", "推荐"));
      t.append(tt);
      if (m.name && m.name !== m.id) t.append(el("div", "dd", m.id));
      const nd = el("div", "dd note-slot", m.note && ob.rec !== "loading" ? m.note : "");
      t.append(nd);
      b.append(t);
      b.onclick = () => {
        ob.model = m.id;
        ob.picked = true;
        obRender();
      };
      body.append(b);
    }
    setNext(!ob.model);
  } else {
    const done = el("div", "ob-done");
    done.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    body.append(done, el("h1", "", "一切就绪"), el("p", "", "现在，说出你想看的图吧。"));
    const sum = el("div", "ob-sum");
    sum.append(el("span", "", "AI"), el("span", "", provOf(ob.provider).name), el("span", "", "模型"), el("span", "", ob.model));
    body.append(sum);
  }
}
async function openOnboard(opts) {
  await loadProviders();
  recToken++;
  Object.assign(ob, { step: 0, key: "", models: [], model: "", tested: false, rec: "idle", picked: false });
  api.getSettings().then((s) => {
    ob.provider = s.provider || "claude";
    ob.before = { provider: s.provider, model: modelOf(s) };
    if (opts && opts.step === 1) ob.step = 1;
    obRender();
  });
  $("onboard").classList.remove("hidden");
  $("settings").classList.add("hidden");
  setInertUnder(true);
}
const closeOnboard = () => {
  $("onboard").classList.add("hidden");
  setInertUnder(false);
  if (!coachDone()) showCoach();
};
$("obSkip").onclick = closeOnboard;
$("obBack").onclick = () => {
  ob.step = Math.max(0, ob.step - 1);
  obRender();
};
$("obNext").onclick = async () => {
  if ($("obNext").getAttribute("aria-disabled") === "true") return;
  if (ob.step === 2) {
    setNext(true, "正在保存…");
    let r;
    try {
      r = api.providers
        ? await api.providers.save(ob.provider, ob.key, ob.model)
        : (await api.setKey(ob.provider, ob.key), await api.updateSettings({ provider: ob.provider, [ob.provider === "claude" ? "claudeModel" : "deepseekModel"]: ob.model }));
    } catch (e) {
      add(el("div", "msg error", "保存失败：" + String((e && e.message) || e)));
      setNext(false);
      return;
    }
    // 只有换了助手或模型才开始新对话；仅更新 Key 不动对话
    const changed = !ob.before || ob.before.provider !== ob.provider || ob.before.model !== ob.model;
    if (changed) {
      await api.reset();
      add(el("div", "msg note", "已更换助手，新对话开始"));
    }
    refreshSettings();
    ob.step = 3;
    obRender();
  } else if (ob.step === 3) {
    closeOnboard();
    input.focus();
  } else {
    ob.step++;
    obRender();
  }
};

// ---------- 项目标签（每个项目 = 右侧一个独立的 Tableau 页面） ----------
const TAB_ICONS = {
  chart: '<path d="M4 16V9M10 16V4M16 16v-5"/>',
  map: '<path d="M3 5.5l4.5-2 5 2 4.5-2v11l-4.5 2-5-2-4.5 2z"/><path d="M7.5 3.5v11M12.5 5.5v11"/>',
  table: '<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M3 9h14M8.5 9v7"/>',
  home: '<path d="M3.5 9.5L10 4l6.5 5.5"/><path d="M5.5 8.5V16h9V8.5"/>',
  data: '<ellipse cx="10" cy="5.5" rx="6" ry="2.5"/><path d="M4 5.5v9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-9M4 10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5"/>',
};
const svgIcon = (name) => {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", "0 0 20 20");
  s.innerHTML = TAB_ICONS[name] || TAB_ICONS.chart;
  return s;
};
let tabDragId = null;
function renderTabs(st) {
  const box = $("tabs");
  box.innerHTML = "";
  const solo = st.projects.length <= 1;
  for (const p of st.projects) {
    const t = el("div", "tab" + (p.id === st.activeId ? " active" : "") + (solo ? " solo" : ""));
    t.setAttribute("role", "tab");
    t.setAttribute("aria-selected", p.id === st.activeId ? "true" : "false");
    t.tabIndex = 0;
    t.title = p.title || p.name;
    t.draggable = true;
    t.append(svgIcon(p.icon));
    const nm = el("span", "nm", p.name);
    t.append(nm);
    const x = el("button", "x");
    x.title = "关闭项目";
    x.setAttribute("aria-label", "关闭项目");
    x.innerHTML = '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor"><path d="M5 5l10 10M15 5L5 15"/></svg>';
    x.onclick = (e) => {
      e.stopPropagation();
      api.projects.close(p.id);
    };
    t.append(x);
    t.onclick = () => p.id !== st.activeId && api.projects.switch(p.id);
    t.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") t.click();
      // 键盘替代拖动：Alt + 左右方向键移动标签
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        const ids = st.projects.map((q) => q.id);
        const i = ids.indexOf(p.id);
        const j = i + (e.key === "ArrowLeft" ? -1 : 1);
        if (j < 0 || j >= ids.length) return;
        ids.splice(i, 1);
        ids.splice(j, 0, p.id);
        api.projects.reorder(ids);
      }
    };
    nm.ondblclick = (e) => {
      e.stopPropagation();
      const inp = el("input");
      inp.value = p.name;
      nm.replaceWith(inp);
      inp.focus();
      inp.select();
      let done = false;
      const commit = (save) => {
        if (done) return;
        done = true;
        if (save && inp.value.trim() && inp.value.trim() !== p.name) api.projects.rename(p.id, inp.value.trim());
        else renderTabs(st);
      };
      inp.onkeydown = (ev) => {
        if (ev.isComposing) return;
        if (ev.key === "Enter") commit(true);
        if (ev.key === "Escape") commit(false);
        ev.stopPropagation();
      };
      inp.onblur = () => commit(true);
      inp.onclick = (ev) => ev.stopPropagation();
    };
    t.ondragstart = (e) => {
      tabDragId = p.id;
      e.dataTransfer.effectAllowed = "move";
    };
    t.ondragover = (e) => {
      if (tabDragId && tabDragId !== p.id) {
        e.preventDefault();
        t.classList.add("dragover");
      }
    };
    t.ondragleave = () => t.classList.remove("dragover");
    t.ondrop = (e) => {
      e.preventDefault();
      t.classList.remove("dragover");
      if (!tabDragId || tabDragId === p.id) return;
      const ids = st.projects.map((q) => q.id).filter((i) => i !== tabDragId);
      ids.splice(ids.indexOf(p.id), 0, tabDragId);
      tabDragId = null;
      api.projects.reorder(ids);
    };
    t.ondragend = () => (tabDragId = null);
    box.append(t);
  }
  const add = el("button", "tab add");
  add.title = "新建项目";
  add.setAttribute("aria-label", "新建项目");
  add.innerHTML = '<svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12"/></svg>';
  add.onclick = () => api.projects.create();
  box.append(add);
}
if (api.projects) {
  api.projects.list().then(renderTabs);
  api.onProjects(renderTabs);
}
// 标签栏画在窗口顶部，右侧 Tableau 视图要让出这一行
if (api.setTopInset) api.setTopInset(52);

refreshSettings().then(async (s) => {
  applyWidth(s.splitLeft);
  const configured = api.providers && api.providers.isConfigured ? await api.providers.isConfigured() : !!s.hasKey[s.provider];
  if (!configured) openOnboard();
  else if (!coachDone()) showCoach();
});

// 最后启动界面语言（翻译已有的和之后出现的文案）
i18n.start();

// 窗口失焦时暂停极光，省电省显卡
window.addEventListener("blur", () => document.documentElement.classList.add("paused"));
window.addEventListener("focus", () => document.documentElement.classList.remove("paused"));
