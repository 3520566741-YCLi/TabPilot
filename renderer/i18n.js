/* TabPilot 界面语言：跟随系统 / 简体中文 / English
   做法：界面里的中文文案是“原文”，英文模式下按字典整句替换（文字节点和 placeholder / title / aria-label / data-tip / data-help）。
   AI 回复、用户消息、工具输出、网址等不翻译。切换语言立即生效，不需要重启。 */
(function () {
  "use strict";
  const EN = {
    // ---- 顶栏与导航 ----
    "右侧页面后退": "Back (right-hand page)",
    "刷新右侧页面": "Reload the right-hand page",
    "Tableau Public 首页": "Tableau Public home",
    "导出制作步骤（Markdown）": "Export the steps (Markdown)",
    "新对话": "New chat",
    "设置": "Settings",
    "关闭设置": "Close settings",
    "新建项目": "New project",
    "关闭项目": "Close project",
    "收起或展开": "Collapse or expand",
    "拖动调整宽度": "Drag to resize",
    "这是什么": "What is this?",
    // ---- 欢迎页 ----
    "把想法，画成图": "Turn ideas into charts.",
    "说出你想了解的，其余交给 TabPilot。它在右侧的 Tableau 里逐步完成，全程可见，随时可止。": "Say what you want to understand and leave the rest to TabPilot. It works step by step in the Tableau on the right, in full view, and you can stop it at any time.",
    "列": "Columns", "行": "Rows",
    "不妨从这里开始": "Start here",
    "下一步可以这样做": "What to do next",
    "先打开一个项目，右边有画面时才能截图": "Open a project first; there's nothing on the right to capture yet",
    "最近 7 天": "Last 7 days",
    "最近 7 天没有打开过项目。更早的项目在“全部项目”里。": "No projects opened in the last 7 days. Older ones are in All projects.",
    "最近 7 天没有匹配的项目，可以到“全部项目”里找。": "Nothing matching in the last 7 days. Try All projects.",
    "新建一个工作簿，我来上传自己的 Excel / CSV 数据": "Create a workbook; I'll upload my own Excel / CSV data",
    "用我的数据，你能做哪些图？": "What charts can you make with my data?",
    "教我做一张按类别对比的条形图": "Teach me to make a bar chart comparing categories",
    "按 .twb/.twbx 工作簿复刻": "Rebuild from a .twb/.twbx workbook",
    "上传你自己的数据（Excel / CSV）": "Upload your own data (Excel / CSV)",
    "也可以把 Excel / CSV 文件直接拖到这里。": "You can also drag an Excel / CSV file here.",
    "把这份数据接入当前工作簿，看看里面有什么，再告诉我适合做哪些图": "Connect this data to the current workbook, look at what's in it, and tell me which charts fit",
    "依据右侧页面所见而定": "Based on what's on the right-hand page",
    "正在看右边的页面…": "Looking at the page on the right…",
    // ---- 输入区 ----
    "说说你想看的图 · 回车发送，Shift+回车换行": "Tell me the chart you have in mind. Enter to send, Shift+Enter for a new line.",
    "添加图片或数据文件（也可以直接拖进来、粘贴截图）": "Add images or data files (you can also drag them in or paste a screenshot)",
    "截取右侧 Tableau 画面发给 TabPilot": "Capture the Tableau view and send it to TabPilot",
    "截取 Tableau 画面": "Capture the Tableau view",
    "添加附件": "Add attachment",
    "语音输入": "Voice input",
    "教我做": "Teach me",
    "开启后，TabPilot 会一边操作一边讲解，并在右侧标出位置": "When on, TabPilot explains as it works and points to the spot on the right.",
    "发送": "Send", "停止": "Stop",
    "不再提示": "Don't show again",
    "下一条": "Next tip", "知道了": "Got it",
    "像对同事说话那样描述就好，例如：“按地区看销售额，用柱状图”。": "Describe it the way you'd tell a colleague, for example: “sales by region as a bar chart.”",
    "数据文件可以直接拖入，截图可以直接粘贴，也可以点麦克风开口说。": "Drag in a data file, paste a screenshot, or tap the microphone and speak.",
    "右侧是真实的 Tableau，随时可以亲自动手；想学一学，就打开“教我做”。": "The right side is real Tableau, so you can step in any time. To learn along the way, turn on “Teach me”.",
    "正在操作 Tableau…": "Working in Tableau…",
    "正在停止…": "Stopping…",
    "静候你的确认": "Waiting for your OK",
    "静候你的回答": "Waiting for your answer",
    "正在听，说完再点一下麦克风": "Listening. Tap the microphone again when you're done.",
    "粘贴的图片.png": "Pasted image.png",
    "Tableau 截图.png": "Tableau screenshot.png",
    "（附件）": "(attachment)",
    "教我做：开启": "Teach me: on",
    "已停止": "Stopped",
    "新对话开始": "New chat",
    "没有可导出的步骤": "Nothing to export yet",
    "还没有可导出的步骤": "Nothing to export yet",
    "已导出到 ": "Exported to ",
    "已保存文件：": "Saved file: ",
    "操作后的截图": "Screenshot after the step",
    "思考过程": "Reasoning",
    // ---- 步骤动词与功能区 ----
    "截图查看": "Screenshot", "读取页面元素": "Read page", "点击": "Click", "拖拽": "Drag", "输入": "Type",
    "按键": "Key press", "滚动": "Scroll", "等待": "Wait", "打开": "Open", "检查工作表状态": "Check sheet",
    "放到": "Place on", "从功能区移除": "Remove from", "标记类型改为": "Mark type:", "新建工作表": "New sheet",
    "上传数据": "Upload data", "解析工作簿": "Parse workbook", "分析数据文件": "Analyze data file", "询问你": "Ask you",
    "筛选器": "Filters", "页面": "Pages", "颜色": "Color", "大小": "Size", "标签": "Label", "详细信息": "Detail",
    "工具提示": "Tooltip", "形状": "Shape", "路径": "Path", "角度": "Angle",
    "，双击": ", double-click", "，右键": ", right-click",
    // ---- 状态条 ----
    "正在斟酌…": "Thinking it through…", "正在斟酌下一步…": "Considering the next step…", "正在组织回答…": "Putting the answer together…",
    // ---- 卡片 ----
    "需要你处理": "Needs your attention",
    "需要你确认（会改动或公开内容）": "Needs your confirmation (this changes or publishes something)",
    "或者直接写下你的回答": "Or just type your answer",
    "回答": "Answer",
    "你的回答：": "Your answer: ",
    "请确认以下操作": "Please confirm these actions",
    "标红的步骤会改动或公开内容，请先看清楚再确认。": "Steps in red change or publish something. Take a careful look before you confirm.",
    "确认执行": "Confirm", "取消": "Cancel",
    "你选择了：": "You chose: ",
    "已取消，没有做任何改动": "Cancelled. Nothing was changed.",
    "改了什么：": "What changed: ",
    "撤销": "Undo", "撤销中…": "Undoing…", "已撤销": "Undone", "不能撤销": "Can't undo", "撤销失败": "Undo failed",
    "可以这样改进": "A few ways to improve it",
    "按所选去做": "Do the selected",
    "先勾选至少一项": "Select at least one first",
    "全选": "Select all", "忽略": "Dismiss",
    "还没有勾选任何项。": "Nothing is selected yet.",
    "已完成：": "Done: ",
    "已完成": "Completed", "保存（有没保存的改动）": "Save (unsaved changes)", "有没保存的改动": "Unsaved changes", "未保存": "Unsaved", "文档存放位置": "Document location", "每个项目在这里有自己的文件夹：数据文件的副本、导出的图片和工作簿、制作步骤。": "Each project has its own folder here: copies of your data files, exported images and workbooks, and the steps.", "更改": "Change", "在访达中显示": "Show in Finder", "在资源管理器中显示": "Show in File Explorer", "换个位置": "Choose another place", "正在执行任务，等它结束再保存": "A task is running; save after it finishes", "保存到 Tableau Public": "Save to Tableau Public", "保存会把这个工作簿发布到你的 Tableau Public 账号，并设成不在个人主页显示。有链接的人仍然能看到，所以别用私密数据。下次打开这个项目，会直接打开它接着编辑。": "Saving publishes this workbook to your Tableau Public account, hidden from your profile. Anyone with the link can still see it, so keep private data out. Next time you open this project, it picks up right where you left off.", "我明白，保存": "I understand, save", "要不要再下载一份 .twbx 放到项目文件夹？本地文件只能用 Tableau Desktop 编辑，在 TabPilot 里继续编辑的是网上那份。": "Also download a .twbx into the project folder? A local file can only be edited in Tableau Desktop; in TabPilot you keep editing the online copy.", "下载": "Download", "不用": "No thanks", "这些项目还有没保存的改动：": "These projects have unsaved changes:", "先保存再退出吗？": "Save before quitting?", "去保存": "Go save", "不保存，直接退出": "Quit without saving", "这个项目还有没保存的改动": "This project has unsaved changes", "不保存，关闭": "Close without saving", "这份已保存的工作簿打不开了": "This saved workbook won't open", "去我的作品里找回": "Find it in My Work", "正在去我的作品里找…": "Looking in My Work…",  "草稿": "Draft", "这个草稿在 Tableau 那边已经失效": "This draft has expired on Tableau's side", "没保存到 Tableau Public 的草稿，过一阵会被清掉。登录没问题，聊天记录也都在。": "Drafts not saved to Tableau Public get cleared after a while. Your sign-in is fine and the chat history is intact.", "按记录重新做一遍": "Rebuild from the record", "新建空白工作簿": "Start a blank workbook", "正在按记录重新做一遍…": "Rebuilding from the record…", "正在新建空白工作簿…": "Creating a blank workbook…", "做好了": "Done", "慢一点": "Slower", "这步帮我做": "Do this step for me", "剩下的直接做": "Just do the rest", "慢一点，再讲细一点": "Slower, with more detail", "右侧没能高亮，请照文字找。": "Couldn't highlight it on the right; follow the text to find it.", "想做哪一个？可以多选": "What would you like to make? Pick one or more", "确定": "Confirm", "运行中": "Running", "正在执行任务": "Working on a task", "排队中": "Queued", "作为引导发送": "Send as guidance", "移出队列": "Remove from queue", "引导": "Guidance", "运行中发送的消息直接作为引导": "Send messages as guidance while running", "关闭时，运行中发的消息会排队，等这一轮做完再发；排队的消息旁边可以随时点“作为引导发送”。": "When off, messages sent while running are queued and sent after this run; you can tap “Send as guidance” on a queued message at any time.", "运行中发送的消息不带附件，附件会留在输入框里": "Messages sent while running can't carry attachments; they stay in the box", "这一轮刚好结束了，已作为新消息发送": "The run just finished, so it was sent as a new message", "项目主页": "Projects", "查看细节": "Show details", "思考记录": "Reasoning", "操作页面": "Working on the page", "正在想下一步…": "Thinking about the next step…",
    "按这几条改：\n": "Please make these changes:\n",
    "我选这几个来做：\n": "I'll go with these:\n",
    "（失败）": " (failed)",
    "（未回答）": "(unanswered)",
    "问题": "question", "确认": "Confirm",
    // ---- 项目与登录 ----
    "Tableau 登录指引": "Tableau sign-in guide",
    "第 1 步": "Step 1", "第 2 步": "Step 2", "第 3 步": "Step 3", "第 4 步": "Step 4", "已登录": "Signed in",
    "先处理页面上的 Cookie 提示": "First, deal with the cookie notice",
    "在右边页面里找到 Cookie 提示（通常在页面底部或中间）。": "Find the cookie notice on the right-hand page (usually at the bottom or in the middle).",
    "按你的意愿选“接受”或“拒绝非必要”，两个都可以继续。": "Choose “Accept” or “Reject non-essential”. Either lets you continue.",
    "指给我看 Cookie 提示": "Show me the cookie notice",
    "Cookie 提示在这里，请自己选择": "The cookie notice is here. The choice is yours.",
    "点右上角“登录”": "Click “Sign In” at the top right",
    "在右边页面右上角点“登录（Sign In）”。": "On the right-hand page, click “Sign In” at the top right.",
    "还没有账号？点“注册 / 创建账户”，免费的。": "No account yet? Click “Sign Up / Create Account”. It's free.",
    "登录或注册都在右边页面里完成。": "Signing in or signing up both happen on the right-hand page.",
    "指给我看“登录”": "Show me “Sign In”", "指给我看“注册”": "Show me “Sign Up”",
    "点这里登录": "Click here to sign in", "没有账号点这里注册": "No account? Click here to sign up",
    "输入邮箱和密码": "Enter your email and password",
    "在右边页面的框里输入你的邮箱。": "Type your email into the box on the right-hand page.",
    "输入密码（自己输入，TabPilot 不会代填）。": "Enter your password yourself. TabPilot never fills it in for you.",
    "点“登录”。": "Click “Sign In”.",
    "指给我看邮箱框": "Show me the email box", "指给我看“登录”按钮": "Show me the Sign In button",
    "在这里输入邮箱": "Type your email here", "填好后点这里": "When you're done, click here",
    "填写注册信息": "Fill in your details",
    "填写邮箱、姓名，设一个密码（自己填，TabPilot 不会代填）。": "Enter your email and name, and choose a password. You fill these in yourself; TabPilot never does.",
    "按页面要求勾选同意条款。": "Tick the agreement box if the page asks for it.",
    "提交后，去邮箱收验证邮件。": "After you submit, check your inbox for the verification email.",
    "指给我看提交按钮": "Show me the submit button",
    "完成验证": "Complete verification",
    "打开你的邮箱，找到来自 Tableau 的邮件。": "Open your inbox and find the email from Tableau.",
    "把邮件里的验证码填回右边页面，或点邮件里的验证链接。": "Enter the code from the email on the right-hand page, or click the verification link in the email.",
    "如果开了两步验证，用手机验证器里的 6 位数字。": "If you use two-step verification, enter the 6-digit code from your authenticator app.",
    "指给我看验证码框": "Show me the code box", "验证码填在这里": "Enter the code here",
    "登录成功，下一步创建图表": "You're in. Next, create a chart",
    "点上方的“创建（Create）”。": "Click “Create” at the top.",
    "选“Web 制作”，进入编辑器。": "Choose “Web Authoring” to open the editor.",
    "进入编辑器后，就可以在左边告诉 TabPilot 想要什么图了。": "Once you're in the editor, tell TabPilot what chart you want here on the left.",
    "指给我看“创建”": "Show me “Create”", "点这里创建": "Click here to create",
    "账号与密码请由你亲自输入，": "Please enter your account and password yourself. ",
    "TabPilot 不会代填，也不会替你点击登录或注册。": "TabPilot never fills them in, and never clicks Sign In or Sign Up for you.",
    "没找到这个位置，页面可能还在加载，或者布局有变化。请对照右边页面自己找一下。": "Couldn't find that spot. The page may still be loading, or its layout may have changed. Please look for it on the right.",
    // ---- 旧版本 ----
    "发现旧版本": "Older copies found",
    "应用": "App", "安装包": "Installer",
    "以后不再提醒": "Don't remind me again", "以后再说": "Later",
    "废纸篓": "Trash", "回收站": "Recycle Bin",
    // ---- 权限 ----
    "语音输入需要你允许权限": "Voice input needs your permission",
    "打开 macOS 的“系统设置”。": "Open System Settings on your Mac.",
    "进入“隐私与安全性”，分别在“麦克风”和“语音识别”里，把 TabPilot 打开。": "Go to Privacy & Security. Under both Microphone and Speech Recognition, switch TabPilot on.",
    "打开“设置 > 隐私和安全性 > 麦克风”，打开“允许桌面应用使用麦克风”。": "Open Settings > Privacy & security > Microphone and turn on “Let desktop apps access your microphone”.",
    "如果提示没有中文语音包，到“设置 > 时间和语言 > 语言和区域”里安装；也可以按 Win+H 用系统听写。": "If it says a speech language pack is missing, install one under Settings > Time & language > Language & region, or press Win+H to use Windows dictation.",
    "回到这里，再点一次麦克风。如果还不行，退出 TabPilot 重新打开。": "Come back here and tap the microphone again. If it still doesn't work, quit TabPilot and reopen it.",
    // ---- 设置 ----
    "外观": "Appearance", "跟随系统": "Match system", "白天": "Light", "夜间": "Dark",
    "语言": "Language", "简体中文": "简体中文",
    "跟随系统：Mac 切到夜间，TabPilot 也自动切到夜间。你也可以固定成白天或夜间。": "Match system: when your Mac switches to dark mode, so does TabPilot. You can also pin it to light or dark.",
    "使用哪个助手": "Which assistant to use", "助手提供商": "Assistant provider",
    "模型": "Model", "进阶": "Advanced",
    "DeepSeek 看不到截图，会靠读取页面结构来确认每一步。": "DeepSeek can't see screenshots, so it confirms each step by reading the page structure.",
    "完成后给出优化建议": "Suggest improvements when done",
    "用快速模型复核每一步": "Double-check each step with a fast model",
    "每步操作后先快速判断是否成功，需要 Jev 密钥。": "After each step, quickly judge whether it worked. Requires a Jev key.",
    "Jev 密钥": "Jev key", "留空表示不修改": "Leave blank to keep it unchanged",
    "动画": "Motion", "让界面更安静": "Keep things calm",
    "停止位移与流动，仅保留淡入淡出。系统开启“减少动态效果”时也会自动停止。": "Stops movement and the flowing background, keeping only fades. This also happens automatically when your system's “Reduce motion” is on.",
    "如果动来动去让你眼花或不舒服，打开它就会停掉移动，只留淡入淡出。": "If movement is distracting or uncomfortable, turn this on to stop it and keep only fades.",
    "重新选择提供商、检测可用模型，并获得模型推荐。": "Choose a provider again, detect the available models, and get a recommendation.",
    "Key 用系统钥匙串加密，只保存在这台电脑上。输入框留空表示不修改。": "Your key is encrypted in the system keychain and stays on this computer. Leave a field blank to keep it unchanged.",
    "清除已保存的 Key": "Remove saved keys", "保存": "Save", "已保存": "Saved", "未设置": "Not set",
    "“主动给出改进建议”：做完图后 TabPilot 会告诉你还能怎么改。“快速模型复核”是进阶选项，不确定就保持关闭。": "“Suggest improvements”: after a chart is finished, TabPilot tells you how it could be better. “Double-check” is an advanced option; if you're unsure, leave it off.",
    // ---- 首次设置 ----
    "首次设置": "First-time setup", "稍后再说": "Not now", "上一步": "Back", "下一步": "Next", "开始使用": "Get started",
    "选择你的助手": "Choose your assistant",
    "它将在右侧的 Tableau 中代你操作，之后可随时在设置中更换。": "It will work in the Tableau on the right on your behalf. You can change it any time in Settings.",
    "密钥仅保存在本机，并经系统钥匙串加密。填好后，先测试连接。": "Your key stays on this computer, encrypted in the system keychain. Once it's in, test the connection.",
    "API Key 相当于你的“通行证”：TabPilot 用它替你调用模型。它只保存在这台电脑上，用系统钥匙串加密，不会发给别人；也不要把它发给别人。": "An API key is your personal pass: TabPilot uses it to call the assistant on your behalf. It stays on this computer, encrypted in the system keychain, and is never shared. Don't share it with anyone either.",
    "测试连接": "Test connection",
    "正在检测可用模型…": "Checking available models…",
    "连接失败，请检查 Key": "Couldn't connect. Please check the key.",
    "当前版本不支持检测": "This version can't run the check.",
    "还没有密钥？三步即可获得": "No key yet? Three steps to get one",
    "打开下面的网址（点“复制网址”，粘贴到浏览器里）并登录。": "Open the address below (click “Copy address” and paste it into your browser) and sign in.",
    "找到“API Keys / 密钥”页面，点“创建”。": "Find the “API Keys” page and click “Create”.",
    "复制那一串字符，回到这里粘贴到上面的框里。": "Copy the string of characters, then come back and paste it into the box above.",
    "复制网址": "Copy address", "打开网页": "Open page", "已复制": "Copied", "请手动选中复制": "Select and copy it manually",
    "第一次使用可能要先充值或绑定付款方式，按对方页面提示完成即可。": "On first use you may need to add credit or a payment method. Just follow the prompts on their page.",
    "在 platform.deepseek.com 创建 API Key": "Create an API key at platform.deepseek.com",
    "在 console.anthropic.com 创建 API Key": "Create an API key at console.anthropic.com",
    "选择模型": "Choose a model", "先选一个模型": "Choose a model first",
    "以下是这把密钥可用的模型，推荐项已为你标出。": "These are the models your key can use. The recommended one is marked.",
    "模型就像不同档次的助手：贵的更稳、更聪明，便宜的更快。不确定就选带“推荐”的那个。": "Models are like assistants of different grades: pricier ones are steadier and smarter, cheaper ones are faster. If unsure, pick the one marked “Recommended”.",
    "正在为你挑选模型…": "Picking a model for you…",
    "推荐由 TabPilot 根据自己的需要挑选。": "The recommendation is chosen by TabPilot based on what it needs.",
    "TabPilot 暂时没能给出推荐，下面用的是内置推荐。": "TabPilot couldn't make a recommendation just now, so the built-in one is shown.",
    "没有检测到模型，可以返回上一步重新测试。": "No models were found. Go back and test again.",
    "推荐": "Recommended",
    "一切就绪": "All set", "现在，说出你想看的图吧。": "Now tell me the chart you'd like to see.",
    "先点“测试连接”，成功后才能继续": "Test the connection first. You can continue once it succeeds.",
    "正在保存…": "Saving…", "保存失败：": "Couldn't save: ",
    "支持图片": "Handles images", "不能看图": "No image support",
    "不支持（靠读取页面结构）": "No (reads the page structure instead)", "看图": "Images", "支持": "Yes", "下一步": "Next",
    "填入 API Key": "Enter your API key", "地区": "Region", "国内可直连": "Direct access in China", "国际": "International",
    "能看懂截图，操作最稳，适合复杂的图。": "Reads screenshots and is the steadiest, ideal for complex charts.",
    "便宜、中文好；看不到截图，靠读取页面结构完成每一步。": "Affordable and strong in Chinese. It can't see screenshots, so it reads the page structure.",
    // ---- 审查修复新增 ----
    "助手": "Assistant",
    "API Key 相当于你的“通行证”，TabPilot 用它替你调用助手。只保存在这台电脑上，不会发给别人。模型就像不同档次的助手：贵的更稳，便宜的更快，不确定就用推荐的。": "An API key is your personal pass; TabPilot uses it to call the assistant on your behalf. It stays on this computer and is never shared. Models are like assistants of different grades: pricier ones are steadier, cheaper ones are faster. If unsure, use the recommended one.",
    "更换助手或模型…": "Change assistant or model…", "更新 Key…": "Update key…",
    "清除这家的 Key": "Remove this key", "清除": "Remove",
    "图表完成后，为你指出还可以更好的地方。": "When a chart is finished, TabPilot points out what could be better.",
    "粘贴后按回车保存": "Paste, then press Enter to save",
    "完成": "Done",
    "已更换助手，新对话开始": "Assistant changed. New chat started.",
    "已开始新对话": "New chat started",
    "请先停止当前操作，再开始新对话": "Stop the current task first, then start a new chat.",
    "密钥经系统钥匙串加密，仅保存在本机。": "Your key is encrypted in the system keychain and stays on this computer.",
    "其他回答…": "Something else…", "写下你的回答": "Write your answer",
    "收起内部步骤": "Hide internal steps",
    "点一下更换助手或模型": "Click to change assistant or model",
    "Cookie": "Cookie", "登录": "Sign in", "注册": "Sign up", "验证": "Verify",
    // ---- 项目主页 ----
    "项目主页": "Projects", "最近项目": "Recent", "全部项目": "All projects", "收藏": "Favorites", "归档": "Archive", "归档于 ": "Archived ",
    "已自动保存到本机": "Saved automatically on this computer", "搜索项目": "Search projects",
    "最近编辑": "Last edited", "名称": "Name", "创建时间": "Created", "列表": "List", "卡片": "Cards", "新建项目": "New project",
    "拖动调整侧栏宽度": "Drag to resize the sidebar",
    "项目实时保存在本机。关掉再打开，聊天和工作簿都会回来。": "Projects save as you work. Close and reopen, and both the chat and the workbook come back.",
    "没有找到匹配的项目。": "No matching projects.",
    "还没有收藏。点项目右边的星标，就能把重要的图固定在这里。": "No favorites yet. Tap the star on a project to pin the ones that matter.",
    "这里还没有项目。点右上角“新建项目”，说出你想看的图。": "No projects yet. Click “New project” at the top right and tell me the chart you have in mind.",
    "今天": "Today", "本周": "This week", "更早": "Earlier", "已收藏": "Pinned",
    "取消收藏": "Remove from favorites", "更多操作": "More actions", "重命名": "Rename", "复制": "Duplicate", 
    "归档的项目不会出现在项目列表里。可以随时恢复；只有在这里才能永久删除。": "Archived projects stay out of your project list. You can restore them any time; permanent deletion is only possible here.",
    "清空归档": "Empty archive", "清空归档？里面的项目会被永久删除，不能恢复。": "Empty the archive? Everything in it will be deleted permanently.",
    "清空": "Empty", "恢复": "Restore", "永久删除": "Delete permanently", "还没有归档的项目。": "No archived projects yet.",
    "权限": "Permissions",
    "TabPilot 需要这些权限才能读取你的数据文件、安全保存密钥，并在右侧替你操作。可选项不开启也能使用。": "TabPilot needs these permissions to read your data files, store your keys safely, and work on the right on your behalf. Optional ones can stay off.",
    "撤回同意…": "Withdraw consent…", "撤回同意": "Withdraw consent",
    "撤回同意后，TabPilot 会停在权限页，重新同意后才能继续使用。你的项目和设置不会被删除。": "After you withdraw consent, TabPilot waits on the permissions page until you agree again. Your projects and settings are kept.",
    "允许 TabPilot 工作": "Let TabPilot work",
    "TabPilot 要读取你的数据文件、安全保存密钥，并在右侧替你操作。请逐项允许；不同意必需的权限，就无法使用。": "TabPilot reads your data files, stores your keys safely, and works on the right for you. Please allow each item; without the required permissions, TabPilot can't be used.",
    "请先允许所有必需的权限": "Allow all required permissions first",
    "可选": "Optional", "已同意": "Agreed", "已允许": "Allowed", "去系统设置": "Open system settings", "同意": "Agree", "允许": "Allow",
    "进入 TabPilot": "Enter TabPilot",
    "已连接": "Connected", "更改设置": "Change settings", "已全部允许": "All allowed", "权限": "Permissions",
    // ---- 其他 ----
    "还没有填写 API Key，": "No API key yet. ", "打开设置": "Open settings",
    "请先在设置里填写 API Key": "Please add your API key in Settings first.",
    "消息为空": "The message is empty.",
    "项目": "Project", "首页": "Home", "后退": "Back", "刷新": "Reload", "创建": "Create", "登录": "Sign in", "注册": "Sign up",
    "接受": "Accept", "拒绝": "Reject", "继续": "Continue", "邮箱": "Email", "用户名": "Username", "验证": "Verify", "验证码": "Code",
    "完成": "Done", "确认": "Confirm", "标签": "Label", "创建账户": "Create account",
    "停止中": "Stopping", "已处理": "Resolved",
  };
  // 带变量的句子：[正则, 英文]（$1 $2 为捕获组）
  const PATTERNS = [
    [/^清除 (.+) 的 Key？之后需要重新粘贴才能继续使用。$/, "Remove your $1 key? You'll need to paste it again to keep using it."],
    [/^显示全部（含 (\d+) 个内部步骤）$/, "Show all (includes $1 internal steps)"],
    [/^(\d+) 个工作表$/, "$1 sheets"],
    [/^永久删除“(.+)”？本地的聊天记录和步骤都会删除，不能恢复。不会影响 Tableau Public 上已发布的内容。$/, "Delete “$1” permanently? Its local chat and steps will be removed and can't be recovered. Anything published on Tableau Public is not affected."],
    [/^删除于 (.+)$/, "Deleted $1"],
    [/^已完成 (\d+) 步$/, "$1 steps done"],
    [/^已完成：(.+)$/, "Done: $1"],
    [/^按所选去做（(\d+)）$/, "Do the selected ($1)"],
    [/^(\d+) 步已完成$/, "$1 steps done"],
    [/^填入 (.+) 的 Key$/, "Enter your $1 key"],
    [/^填写 (.+) 的密钥$/, "Enter your $1 key"],
    [/^连接成功，找到 (\d+) 个模型$/, "Connected. Found $1 models."],
    [/^缓存命中 ([\d,.\s]+)$/, "Cached $1"],
    [/^输入 ([\d,.\s]+) · 输出 ([\d,.\s]+) tokens$/, "Input $1 · Output $2 tokens"],
    [/^你现在用的是 v(.+)。下面这些旧版本可以清理掉，避免点错。勾选要处理的：$/, "You're on v$1. These older copies can be cleaned up so you don't open the wrong one. Select the ones to remove:"],
    [/^将移入(废纸篓|回收站)，随时可以恢复；你的设置、密钥与登录状态不受影响。$/, "They go to the $1 and can be restored from there. Your settings, API keys and sign-in are untouched."],
    [/^移到(废纸篓|回收站)$/, "Move to $1"],
    [/^已移到(废纸篓|回收站)：(\d+) 项；(\d+) 项没能处理，可以自己手动删除。$/, "Moved $2 to the $1. $3 couldn't be moved; you can delete them yourself."],
    [/^已移到(废纸篓|回收站)：(\d+) 项。?$/, "Moved $2 to the $1."],
    [/^应用 · v(.+)$/, "App · v$1"],
    [/^安装包 · v(.+)$/, "Installer · v$1"],
    [/^已处理（(.+)）$/, "Resolved ($1)"],
    [/^已切换到 (.+)，新对话开始$/, "Switched to $1. New chat started."],
    [/^元素 #(\d+)(.*)$/, "Element #$1$2"],
    [/^(\S+) 到 (\S+)$/, "$1 to $2"],
    [/^(\d+) 秒$/, "$1 s"],
    [/^已完成：(.+)$/, "Done: $1"],
    [/^已处理：(.+)$/, "Resolved: $1"],
    [/^已导出到 (.+)$/, "Exported to $1"],
  ];
  const VERB_ING = { "截图查看": "Taking a screenshot", "读取页面元素": "Reading the page", "点击": "Clicking", "拖拽": "Dragging", "输入": "Typing", "按键": "Pressing a key", "滚动": "Scrolling", "等待": "Waiting", "打开": "Opening", "检查工作表状态": "Checking the sheet", "放到": "Placing on", "从功能区移除": "Removing from the shelf", "标记类型改为": "Setting mark type to", "新建工作表": "Creating a sheet", "上传数据": "Uploading data", "解析工作簿": "Parsing the workbook", "分析数据文件": "Analyzing the data file", "询问你": "Asking you" };

  let lang = "zh";
  const origText = new WeakMap();
  const origAttr = new WeakMap();
  let applying = false;
  const ATTRS = ["placeholder", "aria-label", "data-tip", "data-help", "alt"];
  const SKIP = ".msg.ai, .msg.user, .out, details.thinking > div, .ext-link, .pth, .url, input, textarea, [data-notr], .lhist";

  function trText(zh) {
    const key = zh.trim();
    if (!key) return null;
    if (Object.prototype.hasOwnProperty.call(EN, key)) return EN[key];
    for (const [re, en] of PATTERNS) {
      const m = key.match(re);
      if (m) {
        // 废纸篓 / 回收站 按平台翻成 Trash / Recycle Bin，避免英文句子里混进中文
        return key.replace(re, en).replace(/\$\d/g, "").replace(/废纸篓/g, "Trash").replace(/回收站/g, "Recycle Bin").trim();
      }
    }
    const live = key.match(/^正在(.+?)( .*)?…$/);
    if (live && VERB_ING[live[1]]) {
      const det = (live[2] || "").trim();
      return VERB_ING[live[1]] + (det ? " " + (trText(det) || det) : "") + "…";
    }
    const st = key.match(/^第 (\d+) 步$/);
    if (st) return "Step " + st[1];
    return null;
  }
  function skipEl(el) {
    return !!(el && el.closest && el.closest(SKIP));
  }
  function applyText(tn) {
    const p = tn.parentElement;
    if (!p || skipEl(p)) return;
    if (lang === "en") {
      const orig = origText.has(tn) ? origText.get(tn) : tn.nodeValue;
      const en = trText(orig);
      if (en == null) return;
      if (!origText.has(tn)) origText.set(tn, orig);
      const lead = orig.match(/^\s*/)[0];
      const trail = orig.match(/\s*$/)[0];
      const nv = lead + en + trail;
      if (tn.nodeValue !== nv) tn.nodeValue = nv;
    } else if (origText.has(tn)) {
      const o = origText.get(tn);
      if (tn.nodeValue !== o) tn.nodeValue = o;
      origText.delete(tn);
    }
  }
  function applyAttrs(el) {
    if (skipEl(el) && !el.matches("input, textarea")) {
      // 输入框的 placeholder 仍要翻译，其余被排除的容器不动
    }
    for (const a of ATTRS) {
      if (!el.hasAttribute || !el.hasAttribute(a)) continue;
      let store = origAttr.get(el);
      if (lang === "en") {
        const orig = store && a in store ? store[a] : el.getAttribute(a);
        const en = trText(orig);
        if (en == null) continue;
        if (!store) origAttr.set(el, (store = {}));
        store[a] = orig;
        if (el.getAttribute(a) !== en) el.setAttribute(a, en);
      } else if (store && a in store) {
        el.setAttribute(a, store[a]);
        delete store[a];
      }
    }
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) return applyText(root);
    if (root.nodeType !== 1) return;
    applying = true;
    try {
      applyAttrs(root);
      root.querySelectorAll("*").forEach(applyAttrs);
      const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let n;
      while ((n = tw.nextNode())) applyText(n);
    } finally {
      applying = false;
      if (typeof mo !== "undefined") mo.takeRecords(); // 丢掉自己改动产生的记录，避免把原文覆盖掉
    }
  }
  const mo = new MutationObserver((muts) => {
    if (applying) return;
    applying = true;
    try {
      for (const m of muts) {
        if (m.type === "attributes") {
          // 属性被程序重新写入：清掉旧的缓存再翻译
          const s = origAttr.get(m.target);
          if (s && m.attributeName in s && m.target.getAttribute(m.attributeName) !== s[m.attributeName]) {
            const cur = m.target.getAttribute(m.attributeName);
            if (trText(cur) !== cur) delete s[m.attributeName];
          }
          applyAttrs(m.target);
        } else if (m.type === "characterData") {
          origText.delete(m.target);
          applyText(m.target);
        } else m.addedNodes.forEach((n) => (n.nodeType === 3 ? applyText(n) : walk(n)));
      }
    } finally {
      applying = false;
      mo.takeRecords();
    }
  });
  function start() {
    mo.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  function resolve(pref) {
    if (pref === "zh" || pref === "en") return pref;
    return /^zh/i.test(navigator.language || "") ? "zh" : "en";
  }
  function setLanguage(pref) {
    try {
      localStorage.setItem("langPref", pref);
    } catch {}
    lang = resolve(pref);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    walk(document.body);
    document.title = lang === "zh" ? "TabPilot" : "TabPilot";
    return lang;
  }
  function getPref() {
    try {
      return localStorage.getItem("langPref") || "system";
    } catch {
      return "system";
    }
  }
  window.i18n = {
    t: (zh) => (lang === "en" ? trText(zh) || zh : zh),
    lang: () => lang,
    pref: getPref,
    set: setLanguage,
    start() {
      start();
      setLanguage(getPref());
    },
  };
})();
