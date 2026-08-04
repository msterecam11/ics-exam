// Chat agent — a module-aware editor with hands.
//
// It sees the whole module (as a compact map, expanded on demand via a
// tool), reasons freely about what the instruction requires, and then
// expresses every decision as ops from a closed vocabulary. That split is
// what keeps it powerful AND safe: unlimited judgement, but all writes go
// through the same validated element/page mutations the manual editor uses,
// so every AI change is undoable, auditable, and scoped to this module.
//
// Runs in-request rather than on the worker queue: the user is sitting in
// the chat waiting, and a chat turn is cheap to retry if it fails — the
// queue exists for long work that must survive restarts, which this isn't.
// A cg_generation_jobs row is still written for the audit trail.

import { db } from "@/lib/db"
import Anthropic from "@anthropic-ai/sdk"
import { MODELS, anthropic, withRetry, parseJsonLoose, assertUsableResponse } from "../ai"
import { compileBlueprint } from "../compiler"
import { iconPromptBlock } from "../icons"
import { moduleAccentToken } from "./orchestrator"
import type { CanvasElement } from "../primitives"
import type { Master } from "../theme1"
import type { ThemeTokens } from "../tokens"

export type AgentOp =
  | { op: "update_element"; page_index: number; element_id: string; patch: Record<string, unknown> }
  | { op: "add_element"; page_index: number; element: CanvasElement }
  | { op: "delete_element"; page_index: number; element_id: string }
  | { op: "rewrite_slide"; page_index: number; title?: string; blueprint: any; intent?: string }
  | { op: "add_slide"; after_index: number; layout_kind: string; title: string; blueprint?: any; intent?: string }
  | { op: "delete_slide"; page_index: number }
  | { op: "reorder_slide"; page_index: number; to_index: number }

export interface ChatProposal {
  summary: string
  ops: AgentOp[]
  warnings: string[]
  /** Concrete element sets for ops that required a compile, keyed by page_index
   *  (or "new:<afterIndex>" for added slides) so the client can preview the
   *  real result rather than a description of it. */
  compiled: Record<string, CanvasElement[]>
  auto_applied: boolean
}

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_slide",
    description: "Fetch the full semantic content and element list of one slide in this module. Use when you need detail beyond the module map — e.g. before rewriting or restyling a specific slide.",
    input_schema: {
      type: "object",
      properties: { page_index: { type: "number", description: "0-based index of the slide within this module" } },
      required: ["page_index"],
    },
  },
]

function moduleMap(pages: any[]): string {
  return pages.map((p, i) => {
    const sc = p.source_content ?? {}
    const title = sc.title ?? "(untitled)"
    const flags = [
      sc.intent ? `intent=${sc.intent}` : null,
      p.manually_diverged ? "MANUALLY EDITED" : null,
    ].filter(Boolean).join(", ")
    return `#${i} [${p.layout_kind}] "${title}"${flags ? ` (${flags})` : ""} — ${p.elements?.length ?? 0} elements`
  }).join("\n")
}

export async function runChatEdit(opts: {
  courseId: string
  moduleId: string
  instruction: string
  openPageIndex: number
  history: { role: "user" | "assistant"; content: string }[]
}): Promise<ChatProposal> {
  const { courseId, moduleId, instruction, openPageIndex } = opts

  const [{ data: course }, { data: mod }, { data: pagesRaw }] = await Promise.all([
    db.from("cg_courses")
      .select("id, title, regulatory_framework, target_audience, tone, language, cg_themes(tokens, layout_templates)")
      .eq("id", courseId).single(),
    db.from("cg_modules").select("id, title, order_index").eq("id", moduleId).single(),
    db.from("cg_pages")
      .select("id, order_index, layout_kind, elements, source_content, manually_diverged")
      .eq("module_id", moduleId).order("order_index"),
  ])
  if (!course || !mod) throw new Error("Course or module not found")

  const pages = pagesRaw ?? []
  const theme = (course as any).cg_themes
  const tokens = theme?.tokens as ThemeTokens
  const masters = (theme?.layout_templates ?? {}) as Record<string, Master>

  const moduleAccent = moduleAccentToken(mod.order_index)

  const system = `You are the editing agent inside ICS Aviation's course generator, working on ONE module of a training course. You already know this module's content — reason about it directly. When a rewrite is called for, you are a presentation designer looking at content and deciding its shape, not a form-filler — the same discipline the generation pipeline itself follows, not a lesser copy of it.

Course: "${course.title}"${course.regulatory_framework ? ` (${course.regulatory_framework})` : ""}
Audience: ${course.target_audience ?? "aviation professionals"} · Tone: ${course.tone ?? "corporate/formal"}
Module ${mod.order_index}: "${mod.title}"
This module's accent: ${moduleAccent} — use it for headings/badges/borders/highlights in this module instead of the default token:accent-warm, unless the instruction says otherwise. Reserve token:success/token:danger/token:tab-yellow for real positive/negative/caution meaning, never as decoration.
The user currently has slide #${openPageIndex} open.

## Module map
${moduleMap(pages)}

## What you may do
Decide freely what the instruction requires — rewriting content, restructuring a slide, adding or removing slides, restyling. Express every decision as ops:

- {"op":"rewrite_slide","page_index":N,"title":"…","intent":"…","blueprint":{…}} — replace a slide's content and structure. PREFER THIS over many small text edits.
- {"op":"add_slide","after_index":N,"layout_kind":"content_white","title":"…","intent":"…","blueprint":{…}}
- {"op":"delete_slide","page_index":N}
- {"op":"reorder_slide","page_index":N,"to_index":M}
- {"op":"update_element","page_index":N,"element_id":"el-3","patch":{…}} — targeted tweak (style, geometry, runs)
- {"op":"add_element","page_index":N,"element":{…}}
- {"op":"delete_element","page_index":N,"element_id":"el-3"}

## When you rewrite or add a slide
Before composing a blueprint, do the same reasoning generation does: what relationship do these facts actually have — a sequence, a hierarchy, one thing surrounded by related things, a comparison, an escalation — or are they genuinely just a list? Let THAT choose the shape, not habit. Would this exact composition work for a different slide with similar content? If yes, it's a template with the words swapped — reconsider. Spend your boldness in one place (one loud element per slide, everything else quiet); a numbered badge or accent bar is a claim that the content has that property, not a default reach.

Fact/enumeration primitives: row/stack/heading/body/bullets/card/badge-number/callout/icon-row/alternating-list/question-rows/stat/figure/table/chart/comparison.
Relationship primitives — reach for these whenever the relationship IS the content:
  flow (sequence/escalation, with optional "escalate":true for a severity colour ramp), radial (hub-and-satellites), tiers (stacked hierarchy bands), quote-banner (one statement worth landing on its own), stat-equation (terms + operators resolving to one outcome), tag-list (label + status pill).
Tier 3 — a "custom" node (justification + small relative-coordinate children) for anything none of the above express. Equally valid to reach for, not a last resort.
Never emit coordinates outside a custom node — structure only; the compiler lays it out inside the master.

Layout masters available: ${Object.keys(masters).join(", ")}.
Colour tokens: token:primary, token:primary-dark, token:primary-light, token:navy, token:accent-warm, token:danger, token:success, token:tab-yellow, token:text, token:text-inverse.

Icons — use ONLY these names; anything else renders as a blank marker:
${iconPromptBlock()}

Effects — any element may carry "effects": { "shadow":"sm|md|lg|glow",
"gradient":{"from":"token:primary","to":"token:primary-dark"}, "blur":12,
"textShadow":"soft|strong", "opacity":0.9 }. Use ONE elevation level per slide;
never put shadow or gradient on a chart or table (it obscures the data); blur
only on glass cards over dark backgrounds. Use them where they earn their
place — matching the content is the goal, not "always flat" or "always depth."

## Rules
- Stay inside THIS module. Never reference slides outside it.
- Slides marked MANUALLY EDITED have hand-positioned elements: rewrite_slide would discard that work, so prefer targeted edits there, and if you must rewrite, say so in your summary.
- Keep the ICS register: precise, factual, aviation-professional. A diagram-shaped rewrite (flow/radial/tiers) needs less running prose than a bullet slide — let the shape carry meaning. As a ceiling, keep body text under ~110 words.
- cover and section_divider slides carry ONLY master chrome (title, and on cover a fixed tagline) — never rewrite_slide or add_element on those; there is no content area to design there.
- Use get_slide when you need a slide's actual content before changing it.

## Output
When you are ready, reply with ONLY this JSON (no prose outside it):
{"summary":"one sentence describing what you're doing","ops":[…],"warnings":["…"]}
If the instruction needs no changes (a question, or nothing to do), return an empty ops array and put your answer in "summary".`

  const messages: Anthropic.MessageParam[] = [
    ...opts.history.slice(-6).map(h => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: instruction },
  ]

  // Tool loop — the agent pulls only the slides it actually needs, so
  // context stays small whether the module has 6 slides or 60.
  let result: any = null
  for (let turn = 0; turn < 5; turn++) {
    const msg = await withRetry(() => anthropic.messages.create({
      model: MODELS.chat,
      max_tokens: 16_000,
      system,
      tools: TOOLS,
      messages,
    }))

    // Passes through stop_reason "tool_use" — only refusal and truncation throw.
    assertUsableResponse(msg, "Chat edit")

    if (msg.stop_reason === "tool_use") {
      const toolUses = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      messages.push({ role: "assistant", content: msg.content })
      messages.push({
        role: "user",
        content: toolUses.map((tu): Anthropic.ToolResultBlockParam => {
          const idx = (tu.input as any)?.page_index
          const p = pages[idx]
          return {
            type: "tool_result",
            tool_use_id: tu.id,
            content: p
              ? JSON.stringify({
                  page_index: idx,
                  layout_kind: p.layout_kind,
                  manually_diverged: p.manually_diverged,
                  source_content: p.source_content,
                  elements: (p.elements ?? []).map((e: any) => ({
                    id: e.id, type: e.type,
                    text: e.type === "text" ? e.runs?.map((r: any) => r.text).join("") : undefined,
                  })),
                })
              : `No slide at index ${idx}`,
          }
        }),
      })
      continue
    }

    const text = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map(b => b.text).join("")
    try { result = parseJsonLoose(text) } catch { result = { summary: text.slice(0, 400), ops: [], warnings: [] } }
    break
  }

  if (!result) throw new Error("The agent did not return a result")

  const rawOps: AgentOp[] = Array.isArray(result.ops) ? result.ops : []
  const warnings: string[] = Array.isArray(result.warnings) ? [...result.warnings] : []

  // ── Validate: every target must exist and live in THIS module ────────────
  const ops = rawOps.filter(op => {
    if ("page_index" in op) {
      const p = pages[(op as any).page_index]
      if (!p) { warnings.push(`Ignored an edit aimed at slide #${(op as any).page_index}, which doesn't exist.`); return false }
      if (op.op === "rewrite_slide" && p.manually_diverged)
        warnings.push(`Slide #${op.page_index} was manually edited — rewriting it replaces your hand-positioned layout.`)
    }
    if (op.op === "add_slide" && !masters[op.layout_kind]) {
      warnings.push(`Ignored a new slide using unknown master "${op.layout_kind}".`)
      return false
    }
    return true
  })

  // ── Compile content-level ops so the preview shows the real result ───────
  const compiled: Record<string, CanvasElement[]> = {}
  for (const op of ops) {
    try {
      if (op.op === "rewrite_slide") {
        const p = pages[op.page_index]
        const master = masters[p.layout_kind] ?? masters.content_white
        const out = op.blueprint
          ? await compileBlueprint({ blueprint: op.blueprint, master, tokens, title: op.title ?? p.source_content?.title })
          : { elements: [] as CanvasElement[] }
        compiled[String(op.page_index)] = out.elements
      } else if (op.op === "add_slide") {
        const master = masters[op.layout_kind]
        const out = op.blueprint
          ? await compileBlueprint({ blueprint: op.blueprint, master, tokens, title: op.title })
          : { elements: [] as CanvasElement[] }
        compiled[`new:${op.after_index}`] = out.elements
      }
    } catch (err) {
      console.error("[course-gen] chat compile failed:", err)
      warnings.push("One proposed slide could not be laid out and was skipped.")
    }
  }

  // Small, non-destructive edits apply immediately; anything structural or
  // destructive is proposed for review first.
  const destructive = ops.some(o => o.op === "delete_slide" || o.op === "delete_element" || o.op === "rewrite_slide" || o.op === "add_slide")
  const autoApplied = ops.length > 0 && ops.length <= 2 && !destructive

  const proposal: ChatProposal = {
    summary: String(result.summary ?? "Done."),
    ops,
    warnings,
    compiled,
    auto_applied: autoApplied,
  }

  // Audit trail — what was asked, what was decided.
  await db.from("cg_generation_jobs").insert({
    course_id: courseId,
    module_id: moduleId,
    job_type: "chat_edit",
    status: "done",
    progress_pct: 100,
    input: { instruction, open_page_index: openPageIndex },
    output: { summary: proposal.summary, ops, warnings, auto_applied: autoApplied },
    completed_at: new Date().toISOString(),
  })

  return proposal
}
