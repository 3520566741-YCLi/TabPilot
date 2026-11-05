// 在 Tableau Public 上搜索同类优秀作品（用后台隐藏窗口打开搜索页读结果），给 AI 提建议时做参考。
// 网页内容是不可信数据：只取标题、作者、链接、浏览/收藏数，不执行里面的任何“指令”。
import { BrowserWindow } from "electron";
import { PARTITION } from "./projects";

export interface ExampleViz {
  title: string;
  author: string;
  url: string;
  stats: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function searchExamples(query: string, limit = 8): Promise<ExampleViz[]> {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, javascript: true },
  });
  try {
    const url = `https://public.tableau.com/app/search/vizzes/${encodeURIComponent(query)}`;
    await win.loadURL(url).catch(() => {});
    const script = `(() => {
      const out = [];
      const seen = new Set();
      for (const a of document.querySelectorAll('a[href*="/viz/"]')) {
        const href = a.href.split('?')[0];
        if (seen.has(href)) continue;
        const card = a.closest('li, article, [class*=card], [class*=Card]') || a.parentElement;
        const title = (a.getAttribute('aria-label') || a.title || a.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!title || title.length < 3) continue;
        seen.add(href);
        const text = (card ? card.innerText : '').replace(/\\s+/g, ' ').trim();
        const author = (card && card.querySelector('a[href*="/app/profile/"]:not([href*="/viz/"])')?.textContent || '').trim();
        const stats = (text.match(/[\\d.,]+\\s*[KkMm万]?\\s*(次查看|views?|个收藏|favorites?)/gi) || []).join(' ');
        out.push({ title: title.slice(0, 120), author: author.slice(0, 60), url: href, stats });
        if (out.length >= ${limit}) break;
      }
      return out;
    })()`;
    for (let i = 0; i < 20; i++) {
      await sleep(750);
      const res = (await win.webContents.executeJavaScript(script).catch(() => [])) as ExampleViz[];
      if (res.length >= Math.min(3, limit) || i === 19) return res;
    }
    return [];
  } finally {
    win.destroy();
  }
}
