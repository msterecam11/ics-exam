// Course Generator — Anthropic client + model registry.
//
// Every agent resolves its model from this env-overridable map, so model
// upgrades or vendor experiments are an env change on Render, never a code
// change. Locked stack: Sonnet = outline / slide content / chat agent;
// Haiku (vision) = QA checks / media relevance scoring. The Orchestrator
// and Compiler are pure code and never appear here by design.

import Anthropic from "@anthropic-ai/sdk"

export const MODELS = {
  outline:       process.env.CG_MODEL_OUTLINE ?? "claude-sonnet-5",
  slide_content: process.env.CG_MODEL_CONTENT ?? "claude-sonnet-5",
  chat:          process.env.CG_MODEL_CHAT    ?? "claude-sonnet-5",
  qa_vision:     process.env.CG_MODEL_QA      ?? "claude-haiku-4-5-20251001",
  media_scoring: process.env.CG_MODEL_MEDIA   ?? "claude-haiku-4-5-20251001",
} as const

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "placeholder",
})

// Exponential backoff on rate limits / overload — same resilience pattern
// the rest of the repo uses for Groq, adapted to Anthropic's error shapes.
export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status
      const retryable = status === 429 || status === 529 || status === 503
      if (attempt === retries || !retryable) throw err
      await new Promise(r => setTimeout(r, delayMs * Math.pow(2, attempt)))
    }
  }
  throw new Error("Max retries exceeded")
}

function extractText(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map(b => b.text)
    .join("")
}

export function parseJsonLoose(raw: string): any {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
  const match = cleaned.match(/[[{][\s\S]*[\]}]/)
  return JSON.parse(match ? match[0] : cleaned)
}

/** One text-in → JSON-out call. Throws on unparseable output. */
export async function claudeJSON(opts: {
  model: string
  system?: string
  prompt: string
  maxTokens?: number
  temperature?: number
}): Promise<any> {
  const msg = await withRetry(() =>
    anthropic.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 4096,
      temperature: opts.temperature ?? 0.4,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    })
  )
  return parseJsonLoose(extractText(msg))
}

/** Vision call: images (base64 PNG) + prompt → JSON verdict. */
export async function claudeVisionJSON(opts: {
  model: string
  system?: string
  prompt: string
  imagesBase64Png: string[]
  maxTokens?: number
}): Promise<any> {
  const content: Anthropic.ContentBlockParam[] = [
    ...opts.imagesBase64Png.map((data): Anthropic.ImageBlockParam => ({
      type: "image",
      source: { type: "base64", media_type: "image/png", data },
    })),
    { type: "text", text: opts.prompt },
  ]
  const msg = await withRetry(() =>
    anthropic.messages.create({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1024,
      temperature: 0,
      system: opts.system,
      messages: [{ role: "user", content }],
    })
  )
  return parseJsonLoose(extractText(msg))
}
