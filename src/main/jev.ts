// TypeSafe Jev 步骤验证器：用 noul 问题判断“上一步操作是否成功”，失败或超时返回 null，由调用方回退到大模型验证
const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const TIMEOUT_MS = 3000;

export interface VerifyResult {
  pass: boolean;
  /** noul 本身没有 confidence，这里取 |p-0.5|*2（0=拿不准，1=非常确定） */
  confidence: number;
  raw?: unknown;
}

export async function verifyStep(stateText: string, question: string, apiKey: string): Promise<VerifyResult | null> {
  if (!apiKey || !stateText || !question) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        state: stateText,
        questions: { check: { type: "noul", instructions: question } },
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    const p = data?.answers?.check?.noul;
    if (typeof p !== "number" || !Number.isFinite(p)) return null;
    return { pass: p >= 0.5, confidence: Math.abs(p - 0.5) * 2, raw: data };
  } catch {
    // 超时、网络错误、JSON 解析失败：统一回退；不记录请求头，避免泄露 Key
    return null;
  } finally {
    clearTimeout(timer);
  }
}
