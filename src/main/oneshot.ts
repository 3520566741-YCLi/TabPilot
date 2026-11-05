// 单次、小型的 AI 调用（返回 JSON），走用户在设置里连的提供方和模型。
// 用于左侧空状态的“下一步可以做什么”等轻量功能。
import Anthropic from "@anthropic-ai/sdk";
import { getSettings, getApiKey, modelFor } from "./settings";
import { providerInfo } from "./providers";

export async function askJSON(prompt: string, schema: Record<string, unknown>, maxTokens = 1200): Promise<unknown | null> {
  const s = getSettings();
  const key = getApiKey(s.provider);
  const model = modelFor(s, s.provider);
  if (!key || !model) return null;
  try {
    let raw = "";
    if (s.provider === "claude") {
      const client = new Anthropic({ apiKey: key, timeout: 30000, maxRetries: 1 });
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        output_config: { effort: "low", format: { type: "json_schema", schema } },
        messages: [{ role: "user", content: prompt }],
      });
      if (res.stop_reason === "refusal") return null;
      raw = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    } else {
      const info = providerInfo(s.provider);
      if (!info) return null;
      const res = await fetch(`${info.baseURL}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt + "\n\n只输出 JSON，结构：" + JSON.stringify(schema) }],
        }),
        signal: AbortSignal.timeout(30000),
      });
      if (!res.ok) return null;
      const data: any = await res.json();
      raw = String(data?.choices?.[0]?.message?.content ?? "").replace(/^```(json)?|```$/g, "").trim();
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
