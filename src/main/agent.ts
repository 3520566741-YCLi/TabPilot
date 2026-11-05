// AI 层：与提供方无关的 Agent 外壳 + Claude 原生适配器 + OpenAI 兼容适配器（OpenAI、Gemini、通义、智谱、Kimi、豆包、Grok、Mistral、DeepSeek）。
// 工具定义与执行都来自 ToolHost，适配器只负责各自的消息格式和请求。
import { stepLabel } from "./steplabel";
import Anthropic from "@anthropic-ai/sdk";
import { ToolHost, TOOL_DEFS, ToolResult } from "./tools";
import { ProviderId } from "./settings";
import { systemPrompt } from "./prompt";
import { inspectDataFile } from "./data";
import { providerInfo } from "./providers";
import { L } from "./i18n";

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "thinking"; delta: string }
  | { type: "tool"; id: string; name: string; input: unknown; label: string } // label：给人看的一句话（按界面语言），界面只显示它
  | { type: "tool_result"; id: string; text: string; isError?: boolean; image?: string }
  | { type: "ask"; id: string; question: string; options: string[]; danger?: boolean }
  | { type: "confirm"; id: string; title: string; steps: { text: string; danger?: boolean }[]; danger?: boolean; okLabel: string; cancelLabel: string }
  | { type: "change"; id: string; text: string; undoable: boolean }
  | { type: "ask_resolved"; id: string; answer: string }
  | { type: "plan"; id: string; title: string; steps: { text: string; danger?: boolean }[] }
  | { type: "guide"; id: string; step?: number; total?: number; instruction: string; why: string; highlighted: boolean } // 教我做：这一步让用户自己做
  | { type: "suggest"; id: string; title: string; detail: string; actions: { id: string; label: string }[]; multi?: boolean; pick?: boolean }
  | { type: "status"; text: string }
  | { type: "file"; path: string }
  | { type: "usage"; model: string; input: number; output: number; cacheRead: number }
  | { type: "error"; text: string }
  | { type: "done"; stopped?: boolean };

export interface UserInput {
  text: string;
  images?: { data: string; mediaType: string; name?: string }[];
  files?: string[];
  tutorial?: boolean;
  lang?: "zh" | "en";
}

// 每轮附在用户消息后面的语言要求（界面是英文时让 AI 用英文回复）
const langNote = (lang?: string) =>
  lang === "en"
    ? "\n\n[Language: the user reads English only. Reply, plan steps, confirm cards, suggestions and tutorial explanations must all be in English. Tableau UI names may be quoted as they appear on screen.]"
    : "";

const TUTORIAL_ON = `

【教我做：开启】用户要自己动手学会，你是在旁边带着做的老师，不是替他做：
1. 先用两三句话讲清这张图的思路（用哪些字段、各放哪里、为什么），说一共几步。不要一次列出全部步骤。
2. 然后一次只教一步：调用 guide_step 高亮要点的位置，instruction 写怎么做（在哪里、点什么、把哪个字段拖到哪里），why 写为什么。调用后这一轮就结束，等用户自己做。
3. 用户说“做好了”：先用 tableau_state 检查这一步。做对了，用一句话肯定，再 guide_step 下一步；没做对，具体指出哪里不一样、怎么改，让用户再试。
4. 用户说“慢一点”或提问：先用更细的话解释（可以拆成更小的步骤），再继续同一步，不要跳步。
5. 用户说“这步帮我做”：只替他做这一步（可以用操作工具），做完说明你做了什么，再 guide_step 下一步。用户说“直接做”或“剩下的你来”：把剩下的步骤自己做完。
6. 全部做完后用一条消息总结，并给一份简短的步骤清单方便以后自己复习。`;
const TUTORIAL_OFF = `

【教程模式：关闭】直接完成任务，不必讲解每一步，结束时简要汇报结果。`;

// 把附件文件转成给 AI 看的文字说明（数据文件先做摘要，让 AI 分析后再问用户怎么处理）
async function describeFiles(files: string[] | undefined): Promise<string> {
  if (!files?.length) return "";
  const parts: string[] = [];
  for (const f of files) {
    try {
      parts.push(`### 附件：${f}\n` + (await inspectDataFile(f)));
    } catch (e) {
      parts.push(`### 附件：${f}\n读取失败：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return "\n\n用户附带了以下文件。先根据摘要简要分析内容，再用 ask_user 问用户想怎么处理（例如上传到 Tableau 并做哪些图），不要擅自开始大量操作：\n" + parts.join("\n\n");
}

export interface AgentOptions {
  provider: ProviderId;
  apiKey: string;
  model: string;
  tools: ToolHost;
  emit: (ev: AgentEvent) => void;
}

interface ProviderAdapter {
  runTurn(input: UserInput, signal: AbortSignal): Promise<void>;
  setKey(key: string, model: string): void;
  getMessages(): unknown[];
  setMessages(m: unknown[]): void;
}

// 保存到本地前把图片换成文字占位（截图只在当次对话里有用，存下来太大）
function stripImages(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripImages);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.type === "image" || o.type === "image_url") return { type: "text", text: "[截图已省略]" };
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) out[k] = stripImages(val);
    return out;
  }
  return v;
}

const MAX_STEPS = 160;

export class Agent {
  running = false;
  provider: ProviderId;
  private adapter: ProviderAdapter;
  private abort: AbortController | null = null;
  // 运行中用户插话（引导）：在下一次请求模型前并入上下文
  private steerQueue: string[] = [];

  constructor(private o: AgentOptions) {
    this.provider = o.provider;
    const take = () => this.steerQueue.splice(0);
    this.adapter = o.provider === "claude" ? new ClaudeAdapter(o, () => this.stopped(), take) : new OpenAICompatAdapter(o, () => this.stopped(), take);
  }

  updateKey(key: string, model: string) {
    this.adapter.setKey(key, model);
  }

  private stopped() {
    return !!this.abort?.signal.aborted;
  }

  // 运行中才接受引导；返回 false 表示当前没有任务在跑，应当按普通消息发送
  steer(text: string): boolean {
    if (!this.running || !text.trim()) return false;
    this.steerQueue.push(text.trim().slice(0, 4000));
    return true;
  }

  async run(input: UserInput) {
    this.running = true;
    this.abort = new AbortController();
    this.steerQueue = [];
    try {
      await this.adapter.runTurn(input, this.abort.signal);
      // 模型已经收尾但还有没并进去的引导：接着按新消息处理
      while (this.steerQueue.length && !this.abort.signal.aborted) {
        const t = this.steerQueue.splice(0).join("\n");
        await this.adapter.runTurn({ text: t, lang: input.lang, tutorial: input.tutorial }, this.abort.signal);
      }
      this.o.emit({ type: "done", stopped: this.abort.signal.aborted });
    } catch (e) {
      if (this.abort.signal.aborted) this.o.emit({ type: "done", stopped: true });
      else {
        this.o.emit({ type: "error", text: describeError(e) });
        this.o.emit({ type: "done" });
      }
    } finally {
      this.running = false;
    }
  }

  stop() {
    this.abort?.abort();
  }

  // 项目的 AI 上下文：保存到本地、重新打开项目时恢复
  exportHistory(): { provider: ProviderId; messages: unknown[] } {
    return { provider: this.provider, messages: stripImages(this.adapter.getMessages()) as unknown[] };
  }

  importHistory(h: unknown) {
    const d = h as { provider?: string; messages?: unknown[] } | null;
    if (!d || d.provider !== this.provider || !Array.isArray(d.messages)) return;
    this.adapter.setMessages(d.messages);
  }
}

function steerNote(list: string[]): string {
  return `用户在你操作过程中补充（请立即考虑，必要时调整接下来的做法）：\n${list.join("\n")}`;
}

function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return L("API Key 无效，请到设置中重新填写。", "This API key is invalid. Enter it again in Settings.");
  if (e instanceof Anthropic.PermissionDeniedError) return L("这个 API Key 没有权限使用该模型。", "This API key doesn't have access to this model.");
  if (e instanceof Anthropic.RateLimitError) return L("请求过于频繁或额度已用完（429），请稍后再试。", "Too many requests or quota used up (429). Try again later.");
  if (e instanceof Anthropic.BadRequestError) return L("请求被拒绝（400）：", "Request rejected (400): ") + e.message;
  if (e instanceof Anthropic.APIConnectionError) return L("网络连接失败，请检查网络或代理设置。", "Can't connect. Check your network or proxy settings.");
  if (e instanceof Anthropic.APIError) return L(`API 错误 ${e.status}：`, `API error ${e.status}: `) + e.message;
  return e instanceof Error ? e.message : String(e);
}

async function runTool(o: AgentOptions, id: string, name: string, input: unknown): Promise<ToolResult> {
  o.emit({ type: "tool", id, name, input, label: stepLabel(name, input) });
  let result: ToolResult;
  try {
    result = await o.tools.execute(name, input ?? {});
  } catch (e) {
    result = { text: "工具执行出错：" + (e instanceof Error ? e.message : String(e)), isError: true };
  }
  o.emit({ type: "tool_result", id, text: result.text, isError: result.isError, image: result.image?.data });
  return result;
}

// ---------------- Claude ----------------

class ClaudeAdapter implements ProviderAdapter {
  private client: Anthropic;
  private model: string;
  private messages: Anthropic.Beta.BetaMessageParam[] = [];

  getMessages() {
    return this.messages;
  }

  setMessages(m: unknown[]) {
    this.messages = m as Anthropic.Beta.BetaMessageParam[];
  }

  constructor(
    private o: AgentOptions,
    private isStopped: () => boolean,
    private takeSteer: () => string[] = () => [],
  ) {
    this.client = new Anthropic({ apiKey: o.apiKey });
    this.model = o.model;
  }

  setKey(key: string, model: string) {
    this.client = new Anthropic({ apiKey: key });
    this.model = model;
  }

  async runTurn(input: UserInput, signal: AbortSignal) {
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    for (const img of input.images ?? []) {
      content.push({ type: "image", source: { type: "base64", media_type: img.mediaType as "image/png", data: img.data } });
    }
    const text = (input.text || "（见附件）") + (await describeFiles(input.files)) + (input.tutorial ? TUTORIAL_ON : TUTORIAL_OFF) + langNote(input.lang);
    content.push({ type: "text", text });
    this.messages.push({ role: "user", content });
    const tools: Anthropic.Beta.BetaTool[] = TOOL_DEFS.map((t) => ({ ...t, strict: true }));
    for (let step = 0; step < MAX_STEPS; step++) {
      if (this.isStopped()) return;
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: 64000,
          system: [{ type: "text", text: systemPrompt(true), cache_control: { type: "ephemeral" } }],
          tools,
          // 偶尔会把很早的截图换成文字（见 trimOldScreenshots），这时对应的思考块按 API 规则直接丢弃而不是报错
          thinking: { type: "adaptive", display: "summarized", block_binding: { prefix_mismatch_behavior: "drop_block" } },
          output_config: { effort: "high" },
          cache_control: { type: "ephemeral" },
          betas: ["server-side-fallback-2026-07-01", "context-management-2025-06-27", "thinking-binding-controls-2026-08-01"],
          fallbacks: "default",
          context_management: {
            edits: [
              {
                type: "clear_tool_uses_20250919",
                trigger: { type: "input_tokens", value: 60000 },
                keep: { type: "tool_uses", value: 6 },
                clear_at_least: { type: "input_tokens", value: 20000 },
              },
            ],
          },
          messages: this.messages,
        },
        { signal },
      );
      stream.on("text", (delta) => this.o.emit({ type: "text", delta }));
      stream.on("thinking", (delta) => {
        if (delta) this.o.emit({ type: "thinking", delta });
      });
      const message = await stream.finalMessage();
      this.o.emit({
        type: "usage",
        model: message.model,
        input: message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0),
        output: message.usage.output_tokens,
        cacheRead: message.usage.cache_read_input_tokens ?? 0,
      });

      if (message.stop_reason === "refusal") {
        this.messages.push({ role: "assistant", content: message.content });
        this.o.emit({ type: "error", text: L("模型拒绝了这项请求", "The model declined this request") + (message.stop_details?.explanation ? ": " + message.stop_details.explanation : ".") });
        return;
      }
      this.messages.push({ role: "assistant", content: message.content });
      if (message.stop_reason === "pause_turn") continue;
      const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (toolUses.length === 0) return;
      if (message.stop_reason === "max_tokens") {
        this.o.emit({ type: "error", text: L("回复超出长度上限，已停止。", "The reply hit its length limit. Stopped.") });
        // 仍需为每个 tool_use 补上结果，保证历史合法
      }

      const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        if (this.isStopped() || message.stop_reason === "max_tokens") {
          results.push({ type: "tool_result", tool_use_id: tu.id, content: "已被用户停止，未执行。", is_error: true });
          continue;
        }
        const r = await runTool(this.o, tu.id, tu.name, tu.input);
        const content: Anthropic.Beta.BetaToolResultBlockParam["content"] = [{ type: "text", text: r.text }];
        if (r.image) content.push({ type: "image", source: { type: "base64", media_type: r.image.mediaType, data: r.image.data } });
        results.push({ type: "tool_result", tool_use_id: tu.id, content, is_error: r.isError || undefined });
      }
      const steer = this.takeSteer();
      const extra: Anthropic.Beta.BetaTextBlockParam[] = steer.length ? [{ type: "text", text: steerNote(steer) }] : [];
      this.messages.push({ role: "user", content: [...results, ...extra] });
      trimOldScreenshots(this.messages);
      if (this.isStopped() || message.stop_reason === "max_tokens") return;
    }
    this.o.emit({ type: "error", text: L(`已执行 ${MAX_STEPS} 步仍未完成，已自动停止。`, `Not finished after ${MAX_STEPS} steps. Stopped.`) });
  }
}

// 历史里的截图超过 16 张时，一次性把较早的换成文字占位，只留最近 4 张。
// 批量、低频地改，避免每一轮都改历史（改历史会让之前的思考块失效、缓存重来）。
function trimOldScreenshots(messages: Anthropic.Beta.BetaMessageParam[]) {
  const spots: { block: Anthropic.Beta.BetaToolResultBlockParam; idx: number }[] = [];
  for (const m of messages) {
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b.type === "tool_result" && Array.isArray(b.content)) {
        b.content.forEach((c, idx) => {
          if (c.type === "image") spots.push({ block: b, idx });
        });
      }
    }
  }
  if (spots.length <= 16) return;
  for (const { block, idx } of spots.slice(0, -4)) {
    (block.content as Anthropic.Beta.BetaToolResultBlockParam["content"] & unknown[])[idx] = { type: "text", text: "[较早的截图已省略]" };
  }
}

// ---------------- OpenAI 兼容接口（看图能力取决于提供方；不能看图时靠结构化状态验证） ----------------

type OAPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
interface OAMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | OAPart[] | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  reasoning_content?: string;
}

class OpenAICompatAdapter implements ProviderAdapter {
  private key: string;
  private model: string;
  private messages: OAMessage[] = [];

  getMessages() {
    return this.messages;
  }

  setMessages(m: unknown[]) {
    this.messages = m as OAMessage[];
  }
  private baseURL: string;
  private label: string;
  private vision: boolean;
  private probed = false;

  constructor(
    private o: AgentOptions,
    private isStopped: () => boolean,
    private takeSteer: () => string[] = () => [],
  ) {
    this.key = o.apiKey;
    this.model = o.model;
    const info = providerInfo(o.provider)!;
    this.baseURL = info.baseURL;
    this.label = info.name;
    this.vision = info.vision;
  }

  setKey(key: string, model: string) {
    this.key = key;
    this.model = model;
  }

  async runTurn(input: UserInput, signal: AbortSignal) {
    // 能不能看图按具体模型实测一次（结果缓存）
    if (!this.probed) {
      this.probed = true;
      this.vision = await probeVision(this.o.provider, this.baseURL, this.key, this.model);
    }
    if (this.messages.length === 0) this.messages.push({ role: "system", content: systemPrompt(this.vision) });
    // 新一轮用户输入开始：上一轮的推理内容不再回传
    for (const m of this.messages) delete m.reasoning_content;
    let text = (input.text || "（见附件）") + (await describeFiles(input.files)) + (input.tutorial ? TUTORIAL_ON : TUTORIAL_OFF) + langNote(input.lang);
    if (input.images?.length && !this.vision) text += `\n\n（用户附了 ${input.images.length} 张图片，但当前模型看不到图片。请告诉用户需要用文字描述图片内容，或换一个能看图的 AI。）`;
    if (input.images?.length && this.vision) {
      const parts: OAPart[] = input.images.map((img) => ({ type: "image_url", image_url: { url: `data:${img.mediaType};base64,${img.data}` } }));
      parts.push({ type: "text", text });
      this.messages.push({ role: "user", content: parts });
    } else this.messages.push({ role: "user", content: text });
    const tools = TOOL_DEFS.filter((t) => this.vision || t.name !== "screenshot").map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }));
    for (let step = 0; step < MAX_STEPS; step++) {
      if (this.isStopped()) return;
      trimHistory(this.messages);
      const { msg, finish } = await this.streamOnce(tools, signal);
      const calls: DSCall[] = msg.tool_calls ?? [];
      // 官方规则：发生过工具调用的推理模型，同一轮内需回传 reasoning_content
      this.messages.push({
        role: "assistant",
        content: msg.content ?? "",
        tool_calls: calls.length ? calls : undefined,
        reasoning_content: calls.length && msg.reasoning_content ? msg.reasoning_content : undefined,
      });
      if (!calls.length) {
        if (finish === "length") this.o.emit({ type: "error", text: L("回复超出长度上限，已停止。", "The reply hit its length limit. Stopped.") });
        return;
      }
      const truncated = finish === "length";
      const pendingImages: string[] = [];
      if (truncated) this.o.emit({ type: "error", text: L("回复超出长度上限，未执行操作，已停止。", "The reply hit its length limit; nothing was run. Stopped.") });
      for (const c of calls) {
        if (truncated || this.isStopped()) {
          this.messages.push({ role: "tool", tool_call_id: c.id, content: truncated ? "输出被截断，未执行。" : "已被用户停止，未执行。" });
          continue;
        }
        let input: unknown = {};
        try {
          input = JSON.parse(c.function.arguments || "{}");
        } catch {
          this.o.emit({ type: "tool", id: c.id, name: c.function.name, input: c.function.arguments, label: stepLabel(c.function.name, c.function.arguments) });
          const t = "参数不是合法 JSON，请重新调用。";
          this.o.emit({ type: "tool_result", id: c.id, text: t, isError: true });
          this.messages.push({ role: "tool", tool_call_id: c.id, content: t });
          continue;
        }
        const r = await runTool(this.o, c.id, c.function.name, input);
        this.messages.push({ role: "tool", tool_call_id: c.id, content: (r.isError ? "错误：" : "") + r.text });
        // OpenAI 兼容接口的工具结果不能带图片：截图另起一条用户消息附上
        if (r.image && this.vision) pendingImages.push(r.image.data);
      }
      if (pendingImages.length) {
        const parts: OAPart[] = [{ type: "text", text: "（上面工具返回的截图）" }];
        for (const d of pendingImages) parts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${d}` } });
        this.messages.push({ role: "user", content: parts });
      }
      const steer = this.takeSteer();
      if (steer.length) this.messages.push({ role: "user", content: steerNote(steer) });
      if (truncated) return;
    }
    this.o.emit({ type: "error", text: L(`已执行 ${MAX_STEPS} 步仍未完成，已自动停止。`, `Not finished after ${MAX_STEPS} steps. Stopped.`) });
  }

  // 一次流式请求（SSE），边收边发 text / thinking 事件，返回拼好的 assistant 消息
  private async streamOnce(tools: unknown[], signal: AbortSignal): Promise<{ msg: DSMessage; finish: string }> {
    let res: Response;
    try {
      res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${this.key}` },
        body: JSON.stringify({ model: this.model, messages: this.messages, tools, max_tokens: 8192, stream: true, stream_options: { include_usage: true } }),
        signal,
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw new Error(L("网络连接失败，请检查网络或代理设置。", "Can't connect. Check your network or proxy settings."));
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        res.status === 401 || res.status === 403
          ? L(`${this.label} 的 API Key 无效，请到设置中重新填写。`, `The ${this.label} API key is invalid. Enter it again in Settings.`)
          : res.status === 402
            ? L(`${this.label} 账户余额不足。`, `Your ${this.label} balance is too low.`)
            : res.status === 429
              ? L("请求过于频繁或额度已用完（429），请稍后再试。", "Too many requests or quota used up (429). Try again later.")
              : L(`${this.label} 接口错误 ${res.status}：`, `${this.label} API error ${res.status}: `) + body.slice(0, 300),
      );
    }
    const msg: DSMessage = { content: "", reasoning_content: "", tool_calls: [] };
    let finish = "";
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    try {
      for (;;) {
        // 90 秒没有任何数据就当连接卡死，避免界面一直转圈
        let idle: ReturnType<typeof setTimeout> | undefined;
        const { done, value } = await Promise.race([
          reader.read(),
          new Promise<never>((_, rej) => {
            idle = setTimeout(() => rej(new Error("idle")), 90000);
          }),
        ]).finally(() => clearTimeout(idle));
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let j: any;
          try {
            j = JSON.parse(payload);
          } catch {
            continue;
          }
          if (j.usage) {
            this.o.emit({
              type: "usage",
              model: this.model,
              input: j.usage.prompt_tokens ?? 0,
              output: j.usage.completion_tokens ?? 0,
              cacheRead: j.usage.prompt_cache_hit_tokens ?? 0,
            });
          }
          const ch = j.choices?.[0];
          if (!ch) continue;
          const d = ch.delta ?? {};
          if (d.reasoning_content) {
            msg.reasoning_content += d.reasoning_content;
            this.o.emit({ type: "thinking", delta: d.reasoning_content });
          }
          if (d.content) {
            msg.content += d.content;
            this.o.emit({ type: "text", delta: d.content });
          }
          for (const tc of d.tool_calls ?? []) {
            const k = tc.index ?? 0;
            const cur = (msg.tool_calls![k] ??= { id: "", type: "function", function: { name: "", arguments: "" } });
            if (tc.id) cur.id = tc.id;
            if (tc.function?.name) cur.function.name += tc.function.name;
            if (tc.function?.arguments) cur.function.arguments += tc.function.arguments;
          }
          if (ch.finish_reason) finish = ch.finish_reason;
        }
      }
    } catch (e) {
      if (signal.aborted) throw e;
      throw new Error(L("连接中断，请重试。", "The connection dropped. Try again."));
    }
    msg.tool_calls = msg.tool_calls!.filter(Boolean);
    return { msg, finish };
  }
}

// ---- OpenAI 兼容接口辅助 ----

// 用一张 1×1 的图片试一下这个模型能不能看图；结果按“提供方/模型”缓存
const visionCache = new Map<string, boolean>();
const TINY_PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
async function probeVision(provider: string, baseURL: string, key: string, model: string): Promise<boolean> {
  const k = `${provider}/${model}`;
  if (visionCache.has(k)) return visionCache.get(k)!;
  let ok = false;
  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        max_tokens: 5,
        messages: [{ role: "user", content: [{ type: "image_url", image_url: { url: `data:image/png;base64,${TINY_PNG}` } }, { type: "text", text: "回答 ok" }] }],
      }),
      signal: AbortSignal.timeout(20000),
    });
    ok = res.ok;
  } catch {
    ok = false;
  }
  visionCache.set(k, ok);
  return ok;
}
type DSCall = { id: string; type: "function"; function: { name: string; arguments: string } };
interface DSMessage {
  content: string;
  reasoning_content: string;
  tool_calls?: DSCall[];
}

// 历史过长时，把较早的工具结果替换成占位，只保留最近 8 条完整结果
function trimHistory(messages: OAMessage[]) {
  // 截图只保留最近 2 条消息里的，更早的换成文字占位
  const withImg = messages.map((m, i) => (Array.isArray(m.content) && m.content.some((p) => p.type === "image_url") ? i : -1)).filter((i) => i >= 0);
  for (const i of withImg.slice(0, -2)) {
    const m = messages[i];
    m.content = (m.content as OAPart[]).map((p) => (p.type === "image_url" ? { type: "text", text: "[较早的截图已省略]" } : p)) as OAPart[];
  }
  const LIMIT = 120000; // 字符数粗估，约对应 64K token 窗口的安全边界
  const len = (c: OAMessage["content"]) => (typeof c === "string" ? c.length : Array.isArray(c) ? c.reduce((n, p) => n + (p.type === "text" ? p.text.length : 1000), 0) : 0);
  let total = 0;
  for (const m of messages) total += len(m.content) + (m.tool_calls ? JSON.stringify(m.tool_calls).length : 0);
  if (total <= LIMIT) return;
  const toolIdx = messages.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  for (const i of toolIdx.slice(0, -8)) {
    const m = messages[i];
    if (len(m.content) > 200) m.content = "[较早的工具结果已省略以节省上下文]";
  }
}
