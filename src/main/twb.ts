// 解析 .twb / .twbx，把每张工作表的行、列、标记、编码、筛选器整理成可读的建图规格
import fs from "fs";
import path from "path";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

export interface SheetSpec {
  name: string;
  columns: string[];
  rows: string[];
  mark: string;
  encodings: { channel: string; field: string }[];
  filters: string[];
  /** 行/列架上多个字段的组合方式，如 "Category / Sub-Category"（嵌套）或 "SUM(Sales) + AVG(Discount)"（并列）；单字段时为空 */
  columnsLayout?: string;
  rowsLayout?: string;
  calculations: { name: string; formula: string }[];
}

const DERIVATION: Record<string, string> = {
  Sum: "SUM", Avg: "AVG", Count: "COUNT", CountD: "COUNTD", Min: "MIN", Max: "MAX",
  Median: "MEDIAN", Attr: "ATTR", Stdev: "STDEV", Var: "VAR",
  Year: "YEAR", Quarter: "QUARTER", Month: "MONTH", Day: "DAY", Week: "WEEK", Weekday: "WEEKDAY",
  "Year-Trunc": "YEAR", "Quarter-Trunc": "QUARTER", "Month-Trunc": "MONTH", "Day-Trunc": "DAY", "Week-Trunc": "WEEK",
};

const TABLE_CALC: Record<string, string> = {
  PctTotal: "占总计百分比", CumTotal: "累计", Diff: "差异", PctDiff: "差异百分比", Rank: "排名", MovingAverage: "移动平均",
};

const MAX_TWB = 50 * 1024 * 1024; // 防止超大或恶意压缩包把内存撑爆

function readTwbXml(file: string): string {
  if (fs.statSync(file).size > 500 * 1024 * 1024) throw new Error("文件太大");
  if (file.toLowerCase().endsWith(".twbx")) {
    const zip = new AdmZip(file);
    const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".twb"));
    if (!entry) throw new Error("twbx 里没有 .twb 文件");
    if (entry.header.size > MAX_TWB) throw new Error(".twb 内容太大");
    return entry.getData().toString("utf8");
  }
  if (fs.statSync(file).size > MAX_TWB) throw new Error(".twb 文件太大");
  return fs.readFileSync(file, "utf8");
}

const asArray = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

export function parseWorkbook(file: string): SheetSpec[] {
  const xml = readTwbXml(file);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", textNodeName: "#text" });
  const doc = parser.parse(xml);
  const worksheets = asArray(doc?.workbook?.worksheets?.worksheet);
  return worksheets.map((ws: any) => parseSheet(ws));
}

function parseSheet(ws: any): SheetSpec {
  const table = ws.table ?? {};
  const view = table.view ?? {};
  // 字段实例名 -> 可读表达式
  const instances = new Map<string, string>();
  const captions = new Map<string, string>();
  const calculations: { name: string; formula: string }[] = [];
  for (const dep of asArray<any>(view["datasource-dependencies"])) {
    for (const col of asArray<any>(dep.column)) {
      const name = col["@name"] as string;
      const caption = col["@caption"] as string | undefined;
      if (caption) captions.set(name, `[${caption}]`);
      const formula = col.calculation?.["@formula"];
      if (formula && col.calculation?.["@class"] === "bin") {
        calculations.push({ name: caption ?? name, formula: `BIN(${formula}, 大小 ${col.calculation["@size"]})` });
      } else if (formula) calculations.push({ name: caption ?? name, formula: humanizeFormula(formula, captions) });
    }
    for (const ci of asArray<any>(dep["column-instance"])) {
      const colName = ci["@column"] as string;
      const field = captions.get(colName) ?? colName;
      const deriv = ci["@derivation"] as string;
      let expr: string;
      if (deriv === "None") expr = field;
      else if (deriv === "User") expr = field + "（计算字段）";
      else expr = `${DERIVATION[deriv] ?? deriv.toUpperCase()}(${field})`;
      if (/Trunc/.test(deriv)) expr += "（连续日期，绿色胶囊）";
      else if (DERIVATION[deriv] && /^(YEAR|QUARTER|MONTH|DAY|WEEK|WEEKDAY)$/.test(DERIVATION[deriv])) expr += "（离散日期，蓝色胶囊）";
      const tc = asArray<any>(ci["table-calc"])[0];
      if (tc) expr += `（表计算：${TABLE_CALC[tc["@type"]] ?? tc["@type"]}）`;
      instances.set(ci["@name"], expr);
    }
  }
  // 计算字段公式里的 [Calculation_xxx] 再替换一次 caption
  for (const c of calculations) c.formula = humanizeFormula(c.formula, captions);

  const resolve = (ref: string): string => {
    const m = ref.match(/\[[^\]]*\]\.(\[[^\]]+\])$/);
    const inst = m ? m[1] : ref;
    if (instances.has(inst)) return instances.get(inst)!;
    if (inst === "[:Measure Names]") return "度量名称";
    if (inst === "[Multiple Values]") return "度量值";
    if (/Latitude \(generated\)/.test(inst)) return "纬度(生成)";
    if (/Longitude \(generated\)/.test(inst)) return "经度(生成)";
    return inst.replace(/^\[(\w+):(.+):\w+\]$/, "$2");
  };
  const shelf = (text: any): string[] => {
    if (!text || typeof text !== "string") return [];
    const refs = text.match(/\[[^\]]+\]\.\[[^\]]+\]/g) ?? [];
    return refs.map(resolve);
  };

  const panes = asArray<any>(table.panes?.pane);
  const pane = panes[0] ?? {};
  const mark = pane.mark?.["@class"] ?? "Automatic";
  const encodings: { channel: string; field: string }[] = [];
  for (const p of panes) {
    const enc = p.encodings ?? {};
    for (const [channel, v] of Object.entries(enc)) {
      for (const item of asArray<any>(v)) {
        const field = resolve(item["@column"] ?? "");
        if (!encodings.some((e) => e.channel === channel && e.field === field)) encodings.push({ channel, field });
      }
    }
  }
  const filters = asArray<any>(view.filter).map((f) => {
    const col = resolve(f["@column"] ?? "");
    if (f["@class"] === "quantitative" && (f.min !== undefined || f.max !== undefined)) {
      return `${col} ∈ [${f.min ?? "-∞"}, ${f.max ?? "+∞"}]`;
    }
    const members = asArray<any>(f.groupfilter?.groupfilter)
      .map((g) => g["@member"] as string)
      .filter(Boolean)
      .map((m) => (/^"\[.*\]\.\[.*\]"$/.test(m) ? resolve(m.slice(1, -1)) : m));
    return members.length ? `${col} ∈ {${members.join(", ")}}` : col;
  });

  // 保留 / （嵌套）和 + （并列）运算符
  const layout = (text: any): string | undefined => {
    if (!text || typeof text !== "string") return undefined;
    if ((text.match(/\[[^\]]+\]\.\[[^\]]+\]/g) ?? []).length < 2) return undefined;
    const parts = text.split(/(\[[^\]]+\]\.\[[^\]]+\])/);
    return parts
      .map((t, i) => (i % 2 ? resolve(t) : t.replace(/[()\s]/g, "").replace(/([/+])/g, " $1 ")))
      .join("");
  };
  const colsText = typeof table.cols === "string" ? table.cols : table.cols?.["#text"];
  const rowsText = typeof table.rows === "string" ? table.rows : table.rows?.["#text"];

  return {
    name: ws["@name"],
    columns: shelf(colsText),
    rows: shelf(rowsText),
    columnsLayout: layout(colsText),
    rowsLayout: layout(rowsText),
    mark,
    encodings,
    filters,
    calculations,
  };
}

function humanizeFormula(formula: string, captions: Map<string, string>): string {
  return formula.replace(/\[[^\]]+\]/g, (m) => captions.get(m) ?? m);
}

export function describeSpec(s: SheetSpec): string {
  const lines = [`工作表「${s.name}」`];
  lines.push(`  列: ${s.columnsLayout ?? (s.columns.join("  |  ") || "（空）")}`);
  lines.push(`  行: ${s.rowsLayout ?? (s.rows.join("  |  ") || "（空）")}`);
  lines.push(`  标记类型: ${s.mark}`);
  if (s.encodings.length) lines.push(`  标记卡: ${s.encodings.map((e) => `${e.channel}=${e.field}`).join("; ")}`);
  if (s.filters.length) lines.push(`  筛选器: ${s.filters.join("; ")}`);
  for (const c of s.calculations) lines.push(`  计算字段 ${c.name} = ${c.formula}`);
  return lines.join("\n");
}

if (require.main === module) {
  // 命令行用法：node dist/main/twb.js <工作簿路径>
  const file = process.argv[2];
  if (!file) {
    console.error("用法：node dist/main/twb.js <.twb 或 .twbx 路径>");
    process.exit(1);
  }
  for (const s of parseWorkbook(file)) console.log(describeSpec(s) + "\n");
}
