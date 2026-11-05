// 把每一次工具调用翻成一句人话，给左侧“执行过程”显示；不露出工具名、坐标和内部参数
import path from "path";
import { L } from "./i18n";

const SHELF: Record<string, [string, string]> = {
  columns: ["列", "Columns"],
  rows: ["行", "Rows"],
  filters: ["筛选器", "Filters"],
  angle: ["角度", "Angle"],
  pages: ["页面", "Pages"],
  color: ["颜色", "Color"],
  size: ["大小", "Size"],
  label: ["标签", "Label"],
  detail: ["详细信息", "Detail"],
  tooltip: ["工具提示", "Tooltip"],
  shape: ["形状", "Shape"],
  path: ["路径", "Path"],
};

const short = (v: unknown, n = 24) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "…" : s;
};
const base = (p: unknown) => short(path.basename(String(p ?? "")), 30);
const shelf = (k: unknown) => {
  const v = SHELF[String(k ?? "").toLowerCase()];
  return v ? L(v[0], v[1]) : short(k, 12);
};

export function stepLabel(name: string, rawInput: unknown): string {
  let i: Record<string, unknown> = {};
  if (typeof rawInput === "string") {
    try {
      i = JSON.parse(rawInput) ?? {};
    } catch {
      i = {};
    }
  } else if (rawInput && typeof rawInput === "object") i = rawInput as Record<string, unknown>;

  switch (name) {
    case "screenshot":
      return L("看一眼右侧画面", "Look at the page");
    case "read_page":
    case "tableau_state":
      return L("读取当前工作表", "Read the current sheet");
    case "click":
      return i.double ? L("双击页面", "Double-click on the page") : i.button === "right" ? L("右键打开菜单", "Open a context menu") : L("点击页面", "Click on the page");
    case "drag":
      return L("拖动字段", "Drag a field");
    case "type_text":
      return L(`输入“${short(i.text)}”`, `Type “${short(i.text)}”`);
    case "key":
      return L("按键盘", "Press keys");
    case "scroll":
      return L("滚动页面", "Scroll the page");
    case "wait":
      return L("等页面加载", "Wait for the page");
    case "open_url":
      return L("打开网页", "Open a page");
    case "open_web_authoring":
      return L("新建工作簿", "Create a workbook");
    case "add_to_shelf":
      return L(`把 ${short(i.expression)} 放到${shelf(i.shelf)}`, `Put ${short(i.expression)} on ${shelf(i.shelf)}`);
    case "remove_from_shelf":
      return i.pill ? L(`从${shelf(i.shelf)}移走 ${short(i.pill)}`, `Remove ${short(i.pill)} from ${shelf(i.shelf)}`) : L(`清空${shelf(i.shelf)}`, `Clear ${shelf(i.shelf)}`);
    case "set_mark_type":
      return L(`标记类型改成 ${short(i.mark_type, 12)}`, `Set marks to ${short(i.mark_type, 12)}`);
    case "new_worksheet":
      return i.name ? L(`新建工作表“${short(i.name)}”`, `New sheet “${short(i.name)}”`) : L("新建工作表", "New sheet");
    case "switch_sheet":
      return L(`切到工作表“${short(i.name)}”`, `Go to sheet “${short(i.name)}”`);
    case "rename_sheet":
      return L(`工作表改名为“${short(i.new_name)}”`, `Rename sheet to “${short(i.new_name)}”`);
    case "upload_file":
      return L(`上传数据 ${base(i.path)}`, `Upload ${base(i.path)}`);
    case "export_view":
      return L(`导出为 ${short(i.format, 10).toUpperCase()}`, `Export as ${short(i.format, 10).toUpperCase()}`);
    case "wait_download":
      return L("等待文件下载完成", "Wait for the download");
    case "parse_workbook":
      return L(`读取工作簿 ${base(i.path)}`, `Read workbook ${base(i.path)}`);
    case "find_files":
      return L(`查找文件“${short(i.keyword)}”`, `Find files “${short(i.keyword)}”`);
    case "inspect_data_file":
      return L(`查看数据 ${base(i.path)}`, `Look at ${base(i.path)}`);
    case "ask_user":
      return L("问你一个问题", "Ask you a question");
    case "confirm_plan":
      return L("列出方案", "Lay out the plan");
    case "search_examples":
      return L(`查找优秀案例：${short(i.query)}`, `Find examples: ${short(i.query)}`);
    case "save_workbook":
      return L("保存到你的 Tableau Public（不在主页显示）", "Save to your Tableau Public (hidden from profile)");
    case "check_saved":
      return L("确认已保存并隐藏", "Check it's saved and hidden");
    case "guide_step":
      return L("带你做这一步", "Guide you through this step");
    case "offer_choices":
      return L("给你几个选项", "Offer some choices");
    case "suggest_improvement":
      return L("给出改进建议", "Suggest improvements");
    case "list_projects":
      return L("查看项目列表", "List projects");
    case "switch_project":
      return L(`切到项目“${short(i.project)}”`, `Go to project “${short(i.project)}”`);
    case "new_project":
      return L(`新建项目“${short(i.name)}”`, `New project “${short(i.name)}”`);
    default:
      return L("操作页面", "Work on the page");
  }
}
