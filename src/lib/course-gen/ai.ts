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
  // Reading a regulation against a claim is close reading, not pattern
  // matching — a contradiction missed here ships as a compliance error, so
  // this one does not get the cheap model.
  qa_fact:       process.env.CG_MODEL_FACT    ?? "claude-sonnet-5",
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

/**
 * Turn the two silent failure modes into named errors.
 *
 * Without this both land in parseJsonLoose as "Unexpected end of JSON input",
 * which reads like a parser bug and sends you looking in the wrong place.
 */
export function assertUsableResponse(msg: Anthropic.Message, label: string): void {
  if (msg.stop_reason === "refusal") {
    const category = (msg as any).stop_details?.category
    throw new Error(
      `${label}: the model declined this request on safety grounds` +
      `${category ? ` (category: ${category})` : ""}. ` +
      `Aviation security material — unlawful interference, screening procedures, threat ` +
      `scenarios — can trip the safety classifiers even when the training use is legitimate. ` +
      `Rewrite the source passage, or author this slide by hand.`
    )
  }
  if (msg.stop_reason === "max_tokens") {
    throw new Error(
      `${label}: hit the output cap after ${msg.usage.output_tokens} tokens with the answer ` +
      `still unfinished. Thinking shares this budget with the response — raise maxTokens.`
    )
  }
}

export function parseJsonLoose(raw: string): any {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
  const match = cleaned.match(/[[{][\s\S]*[\]}]/)
  return JSON.parse(match ? match[0] : cleaned)
}

/**
 * One text-in → JSON-out call. Throws on unparseable output.
 *
 * No `temperature` — Sonnet 5 (every model in MODELS) 400s on any non-default
 * value, and these are structured-JSON extraction/generation calls where
 * consistency is wanted anyway, so there's nothing to steer with sampling.
 */
export async function claudeJSON(opts: {
  model: string
  system?: string
  prompt: string
  maxTokens?: number
  /** Names this call in error messages — worth setting on every caller. */
  label?: string
}): Promise<any> {
  // Streamed, not awaited whole: the SDK times out long non-streaming
  // requests, and thinking makes these turns longer than the token count
  // alone suggests. Streaming removes that ceiling; the final message is
  // identical either way.
  const msg = await withRetry(async () =>
    anthropic.messages.stream({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 8192,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    }).finalMessage()
  )
  assertUsableResponse(msg, opts.label ?? "Claude call")
  return parseJsonLoose(extractText(msg))
}

/** Vision call: images (base64 PNG) + prompt → JSON verdict. */
export async function claudeVisionJSON(opts: {
  model: string
  system?: string
  prompt: string
  imagesBase64Png: string[]
  maxTokens?: number
  label?: string
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
  assertUsableResponse(msg, opts.label ?? "Claude vision call")
  return parseJsonLoose(extractText(msg))
}
