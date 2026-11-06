// 首次使用引导：检测 API Key 是否可用、列出可用模型并给出推荐
import Anthropic from "@anthropic-ai/sdk";
import { L, lang } from "./i18n";
import type { ProviderId } from "./settings";

// 支持的提供方。除 Claude 走官方 SDK 外，其余都走 OpenAI 兼容接口（/chat/completions + 工具调用）。
// vision=false 的提供方看不到截图，只能靠页面结构验证（DeepSeek 应用户要求保留）。
export interface ProviderInfo {
  id: ProviderId;
  name: string;
  vision: boolean;
  description: () => string;
  baseURL: string; // OpenAI 兼容接口地址（Claude 不用）
  keyHint: string;
  keyUrl: string;
  // 列不出模型时的兜底列表；listModels=false 表示该提供方不支持列模型接口
  fallbackModels: string[];
  listModels: boolean;
  // 过滤掉非对话模型（嵌入、语音、绘图等），尽量只留能看图又能调工具的
  include?: RegExp;
  exclude?: RegExp;
}

export const PROVIDERS: ProviderInfo[] = [
  { id: "claude", get name() { return L("Claude（Anthropic）", "Claude (Anthropic)"); }, vision: true, description: () => L("能读截图，操作网页最稳，适合复杂图表。", "Reads screenshots and operates the page most reliably. Suited to complex charts."), baseURL: "", keyHint: "sk-ant-…", keyUrl: "https://console.anthropic.com/settings/keys", fallbackModels: ["claude-opus-5-5", "claude-sonnet-5-5"], listModels: true },
  { id: "openai", name: "OpenAI", vision: true, description: () => L("GPT 系列，看图和工具调用都支持。", "GPT models, with image input and tool calling."), baseURL: "https://api.openai.com/v1", keyHint: "sk-…", keyUrl: "https://platform.openai.com/api-keys", fallbackModels: [], listModels: true, include: /^(gpt-|o\d|chatgpt-)/, exclude: /(audio|realtime|tts|transcribe|search|image|embedding|instruct|moderation|codex|mini-tts|dall-e|whisper)/ },
  { id: "gemini", name: "Google Gemini", vision: true, description: () => L("Gemini 系列，看图强、上下文长。", "Gemini models: strong with images and long context."), baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", keyHint: "AIza…", keyUrl: "https://aistudio.google.com/apikey", fallbackModels: [], listModels: true, include: /gemini/, exclude: /(embedding|tts|image|aqa|imagen|veo|live|native-audio)/ },
  { id: "qwen", get name() { return L("通义千问（阿里云百炼）", "Qwen (Alibaba Cloud Model Studio)"); }, vision: true, description: () => L("国内可直连，选带 VL 或 max/plus 的视觉模型。", "Reachable from mainland China. Pick a vision model (VL, max or plus)."), baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", keyHint: "sk-…", keyUrl: "https://bailian.console.aliyun.com/?apiKey=1", fallbackModels: ["qwen-vl-max", "qwen-vl-plus"], listModels: true, include: /(vl|omni|qvq|qwen3\.\d|qwen-max|qwen-plus)/, exclude: /(embedding|tts|asr|audio|image|wanx|ocr-only|realtime)/ },
  { id: "zhipu", get name() { return L("智谱 GLM", "Zhipu GLM"); }, vision: true, description: () => L("国内可直连，GLM-4.5V 等视觉模型支持工具调用。", "Reachable from mainland China. Vision models such as GLM-4.5V support tool calling."), baseURL: "https://open.bigmodel.cn/api/paas/v4", keyHint: "xxxx.xxxx", keyUrl: "https://open.bigmodel.cn/usercenter/apikeys", fallbackModels: ["glm-4.5v", "glm-4v-plus"], listModels: false },
  { id: "moonshot", get name() { return L("Kimi（月之暗面）", "Kimi (Moonshot AI)"); }, vision: true, description: () => L("国内可直连，选带 vision 的模型。", "Reachable from mainland China. Pick a model with vision."), baseURL: "https://api.moonshot.cn/v1", keyHint: "sk-…", keyUrl: "https://platform.moonshot.cn/console/api-keys", fallbackModels: ["moonshot-v1-32k-vision-preview"], listModels: true, include: /(vision|kimi-latest|kimi-k2|thinking-vision)/ },
  { id: "doubao", get name() { return L("豆包（火山方舟）", "Doubao (Volcano Engine Ark)"); }, vision: true, description: () => L("国内可直连，填视觉模型名或推理接入点 ID。", "Reachable from mainland China. Enter a vision model name or endpoint ID."), baseURL: "https://ark.cn-beijing.volces.com/api/v3", get keyHint() { return L("火山方舟 API Key", "Volcano Engine Ark API key"); }, keyUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey", fallbackModels: ["doubao-seed-1-6-vision-250815", "doubao-1-5-vision-pro-32k-250115"], listModels: false },
  { id: "xai", name: "xAI Grok", vision: true, description: () => L("Grok 系列，支持看图和工具调用。", "Grok models, with image input and tool calling."), baseURL: "https://api.x.ai/v1", keyHint: "xai-…", keyUrl: "https://console.x.ai", fallbackModels: [], listModels: true, include: /grok/, exclude: /(image|imagine)/ },
  { id: "mistral", name: "Mistral", vision: true, description: () => L("Mistral 系列，选支持视觉的模型（Pixtral、Medium、Small 等）。", "Mistral models. Pick one with vision (Pixtral, Medium, Small, etc.)."), baseURL: "https://api.mistral.ai/v1", keyHint: "Mistral API Key", keyUrl: "https://console.mistral.ai/api-keys", fallbackModels: ["mistral-medium-latest", "pixtral-large-latest"], listModels: true, include: /(pixtral|medium|small|large)/, exclude: /(embed|moderation|ocr|codestral|voxtral)/ },
  { id: "deepseek", name: "DeepSeek", vision: true, description: () => L("费用低，中文好。V4.1 Flash 能读截图，旧模型依靠页面结构操作。", "Low cost. V4.1 Flash reads screenshots; older models work from the page structure."), baseURL: "https://api.deepseek.com", keyHint: "sk-…", keyUrl: "https://platform.deepseek.com/api_keys", fallbackModels: ["deepseek-chat"], listModels: true, include: /deepseek/, exclude: /(embed|ocr)/ },
];

export const providerInfo = (id: string) => PROVIDERS.find((p) => p.id === id);

const NAME_EN: Record<string, string> = {
  claude: "Claude (Anthropic)",
  qwen: "Qwen (Alibaba Cloud)",
  zhipu: "Zhipu GLM",
  moonshot: "Kimi (Moonshot)",
  doubao: "Doubao (Volcengine Ark)",
};
export const providerName = (p: ProviderInfo) => L(p.name, NAME_EN[p.id] ?? p.name);

export interface ModelOption {
  id: string;
  name: string;
  recommended: boolean;
  note: string; // 给用户看的一句话说明
}

export interface TestResult {
  ok: boolean;
  models: ModelOption[];
  recommended: string | null;
  error?: string;
}

// 推荐表：越靠前越推荐。没在表里的模型也会列出，但不推荐。
const CLAUDE_NOTES: [RegExp, () => string, boolean][] = [
  [/^claude-opus-5-5/, () => L("推荐：操作网页最稳，善于自行纠错", "Recommended: most reliable, corrects its own mistakes"), true],
  [/^claude-sonnet-5-5/, () => L("更便宜、更快，复杂任务偶尔需要重试", "Cheaper and faster; complex tasks may need a retry"), false],
  [/^claude-fable-5-1/, () => L("能力最强，费用较高，通常不必选用", "Most capable and costly; usually unnecessary"), false],
  [/^claude-opus-5\b|^claude-opus-5$/, () => L("上一代 Opus，可以使用", "Previous Opus; usable"), false],
  [/^claude-haiku-5-5/, () => L("费用最低，不建议用于操作网页", "Lowest cost; not suited to operating the page"), false],
];
const DEEPSEEK_NOTES: [RegExp, () => string, boolean][] = [
  [/v4\.?1.*flash|flash.*v4/i, () => L("推荐：能读截图，支持工具调用，速度快", "Recommended: reads screenshots, supports tools, fast"), true],
  [/^deepseek-chat$/, () => L("支持工具调用，能否读图以首次检测为准", "Supports tools; image support is checked on first use"), false],
  [/^deepseek-reasoner$/, () => L("推理更强但较慢，操作网页不如 chat", "Stronger reasoning but slower; less suited to operating the page"), false],
];

function annotate(ids: { id: string; name: string }[], table: [RegExp, () => string, boolean][]): { models: ModelOption[]; recommended: string | null } {
  const rank = (id: string) => {
    const i = table.findIndex(([re]) => re.test(id));
    return i < 0 ? 999 : i;
  };
  const models = ids
    .map(({ id, name }) => {
      const hit = table.find(([re]) => re.test(id));
      return { id, name, recommended: !!hit?.[2], note: hit?.[1]() ?? "" };
    })
    .sort((a, b) => rank(a.id) - rank(b.id));
  return { models, recommended: models.find((m) => m.recommended)?.id ?? models[0]?.id ?? null };
}

export async function testProvider(provider: ProviderId, key: string): Promise<TestResult> {
  key = (key ?? "").trim();
  if (!key) return { ok: false, models: [], recommended: null, error: L("请先填写 API Key。", "Enter an API key first.") };
  try {
    if (provider === "claude") {
      const client = new Anthropic({ apiKey: key, timeout: 20000, maxRetries: 1 });
      const ids: { id: string; name: string }[] = [];
      for await (const m of client.models.list({ limit: 100 })) {
        if (/^claude-/.test(m.id)) ids.push({ id: m.id, name: m.display_name });
      }
      if (!ids.length) return { ok: false, models: [], recommended: null, error: L("这个 Key 没有可用的 Claude 模型。", "This key has no Claude models available.") };
      return { ok: true, ...annotate(ids, CLAUDE_NOTES) };
    }
    const info = providerInfo(provider);
    if (!info) return { ok: false, models: [], recommended: null, error: L("未知提供方。", "Unknown provider.") };
    let ids: { id: string; name: string }[] = [];
    if (info.listModels) {
      const res = await fetch(`${info.baseURL}/models`, { headers: { authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) });
      if (res.status === 401 || res.status === 403) return { ok: false, models: [], recommended: null, error: L(`${info.name} 的 API Key 无效。`, `The ${info.name} API key is invalid.`) };
      if (res.status === 402) return { ok: false, models: [], recommended: null, error: L(`${info.name} 账户余额不足。`, `Your ${info.name} balance is too low.`) };
      if (!res.ok) return { ok: false, models: [], recommended: null, error: L(`${info.name} 返回错误 ${res.status}。`, `${info.name} returned error ${res.status}.`) };
      const data: any = await res.json();
      ids = (data?.data ?? data?.models ?? [])
        .map((m: any) => String(m.id ?? m.name ?? "").replace(/^models\//, ""))
        .filter((id: string) => id && (!info.include || info.include.test(id)) && !(info.exclude && info.exclude.test(id)))
        .map((id: string) => ({ id, name: id }));
    } else {
      // 不支持列模型的提供方：发一个最小请求验证 Key
      const res = await fetch(`${info.baseURL}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: info.fallbackModels[0], messages: [{ role: "user", content: "hi" }], max_tokens: 1 }),
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 401 || res.status === 403) return { ok: false, models: [], recommended: null, error: L(`${info.name} 的 API Key 无效。`, `The ${info.name} API key is invalid.`) };
      if (!res.ok && res.status !== 400 && res.status !== 404) return { ok: false, models: [], recommended: null, error: L(`${info.name} 返回错误 ${res.status}。`, `${info.name} returned error ${res.status}.`) };
    }
    if (!ids.length) ids = info.fallbackModels.map((id) => ({ id, name: id }));
    if (!ids.length) return { ok: false, models: [], recommended: null, error: L("没有找到支持看图和工具调用的模型。", "No models with image input and tool calling were found.") };
    return { ok: true, ...annotate(ids, provider === "deepseek" ? DEEPSEEK_NOTES : []) };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, models: [], recommended: null, error: L("Claude API Key 无效。", "The Claude API key is invalid.") };
    if (e instanceof Anthropic.PermissionDeniedError) return { ok: false, models: [], recommended: null, error: L("这个 Key 没有权限。", "This key doesn't have permission.") };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, models: [], recommended: null, error: L("请求过于频繁或额度已用完，请稍后再试。", "Too many requests or quota used up. Try again later.") };
    if (e instanceof Anthropic.APIConnectionError) return { ok: false, models: [], recommended: null, error: L("连不上 Anthropic，请检查网络或代理。", "Can't reach Anthropic. Please check your network or proxy.") };
    if (e instanceof Anthropic.APIError) return { ok: false, models: [], recommended: null, error: L(`接口错误 ${e.status}。`, `API error ${e.status}.`) };
    return { ok: false, models: [], recommended: null, error: L("网络连接失败，请检查网络或代理设置。", "Can't connect. Check your network or proxy settings.") };
  }
}

// 让模型自己根据本软件的需求推荐模型；失败时返回 null，由调用方用内置推荐表
const NEEDS = `这个软件让 AI 通过工具调用操作 Tableau 网页版：每一步都要调用工具（点击、拖拽、键入、读取页面状态），一个任务常常几十步，需要稳定的工具调用、会自我检查和纠错、能理解截图（如果模型支持图片）、上下文较长；同时用户在意费用和速度。`;

export interface Recommendation {
  recommended: string;
  notes: Record<string, string>;
}

export async function recommendModels(provider: ProviderId, key: string, models: string[]): Promise<Recommendation | null> {
  if (!models.length) return null;
  const ask = (lang() === "en" ? "Write every note in English. " : "") + `${NEEDS}\n\n可用模型：\n${models.map((m) => "- " + m).join("\n")}\n\n请从中选一个最推荐的，并给每个模型写一句不超过 25 个字的中文说明（适不适合本软件、优缺点）。只输出 JSON：{"recommended": "模型 id", "notes": [{"id": "模型 id", "note": "说明"}]}`;
  try {
    let raw = "";
    if (provider === "claude") {
      const client = new Anthropic({ apiKey: key, timeout: 30000, maxRetries: 1 });
      const judge = models.find((m) => /^claude-haiku-5-5/.test(m)) ?? models.find((m) => /^claude-sonnet-5-5/.test(m)) ?? models[0];
      const res = await client.messages.create({
        model: judge,
        max_tokens: 2000,
        output_config: {
          effort: "low",
          format: {
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                recommended: { type: "string" },
                notes: {
                  type: "array",
                  items: { type: "object", properties: { id: { type: "string" }, note: { type: "string" } }, required: ["id", "note"], additionalProperties: false },
                },
              },
              required: ["recommended", "notes"],
              additionalProperties: false,
            },
          },
        },
        messages: [{ role: "user", content: ask }],
      });
      if (res.stop_reason === "refusal") return null;
      raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    } else {
      const info = providerInfo(provider);
      if (!info) return null;
      const res = await fetch(`${info.baseURL}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: models.includes("deepseek-chat") ? "deepseek-chat" : models[0],
          messages: [{ role: "user", content: ask }],
          response_format: { type: "json_object" },
          max_tokens: 1000,
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      raw = String(data?.choices?.[0]?.message?.content ?? "").replace(/^```(json)?|```$/g, "").trim();
    }
    const j = JSON.parse(raw);
    const recommended = String(j?.recommended ?? "");
    if (!models.includes(recommended)) return null;
    const notes: Record<string, string> = {};
    for (const n of Array.isArray(j?.notes) ? j.notes : []) {
      const id = String(n?.id ?? "");
      if (models.includes(id)) notes[id] = String(n?.note ?? "").slice(0, 60);
    }
    return { recommended, notes };
  } catch {
    return null;
  }
}
