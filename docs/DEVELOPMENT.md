# 开发说明

## 架构

```
┌──────────────── BrowserWindow ─────────────────┐
│ 渲染进程 renderer/（聊天、项目标签、设置、引导） │  ← preload.ts 暴露 window.api
│                ┌──────────────────────────────┐ │
│                │ WebContentsView × 项目数       │ │  ← 每个项目一个 Tableau 页面
│                │ partition: persist:tableau     │ │     （projects.ts）
│                └──────────────────────────────┘ │
└─────────────────────────────────────────────────┘
主进程 src/main/
  agent.ts      Agent 外壳 + ClaudeAdapter（官方 SDK，流式、自适应思考、服务端 fallbacks、上下文清理）
                + OpenAICompatAdapter（其余 9 家，流式工具调用，按模型实测能否看图）
  tools.ts      与模型无关的工具定义和执行（TOOL_DEFS / ToolHost），改动记录与撤销，危险操作拦截
  tableau.ts    Tableau 网页版高层操作：读编辑器状态、键入表达式、拖拽字段、标记类型、工作表、上传、导出
  browser.ts    CDP 控制层：Input.dispatchMouseEvent / dispatchKeyEvent / insertText、截图、读页面元素、
                文件选择框拦截（Page.setInterceptFileChooserDialog + DOM.setFileInputFiles）、协作光标
  projects.ts   多项目管理（每个项目独立 WebContentsView，列表保存在 userData/projects.json）
  providers.ts  提供方注册表、Key 检测、模型列表与模型推荐
  settings.ts   设置与 API Key（safeStorage 加密）
  prompt.ts     系统提示词；knowledge.ts 图表制作逻辑
  twb.ts        .twb/.twbx 解析；data.ts 数据文件摘要；voice.ts + native/ 语音识别；jev.ts 快速验证
```

模块接口约定见 `src/shared/CONTRACTS.md`。

## 在真实 Tableau 网页版上验证过的关键事实
- 功能区是 `#shelf-columns`、`#shelf-rows`、`#shelf-encoding`（标记卡），胶囊是 `.tabAuthShelfPill`，度量胶囊带 `tabAuthPillMeasure`，连续带 `tabAuthPillQuantatative`；标记卡胶囊左侧的编码图标是一个 `role=combobox`，aria-label 就是编码名（颜色/大小/标签/详细信息…）。
- **双击功能区空白处会出现输入胶囊（textarea）**，`Input.insertText` 输入表达式再回车即可，最稳。标记卡上键入的新胶囊默认是“详细信息”，再点它左侧图标改成目标编码。
- **真实鼠标拖拽有效**：按下 → 先小步移动触发拖拽 → 多步移动 → 在目标上停留 → 松开。拖到数据窗格即移除胶囊。
- 拖拽得到的默认聚合不对时，用胶囊菜单的“在功能区中编辑”改表达式（比“度量”子菜单可靠）。
- 窗口在后台时第一下点击会被吞掉：每次输入前先 `webContents.focus()`，点击前先把鼠标移到目标并停 120ms。
- 新建工作簿：首页“创建”→ 菜单项 li“Web 制作”。“连接到数据”对话框刚弹出时页签不响应，要等数据源列表加载完再点“文件”。
- 上传后要把表（如 Orders）拖进数据模型画布，再切到“工作表 1”，数据提取完成后字段才出现。
- 底部“数据源”标签选中时，编辑器 DOM 仍然在，判断页面要看选中的标签。
- 工具栏“下载”菜单：图像 / 矢量图像 / 数据 / 交叉表 / PDF / PowerPoint，图像直接下载，下载由 `will-download` 接管保存到 ~/Downloads/TabPilot。
- Tableau 登录 Cookie 是会话 Cookie，软件里给它们补了 30 天过期时间并定期落盘，重启后保持登录。

## 调试
设置环境变量 `TABLEAU_AI_DEBUG_PORT=47811` 启动后，本机 127.0.0.1 上可以直接 POST 调工具：

```bash
curl -s -X POST localhost:47811 -d '{"name":"tableau_state"}'
curl -s -X POST localhost:47811 -d '{"name":"add_to_shelf","input":{"shelf":"rows","expression":"SUM([Sales])","method":"drag"}}'
curl -s -X POST localhost:47811 -d '{"name":"__send","input":{"text":"做 Bar 图"}}'   # 模拟用户发消息
curl -s -X POST localhost:47811 -d '{"name":"__events","input":{"from":0}}'          # 查看助手的事件流
```

## 打包
`npm run dist`：electron-builder 出 arm64 和 x64 两个 dmg；`build/afterPack.js` 对 .app 做 ad-hoc 签名（没有开发者证书时 Apple 芯片必须签名才能打开）。语音 helper 由 `native/build.sh` 编成通用二进制，Info.plist 嵌在二进制里，随包放在 Resources/voice-helper。
