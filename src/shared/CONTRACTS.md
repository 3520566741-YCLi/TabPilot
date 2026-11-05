# 模块接口约定（多人并行时以此为准）

## 文件归属

| 文件 | 负责人 |
|---|---|
| `renderer/index.html`、`renderer/style.css`、`renderer/renderer.js` | UI 线程 |
| `src/main/*.ts`（main、preload、tools、tableau、browser、agent、prompt、settings、projects、knowledge）、`package.json` | 主线程 |
| `src/main/voice.ts`、`native/` | 语音（已交付，改动先和主线程说） |
| `src/main/twb.ts`、`src/main/jev.ts` | 已交付，改动先和主线程说 |

UI 线程需要主进程新增接口时，在本文件末尾“待办”里写下来并告诉主线程，不要直接改 main/preload。

## window.api（preload 暴露给渲染进程）

### 设置
- `getSettings(): Promise<Settings>`
  `Settings = { provider: 上面列表里的 id, models: { [providerId]: modelId }, claudeModel, deepseekModel（兼容旧字段）, splitLeft: number, theme: "system"|"light"|"dark", suggestions: boolean, jevVerify: boolean, hasKey: { [providerId | "jev"]: boolean } }`
- `updateSettings(patch: Partial<Settings>): Promise<Settings>`（theme / suggestions / jevVerify 也走这里）
- `setKey(provider: "claude"|"deepseek"|"jev", key: string): Promise<Settings>`（空字符串 = 删除）

### 首次使用引导（提供方与模型）
- `providers.list(): Promise<{ id, name, desc, vision: boolean, placeholder?, help? }[]>`：支持的提供方（claude、openai、gemini、qwen、zhipu、moonshot、doubao、xai、mistral、deepseek）。help 是获取 Key 的网址。vision 指该提供方有能看图的模型；具体模型能否看图在第一次对话时用一张极小的图实测（DeepSeek 新模型如 V4.1 Flash 能看图就会用截图，旧模型自动退回读页面结构）
- test / recommend / save 的 provider 参数都用上面的 id
- `providers.isConfigured(): Promise<boolean>`：当前提供方是否已保存 Key；false 时显示引导页
- `providers.test(provider: "claude"|"deepseek", key: string): Promise<TestResult>`：用这个 Key 实际请求一次，列出可用模型
  `TestResult = { ok: boolean, models: { id, name, recommended: boolean, note: string }[], recommended: string|null, error?: string }`
  models 已按推荐顺序排好；note 是给用户看的一句话（例如“推荐：操作网页最稳”）；error 是可直接显示的中文
- `providers.recommend(provider, key, modelIds: string[]): Promise<{ recommended: string, notes: Record<modelId, string> } | null>`：用这个 Key 调一次模型，让 AI 根据本软件的需求推荐模型并给每个模型一句说明（约 3~10 秒）。返回 null 表示失败，此时用 test 结果里的内置推荐（recommended / note）
- `providers.save(provider, key, model): Promise<Settings>`：保存 Key（加密）和所选模型，并设为当前提供方（key 传空串表示沿用已保存的）
- 内置推荐（兜底）：Claude → claude-opus-5-5（最稳），claude-sonnet-5-5（更便宜）；DeepSeek → deepseek-chat（推荐），deepseek-reasoner（较慢，操作网页不如 chat）

### 分栏与右侧页面
- `splitDrag(phase: "start"|"move"|"end", x: number)`：左栏宽度（拖动期间右侧页面暂时隐藏）
- `nav("back"|"reload"|"home")`
- `onUrl(cb: (url: string) => void)`：右侧当前项目的网址变化
- `setTopInset(px: number)`：右侧 Tableau 视图距窗口顶部的高度（项目标签栏占用的高度，标签栏画在左侧渲染进程里时传 0）

### 账户/登录实时教程（不依赖 AI、不需要 Key）
- `tableauState(): Promise<AuthState>`、`onTableauState(cb)`：右侧当前项目页面在账户流程的哪一步，变化时推送（每 2 秒检测一次）
  `AuthState = { state, url, title }`，state 取值：
  `cookie-banner`（Cookie 同意横幅挡着，需用户自己选）、`signed-out`（未登录，有 Sign In/登录 按钮）、`login-page`（登录页，有密码或邮箱框）、`signup-page`（注册页）、`verify`（邮箱验证/验证码/两步验证）、`signed-in`（已登录）、`authoring`（已在 Web 制作编辑器里）、`loading`、`other`
- `pointAt(query, caption): Promise<boolean>`：只把 AI 光标移到右侧页面上名称包含 query 的元素旁并显示 caption（不点击），例如 `pointAt("Sign In", "点这里登录")`。找不到返回 false
- 红线：AI 不代填账号密码、不替用户点登录/注册提交，只做指引

### 左侧空状态推荐
- `suggestNext(hint: {state, url, title}): Promise<null | { show, title, lead?, suggestions: string[] }>`：用用户自己的 AI 根据右侧页面推荐 2~4 条可直接点击发送的需求；没有 Key 或失败返回 null（用默认示例）；同样页面内容会缓存

### 项目（每个项目 = 右侧一个独立的 Tableau 页面，切换不关闭旧的）
- `projects.list(): Promise<ProjectState>`
- `projects.create(name?: string): Promise<ProjectState>`：新建项目（新页面打开 Tableau Public 首页）并切过去
- `projects.switch(id: string): Promise<ProjectState>`
- `projects.close(id: string): Promise<ProjectState>`（至少保留 1 个）
- `projects.rename(id: string, name: string): Promise<ProjectState>`
- `projects.reorder(ids: string[]): Promise<ProjectState>`
- `onProjects(cb: (s: ProjectState) => void)`：任何变化（包括 AI 自己切换、网址/标题变化）都会推送
- `ProjectState = { activeId: string, projects: { id, name, url, title, icon: "chart"|"map"|"table"|"home"|"data", updatedAt: number }[] }`

### 对话
- `send(payload: { text: string, images?: {data, mediaType, name}[], files?: string[], tutorial?: boolean }): Promise<{ok}|{error}>`
- `stop()`、`reset()`
- `answer(id: string, answer: string)`：回答 ask / confirm 卡片
- `undo(changeId: string): Promise<{ ok: boolean, message: string }>`：撤销某一步（在 Tableau 里按撤消，只允许撤销最近的连续几步）
- `pickWorkbook()`、`pickFiles()`、`readImage(path)`、`captureTableau()`、`pathForFile(file)`、`exportSteps(markdown)`
- 语音：先调 `voiceMode(): Promise<{ mode: "provider"|"local", provider }>`
  - `local`：`voiceStart()` / `voiceStop()` / `onVoice(cb)`（macOS 本机识别，首次会弹麦克风和语音识别授权）
  - `provider`：渲染进程用 `navigator.mediaDevices.getUserMedia({audio:true})` + `MediaRecorder` 录音，停止后把音频 base64 交给 `voiceTranscribe(base64, mimeType): Promise<{ text?: string, error?: string }>`
  - 用户已决定只用本机识别：`voiceMode()` 目前固定返回 `local`，设置页不需要“语音识别”选项

### onExternalMessage(cb)
- `onExternalMessage(cb: (m: { text: string }) => void)`：不是从输入框发出的用户消息（例如自动化验收脚本代发），请像用户自己发的一样显示成用户气泡，并进入“运行中”状态

### onEvent(cb)：`agent:event`
| type | 字段 | 说明 |
|---|---|---|
| `text` | `delta` | AI 回复文字（流式） |
| `thinking` | `delta` | 思考摘要（流式） |
| `tool` | `id, name, input` | 开始执行一个工具 |
| `tool_result` | `id, text, isError?, image?` | 工具结果（image 为 PNG base64） |
| `ask` | `id, question, options: string[], danger?: boolean` | 需要用户回答；`danger: true` 时第一个选项是危险操作（发布/公开保存/删除），按钮要标红、写清楚后果 |
| `ask_resolved` | `id, answer` | 某个 ask/confirm 已经解决（用户在卡片上回答、AI 被停止、或在别处回答了），左侧把对应卡片标记为已解决并收起，显示“已处理：answer” |
| `confirm` | `id, title, steps: {text: string, danger?: boolean}[], danger?: boolean, okLabel, cancelLabel` | 多步操作前的确认卡，用户点了才执行；用 `answer(id, okLabel 或 cancelLabel)` 回复 |
| `change` | `id, text, undoable: boolean` | 一步操作完成后的一句话说明（可撤销时显示“撤销”） |
| `suggest` | `id, title, detail, actions: {id, label}[], multi?: boolean` | 改进建议卡：detail 里有参考样例链接（可点击，用 openExternal 打开）；actions 是可点选的改进项，multi=true 时可多选并有“按所选去做”按钮，单选时点一下就发。发送内容：`send({text: "按这几条改：\n1. …\n2. …"})`，AI 收到后直接执行不再确认 |
| `file` | `path` | 下载/导出完成的文件路径 |
| `usage` | `model, input, output, cacheRead` | 本轮用量（每次模型请求后发一次） |
| `status` | `text` | 状态栏文字 |
| `error` | `text` | 出错（中文，可直接显示） |
| `done` | `stopped?` | 本轮结束 |

## AI 光标
AI 光标（② 协作头像光标）画在右侧 Tableau 页面内部（注入页面的覆盖层，pointer-events:none），由主线程在 `browser.ts` 实现，渲染进程不用管。

## 待办（UI 线程写在这里）

### 版本与旧版本清理
- `appVersion(): Promise<string>`：当前版本（取自 package.json，例如 "0.1.0"），设置页底部显示“TabPilot v0.1.0”
- `onOldCopies(cb({ current, copies }))`：启动约 3 秒后，如果在 /Applications、~/Applications、桌面、下载、桌面/TabPilot/mac 里发现不比当前新的 TabPilot.app / 旧名 Tableau AI.app，或更旧版本的安装包（.dmg/.exe），推送一次。`copies: { path, kind: "app"|"installer", version }[]`
  左侧显示确认卡：列出路径和版本（可逐个勾选），按钮“移到废纸篓”（红色，说明可从废纸篓恢复）、“以后再说”、勾选“不再提醒”
- `oldCopies.list()`：重新扫描（用户勾了不再提醒时返回 []）
- `oldCopies.trash(paths): Promise<{ removed, failed }>`：只能删本次扫描到的路径，移到废纸篓（不永久删除）；不会动设置、Key、登录状态
- `oldCopies.ignore()`：不再提醒

### 外部链接
- `openExternal(url)`：用系统浏览器打开 http/https 网址（其他协议忽略）。providers.list() 的 help 字段都是获取 Key 的 https 网址

## 语言（中英双语）
- 设置：`updateSettings({ language: "system"|"zh"|"en", uiLang: "zh"|"en" })`，uiLang 是渲染进程算出的实际界面语言。主进程据此切换菜单、原生对话框、改动说明、确认框按钮、错误提示、提供方列表（name/desc）和模型说明。
- `send({ ..., lang: "zh"|"en" })`：AI 回复、方案、建议、教程讲解跟随 lang。
- `suggestNext({ ..., lang })`：空状态推荐跟随 lang。
- 工具结果（给 AI 看的）保持中文；步骤详情里看到的原始结果不翻译。
