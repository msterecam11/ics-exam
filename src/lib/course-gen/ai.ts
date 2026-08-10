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

// No timeout meant a call that never got a response never threw either — it
// just sat there. The worker loop processes exactly one job step at a time
// (see worker.ts), so one hung call didn't fail that slide, it froze the
// ENTIRE queue indefinitely: nothing else in the course, or in any OTHER
// course generating on this instance, could advance until a human noticed
// and restarted the process. That is exactly what happened on the RAC
// course — slide 4 of module 1 sat at "running" for 20+ minutes with no
// error recorded, because there was nothing to time it out and force an
// error in the first place.
/**
 * Wall-clock budget for one attempt.
 *
 * Deliberately NOT a straight multiple of max_tokens. max_tokens is a ceiling
 * that callers are encouraged to set generously (it costs nothing unused), so
 * treating it as the expected output length made every generous cap buy an
 * absurd timeout — a 32k ceiling would have meant a sixteen-minute window on
 * a call that realistically streams a third of that.
 *
 * A fraction of the ceiling, bounded at both ends: enough that a call using
 * most of its budget still finishes, short enough that a genuine stall
 * surfaces as an error while someone is still watching the screen.
 */
function timeoutForTokens(maxTokens: number): number {
  return Math.min(10 * 60_000, Math.max(4 * 60_000, maxTokens * 12))
}

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? "placeholder",
  // The SDK retries timeouts ITSELF, twice, by default — its own docs warn
  // "request timeouts are retried by default, so in a worst-case scenario you
  // may wait much longer than this timeout". Layered under withRetry's 4
  // attempts that is 12 tries, so a 5-minute timeout meant an HOUR before the
  // job failed. That is precisely why the RAC course sat "running" for 28
  // minutes with no error after the timeout was supposedly in place.
  //
  // Retry policy belongs in exactly one place, and withRetry is already that
  // place for this repo.
  maxRetries: 0,
})

/**
 * A timeout costs MINUTES per attempt, where a 429 costs milliseconds. Giving
 * both the same retry budget is what turns a stalled call into a job that
 * looks frozen: 4 attempts × a multi-minute timeout is half an hour of
 * silence. Rate limits keep the generous budget because retrying them is
 * cheap and usually works; a stall gets one second chance and then fails
 * loudly, which is the outcome that is actually useful to a human watching.
 */
const MAX_TIMEOUT_ATTEMPTS = 2

export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 1500): Promise<T> {
  let timeoutAttempts = 0
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status
      const isTimeout = err instanceof Anthropic.APIConnectionTimeoutError
        || err?.name === "APIConnectionTimeoutError" || err?.code === "ETIMEDOUT"
      if (isTimeout && ++timeoutAttempts >= MAX_TIMEOUT_ATTEMPTS) throw err
      const retryable = status === 429 || status === 529 || status === 503 || isTimeout
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
  const maxTokens = opts.maxTokens ?? 8192
  const msg = await withRetry(async () =>
    anthropic.messages.stream({
      model: opts.model,
      max_tokens: maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.prompt }],
    }, { timeout: timeoutForTokens(maxTokens) }).finalMessage()
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
  // No `temperature`, for the same reason claudeJSON has none: Sonnet 5 400s
  // on any non-default value. This call carried `temperature: 0` unnoticed
  // because its only caller was the QA reviewer on Haiku, which accepts it.
  // The moment the design agent (Sonnet) was given vision, every sighted
  // retry failed with "`temperature` is deprecated for this model".
  //
  // Streamed like claudeJSON: an image plus a 16k-token design response is
  // long enough to hit the SDK's non-streaming timeout, which the short QA
  // verdicts never did.
  const maxTokens = opts.maxTokens ?? 1024
  const msg = await withRetry(async () =>
    anthropic.messages.stream({
      model: opts.model,
      max_tokens: maxTokens,
      system: opts.system,
      messages: [{ role: "user", content }],
    }, { timeout: timeoutForTokens(maxTokens) }).finalMessage()
  )
  assertUsableResponse(msg, opts.label ?? "Claude vision call")
  return parseJsonLoose(extractText(msg))
}
