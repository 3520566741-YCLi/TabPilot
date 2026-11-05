// 数据文件摘要：给 AI 看的表名、行列数、列名和推断类型、样例行
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";

const SAMPLE_ROWS = 5;

function inferType(values: unknown[]): string {
  const vs = values.filter((v) => v !== null && v !== undefined && v !== "");
  if (!vs.length) return "空";
  if (vs.every((v) => v instanceof Date)) return "日期";
  if (vs.every((v) => typeof v === "number" || (typeof v === "string" && /^-?[\d,]+(\.\d+)?$/.test(v.trim())))) {
    return vs.every((v) => Number.isInteger(typeof v === "number" ? v : Number(String(v).replace(/,/g, "")))) ? "整数" : "小数";
  }
  if (vs.every((v) => typeof v === "string" && !isNaN(Date.parse(v)) && /\d{4}|\d{1,2}[/-]\d{1,2}/.test(v))) return "日期";
  return "文本";
}

function cellValue(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === "object") {
    if ("result" in v) return (v as ExcelJS.CellFormulaValue).result ?? null;
    if ("richText" in v) return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("");
    if ("text" in v) return (v as ExcelJS.CellHyperlinkValue).text;
    return String(v);
  }
  return v;
}

const show = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v === null || v === undefined ? "" : String(v).slice(0, 40));

function describeTable(name: string, header: string[], rows: unknown[][], totalRows: number): string {
  const sampleForType = rows.slice(0, 200);
  const cols = header.map((h, i) => `${h || `列${i + 1}`}（${inferType(sampleForType.map((r) => r[i]))}）`);
  const lines = [`表「${name}」：${totalRows} 行 × ${header.length} 列`, `列：${cols.join("，")}`, "前几行："];
  for (const r of rows.slice(0, SAMPLE_ROWS)) lines.push("  " + header.map((_, i) => show(r[i])).join(" | "));
  return lines.join("\n");
}

function parseDelimited(text: string, sep: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === sep) {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cur);
      out.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  if (cur || row.length) {
    row.push(cur);
    out.push(row);
  }
  return out.filter((r) => r.some((x) => x !== ""));
}

export async function inspectDataFile(file: string): Promise<string> {
  const stat = fs.statSync(file);
  if (stat.size > 200 * 1024 * 1024) return `文件：${path.basename(file)}（${(stat.size / 1048576).toFixed(0)} MB）\n文件太大，不在本机预览；可以直接上传到 Tableau。`;
  const ext = path.extname(file).toLowerCase();
  const head = `文件：${path.basename(file)}（${(stat.size / 1024).toFixed(0)} KB）`;
  if (ext === ".xlsx" || ext === ".xlsm") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const parts = [head, `Excel 工作簿，共 ${wb.worksheets.length} 个工作表`];
    for (const ws of wb.worksheets) {
      const rows: unknown[][] = [];
      ws.eachRow({ includeEmpty: false }, (row) => {
        const vals = (row.values as ExcelJS.CellValue[]).slice(1).map(cellValue);
        rows.push(vals);
      });
      if (!rows.length) {
        parts.push(`表「${ws.name}」：空`);
        continue;
      }
      const header = (rows[0] as unknown[]).map((h) => String(h ?? ""));
      parts.push(describeTable(ws.name, header, rows.slice(1), rows.length - 1));
    }
    return parts.join("\n\n");
  }
  if (ext === ".csv" || ext === ".tsv" || ext === ".txt") {
    const text = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
    const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
    const sep = ext === ".tsv" || (firstLine.split("\t").length > firstLine.split(",").length) ? "\t" : ",";
    const rows = parseDelimited(text, sep);
    if (!rows.length) return head + "\n空文件";
    return head + "\n\n" + describeTable(path.basename(file), rows[0], rows.slice(1), rows.length - 1);
  }
  if (ext === ".json") {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const arr = Array.isArray(data) ? data : Object.values(data).find(Array.isArray);
    if (Array.isArray(arr) && arr.length && typeof arr[0] === "object") {
      const header = Object.keys(arr[0]);
      const rows = arr.map((o: Record<string, unknown>) => header.map((h) => o[h]));
      return head + "\n\n" + describeTable("JSON", header, rows, rows.length);
    }
    return head + "\nJSON 内容（前 2KB）：\n" + JSON.stringify(data).slice(0, 2048);
  }
  if (ext === ".xls") return head + "\n旧版 .xls 无法直接预览，但 Tableau 可以直接上传它。";
  if (ext === ".twb" || ext === ".twbx") return head + "\nTableau 工作簿，可用 parse_workbook 解析每张工作表的规格。";
  // 其他类型不读内容，避免把无关文件送给模型
  return head + "\n这种文件类型不读取内容。Tableau 可以直接上传 Excel、CSV、JSON 和 Tableau 工作簿。";
}

if (require.main === module) {
  inspectDataFile(process.argv[2]).then(console.log, console.error);
}
