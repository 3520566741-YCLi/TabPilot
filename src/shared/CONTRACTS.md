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

## 项目主页与本地保存（2026-11-04）
启动流程：没有可用的 Key → 首次引导；否则进入**项目主页**。主页列出本地保存的全部项目，点开即恢复。

- `ProjectState = { activeId, home: boolean, projects: ProjectInfo[], library: ProjectInfo[] }`
  - `home`：true 时右侧 Tableau 页面隐藏，左侧整窗显示主页（右侧原生视图不会挡住主页）；`activeId` 在主页时为 ""
  - `projects`：打开着的项目（顶部标签）；`library`：本地保存的全部项目，已按最近打开排序
  - `ProjectInfo = { id, name, url, title, icon, createdAt, lastOpenedAt, updatedAt, summary（第一条需求）, sheets（工作表名）, dataFiles（用过的数据文件路径）, steps（已记录可重建的步骤数）, hasThumb }`
- `projects.home()`：回到主页（会先自动保存当前项目的缩略图和工作表名）
- `projects.open(id)`：打开/切到项目，右侧恢复该项目的 Tableau 工作簿（草稿网址重新打开，已实测数小时前的草稿可完整恢复）
- `projects.create(name?)`：新建项目 = 新对话，新开 Tableau 首页
- `projects.close(id)`：关掉标签，项目仍在主页；关掉最后一个回到主页
- `projects.remove(id)`：删除项目及其本地资料（聊天记录、上下文、步骤、缩略图）。界面要先确认（红色“删除”，说明不能撤销；不会删除 Tableau Public 上已发布的内容）
- `projects.history(id)`：该项目保存的左侧记录，数组，元素是 agent:event 同格式事件，外加用户消息 `{type:"user", text, files, images（数量）, tutorial, at}`；text/thinking 已合并成整段，截图不保存（tool_result 带 `hadImage:true`）。打开项目时用它还原聊天区
- `projects.thumb(id)`：缩略图 data URL 或 null（每轮对话结束、切走、关闭时自动更新）
- `projects.recipeSteps(id)` / `projects.rebuild(id)`：已记录的建图步骤数；按步骤在新的 Web 制作工作簿里重建（草稿失效时用，返回 `{ok, message}`，进度用 status 事件）
- 在主页直接发消息会自动新建项目并开始对话
- 所有 `agent:event` 现在都带 `projectId`，左侧只显示当前项目的事件；其他项目的事件已写入它们自己的记录
- `agent:reset` 现在是“清空当前项目的对话”（聊天记录和 AI 上下文），项目和 Tableau 页面保留
- 设置 `autoRunSafePlans`（默认 true）：没有危险步骤的多步方案不再弹确认卡，改发 `plan` 事件 `{id, title, steps}` 只展示方案并直接执行；含发布/保存/删除等危险步骤的仍发 `confirm`

## 登录保持与过期提示（2026-11-04）
- 登录状态本来就保存在本地（持久化分区 + 会话 Cookie 延长 30 天并定期写盘），重启软件不用重新登录；你主动退出或 30 天没用才需要重新登录。
- `tableau:state` / `tableauState()` 新增 `expired: boolean`：之前登录过、没有主动退出，现在右侧变成未登录（signed-out）或登录页（login-page）时为 true。
  界面：expired=true 时在左侧显示提示卡（凝练文案，例如 中文“Tableau 登录已过期，请在右侧重新登录。” 英文“Your Tableau session has expired. Sign in again on the right.”），可配合 `pointAt("Sign In"/"登录")` 指向登录按钮；之后收到 state 为 signed-in 或 authoring（expired=false）时自动收起卡片，并提示“已重新登录，可以继续。”
- 在右侧点 Tableau 的“退出”会被记为主动退出，不提示过期。主进程只记录“是否登录过”和时间（userData/auth.json），不读取、不导出 Cookie 内容。

## 主页：收藏、归档、复制（2026-11-04）
- `ProjectInfo` 新增 `favorite: boolean`、`trashedAt: number`（0 = 不在废纸篓）、`sample: string`（从样例创建时的样例名）
- `ProjectState` 新增 `trash: ProjectInfo[]`；`library` 不再包含废纸篓里的项目
- `projects.setFavorite(id, bool)`
- 废纸篓：`projects.trash(id)` 移入（关闭标签，随时可恢复；不会自动清除）、`projects.listTrash()`、`projects.restore(id)`、`projects.purge(id)`（永久删除本地资料）、`projects.emptyTrash()`。`projects.remove(id)` 仍可直接永久删除。界面上永久删除和清空废纸篓用红色按钮、写明不能撤销
- `projects.duplicate(id): Promise<{ state, id }>`：复制聊天记录、建图步骤、缩略图（不复制 AI 上下文，也不共用 Tableau 草稿）；新项目右侧从首页开始，可用 `projects.rebuild(id)` 生成自己的工作簿
- 样例：已整体下线（2026-11-04，用户决定），`samples.*` 接口、样例页和缩略图都已删除。

## 本机权限（2026-11-04，主线程实现：src/main/permissions.ts）
首次引导顺序：语言 → API 设置（Key 测试通过） → 权限页 → 进入主页。设置页也放一个“权限”分区，同样的列表。
必需项全部 granted 才能进入软件；未完成时主进程 `agent.send` 也会拒绝（返回 error）。

`window.api.permissions`
- `list(): Promise<PermItem[]>`，`PermItem = { id, required, status, title, desc, canOpenSettings }`
  - `status`: `"granted" | "denied" | "not-determined" | "unknown"`（unknown = 系统不支持查询，按可用处理）
  - `title`/`desc` 已按界面语言给出，直接显示即可
- `request(id): Promise<status>` 触发系统询问或记录同意；返回新状态
- `openSettings(id)` 被拒绝后打开系统设置对应隐私页（`canOpenSettings` 为 true 时显示按钮）
- `ready(): Promise<boolean>` 必需项是否都已授权（启动时调用，false 就停在权限页）
- `revokeConsent()` 设置页“撤回同意”，之后回到权限页

清单（只列真正用到的，没有屏幕录制：截图用的是内嵌网页自己的截图接口，不需要系统录屏权限）

| id | Mac | Windows | 必需 | 用途 | 检测 / 申请 |
|---|---|---|---|---|---|
| consent | ✓ | ✓ | 是 | 说明截图、页面文字和数据摘要会发给用户选的 AI 服务商；Key 和登录只存本机；公开发布每次询问 | userData/consent.json（带版本号，条款变了会重新问）；设置页可撤回 |
| files | ✓ 必需 | ✓ 仅说明 | Mac 是 | 读取桌面/下载/文稿里的数据文件，导出到 下载/TabPilot | Mac：点允许后读这三个目录触发系统询问，EPERM 即拒绝，Privacy_FilesAndFolders；Windows：status 恒为 granted，只显示说明（受控文件夹访问提示） |
| keychain | ✓ | — | 是 | 加密保存 API Key 和 Tableau 登录 | 已存过 Key 或点过允许即 granted；request 加解密一次触发“始终允许” |
| voice | ✓ | ✓ | 否 | 语音输入（麦克风+语音识别合成一项，两项都拿到才算完成，任一被拒为 denied） | Mac：askForMediaAccess + voice-helper --request-auth；Windows：getMediaAccessStatus + winSpeechStatus（语音包）。openSettings 先打开被拒的那项：Privacy_Microphone / Privacy_SpeechRecognition，Windows ms-settings:privacy-microphone / ms-settings:regionlanguage |

界面建议：每项一行，左边图标+标题+说明，右边按钮（未授权“允许”，被拒绝“去系统设置”，已授权显示勾）。可选项标“可选”，可以跳过。
Windows：列表为 consent、files（仅说明）、voice；不出现 keychain。

## 执行过程的人话描述（2026-11-04）
`agent` 事件 `{ type: "tool", id, name, input, label }` 新增 `label`：主进程按工具和参数生成的一句话（跟随界面语言，例如“把 SUM(Sales) 放到列”“新建工作簿”“上传数据 orders.xlsx”）。
界面只显示 `label`，不要显示 `name`、坐标或 `input`；`tool_result` 按 `id` 对应到这一行显示成功/失败。实现：src/main/steplabel.ts。

## 建议：没接数据时先上传自己的数据（2026-11-04）
`suggestNext()` 返回值新增 `needsData: boolean`：新建工作簿还没接数据。为 true 时界面第一条固定显示“上传你自己的数据（Excel / CSV）”（点了打开文件选择，选好后带附件发给助手），最后一条显示“还没有数据？先用示例数据试试”，并提示可以直接拖文件。模型给的 suggestions 此时不含上传和示例。已有数据时不推荐示例。

## 运行状态、插话引导、后台运行（2026-11-04）
- `ProjectState.runningId`：正在执行任务的项目 id（没有为 ""）。停止按钮只在 `runningId === activeId` 时显示；顶部标签和主页卡片用它显示“运行中”。切换/新建/回主页都会推送新的 state，界面不要再用全局 running 变量判断停止按钮。
- 同一时间只有一个项目在执行任务。别的项目里发消息会被拒绝（返回 error），界面可以提示“XX 项目正在执行，先等它结束或停止”。
- `window.api.agent.steer(text): Promise<{ ok: boolean, projectId? }>`：把消息作为引导并入正在执行的任务（下一步请求模型前生效；模型已在收尾时会接着处理）。`ok:false` 表示没有任务在跑，按普通 `send` 发送。引导消息会记进该项目聊天记录（`{type:"user", text, steer:true}`）。引导不带附件。
- 设置 `sendWhileRunning: "queue" | "steer"`（默认 queue）：运行中按发送时，queue = 排队等这一轮结束再发；steer = 直接调用 steer。排队中的消息旁边给一个“作为引导发送”按钮，点了调用 steer 并移出队列。
- 回到主页时，正在执行任务的项目在后台继续运行（主进程把它的视图移到窗口外但保持渲染），不暂停。
- 顶栏：去掉跳转 Tableau Public 首页（`tableau:nav "home"` 不再使用），小房子 = 回 TabPilot 主页（`projects.home()`）。
- 改名：`projects.rename(id, name)`（已有）。

## 选择卡片与“改了什么”并入步骤（2026-11-04，界面已实现，等主线程接）
- `suggest` 事件新增可选字段 `pick: true`、`confirm?: string`：选择卡片（例如用户问“你能做什么图”）。`actions: {label}[]` 全部可勾选（单选多选都行），底部“确定”（或 `confirm` 文案）按钮，点了才开始；界面会把选中的项作为用户消息发回，文本以“我选这几个来做：\n1. …”开头，模型据此开工。不带 `pick` 的 `suggest` 行为不变（完成后的改进建议）。
- `change` 事件：执行中（进度块还在）时界面把它并进前一个步骤（步骤行下面一行小字，细节里也有）；没有前置步骤时才单独显示一条。主线程不需要再为“教我做”重复输出同样的内容。

## 选项卡片、讲解合并、截图不闪（2026-11-04）
- 选择卡片：工具 offer_choices 发出 `suggest` 事件并带 `pick: true`（actions 的 label 为“名称：说明”，multi 表示可多选）。界面按选择卡片显示，点“确定”后以“我选这几个来做：…”作为用户消息发出。不受“主动建议”开关影响。
- 讲解合并：教程模式下模型只在开始前讲一段思路+手动步骤、结束时一条总结，中途不再逐步发文字。`change` 事件（改了什么）界面请并入它前面那一步（同一个 tool 行里显示），只有前面没有步骤时才单独显示，减少条数。
- 截图不再带缩放 clip（之前会让 Chromium 临时改设备尺寸，右侧画面闪），改为原尺寸截图后在主进程缩小。

## 教我做：一步一步带用户自己动手（2026-11-04）
- 新 agent 事件 `{ type: "guide", id, step?, total?, instruction, why, highlighted }`（工具 guide_step 发出）。界面在聊天里画“第 step/total 步”卡片：instruction 大字（怎么做），why 小字（为什么），highlighted=false 时加一句“右侧没能高亮，请照文字找”。卡片下方 4 个按钮，点了作为普通用户消息发出（发送时带上当前 tutorial 开关）：
  - “做好了” → 发 `做好了`
  - “慢一点” → 发 `慢一点，再讲细一点`
  - “这步帮我做” → 发 `这步帮我做`
  - “剩下的直接做” → 发 `剩下的直接做`
  只有最新一张 guide 卡片的按钮可点，旧卡片置灰；用户也可以直接在输入框提问。
- 主进程约束：tutorial=true 时，除非用户这条消息包含“帮我做 / 直接做 / 剩下的你来”等，助手调用会改动页面的工具会被拒绝，只能 guide_step + 读状态。
- guide 卡片发出后这一轮就结束（done），界面不要显示“运行中”。

## 旧项目草稿失效的恢复（2026-11-04）
- Tableau Public 的 Web 制作草稿没保存时，过一段时间会在服务器上失效，重新打开会显示“意外错误 / Failed to fetch”。主进程检测到后，`tableau:state` 推送 `{ state: "draft-lost", draftLost: true, projectId, recipeSteps }`。
- 界面在左侧显示一张卡片（替代报错）：标题“这个草稿在 Tableau 那边已经失效”，说明“没保存到 Tableau Public 的草稿过一段时间会被清掉，你的登录没问题，聊天记录也都在。”
  - recipeSteps > 0：主按钮“按记录重新做一遍”→ `projects.rebuild(projectId)`（会新建工作簿、重新上传数据、按步骤重做；进度通过 status 事件显示），次按钮“新建空白工作簿”→ `projects.freshWorkbook(projectId)`。
  - recipeSteps = 0：只有“新建空白工作簿”。
  - 用户也可以直接在输入框说“重新做一遍”，助手会自己处理。

## 保存、项目文件夹、退出提醒（2026-11-04）
背景：Tableau Public 网页版不能把草稿存成本地工作簿，也不能打开本地 .twbx；没发布的草稿过一段时间会失效。所以“保存”= 发布到 Tableau Public 并设成不在个人主页显示，下次打开项目直接打开那份继续编辑。

**文档存放位置（首次引导权限页 + 设置）**
- 权限列表新增 `docs`（必需，Mac/Windows 都有）：desc 里带当前路径。`permissions.request("docs")` = 用当前位置（默认 文稿/TabPilot）并建好文件夹。
- `docs.get(): {path, chosen}`；`docs.choose(): {ok, path?, error?, canceled?}` 弹系统选择框（可新建文件夹），权限页这一行加一个“换个位置”按钮，设置页也放同样的“文档存放位置”行（显示路径 + 更改 + 在访达中显示）。`docs.reveal(projectId?)` 在访达/资源管理器里打开（项目或根目录）。
- 每个项目一个文件夹 `<位置>/<项目名>-<id>/`：`数据/`（上传过的数据文件副本）、`导出/`（导出的图片/PDF/工作簿）、`项目.json`（名称、地址、建图步骤）。

**保存**
- `ProjectInfo` 新增 `publishedUrl`、`savedSteps`、`savedAt`。`steps > savedSteps` = 有没保存的改动（标签和卡片上可以显示一个小圆点“未保存”）。
- 顶栏或项目菜单加“保存”按钮 → `projects.save(id)`：
  - 返回 `{ needConsent: true }`：第一次保存，界面弹说明卡：“保存会把这个工作簿发布到你的 Tableau Public 账号，并设成不在个人主页显示。有链接的人仍然能看到，所以别用私密数据。下次打开这个项目，会直接打开它接着编辑。”按钮“我明白，保存”→ `projects.save(id, true)`；“取消”。
  - 返回 `{ ok: true }`：助手开始在右侧发布（左侧显示用户消息“保存这个项目”和执行过程），完成后会说明结果。
- 保存成功后（publishedUrl 有值、done 事件后），界面问一句：“要不要再下载一份 .twbx 放到项目文件夹？本地文件只能用 Tableau Desktop 编辑，在 TabPilot 里继续编辑的是网上那份。”“下载”→ `projects.downloadTwbx(id)`；“不用”。
- 已保存的工作簿打不开：`tableau:state` 的 `state: "published-lost"`（`draftLost` 也为 true），卡片多一个按钮“去我的作品里找回”→ `projects.findPublished(id)`，其余同草稿失效卡片（按记录重新做一遍 / 新建空白工作簿）。

**退出提醒**
- 关窗口或退出时，有未保存的项目，主进程拦下并推送 `onUnsaved(list)`，`list = [{id, name, published}]`。界面弹窗：“这些项目还有没保存的改动：……”，按钮“去保存”（关弹窗，切到第一个项目）、“不保存，直接退出”→ `api.quit()`、“取消”。
- 关闭单个项目标签前，如果 `steps > savedSteps`，同样先问一句（保存 / 不保存关闭 / 取消）。
