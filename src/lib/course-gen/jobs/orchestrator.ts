// Orchestrator — pure code. Owns the generation lifecycle.
//
// Deliberate design: it processes exactly ONE SLIDE per execution, then
// re-queues itself with an advanced cursor. That keeps a 400-slide course
// out of a single multi-hour job, gives slide-level progress, survives
// restarts at slide granularity, and keeps the single-threaded worker
// responsive — all of which matter on a 512MB/0.5CPU instance.

import { db } from "@/lib/db"
import { handleSlideContentJob } from "./slideContent"
import { handleModuleContentJob } from "./moduleContent"
import { handleMediaJob } from "./media"
import { handleQaJob } from "./qa"
import { handleFactCheckJob, type FactVerdict } from "./factCheck"
import { compileBlueprint } from "../compiler"
import { fitTitleFontSize, stripModulePrefix } from "../typefit"
import { SLIDE_W, SLIDE_H } from "../tokens"
import type { Master } from "../theme1"
import type { ThemeTokens } from "../tokens"
import type { BlueprintNode, CanvasElement, ModuleContentPlan } from "../primitives"

const MAX_QA_RETRIES = 2

/**
 * One accent token per module, cycling through the theme's existing
 * decorative-purpose tokens — never inventing a color, and never touching
 * `success`/`danger`/`tab-yellow`, which already carry real meaning
 * elsewhere (positive/negative/caution in flow-escalate and tag-list). This
 * is the only per-module variation; chrome, background, and typography stay
 * exactly as the master defines them.
 */
export const MODULE_ACCENT_TOKENS = ["token:accent-warm", "token:primary-light", "token:primary-dark"]
export function moduleAccentToken(moduleNumber: number): string {
  const idx = Math.max(0, moduleNumber) % MODULE_ACCENT_TOKENS.length
  return MODULE_ACCENT_TOKENS[idx]
}

/**
 * Retries a browser-backed step. Chromium work on a constrained instance
 * fails intermittently in ways that succeed on a second try — a launch that
 * ran long, a page that missed its navigation budget under CPU contention.
 * A persistent fault still surfaces after the last attempt, so a genuinely
 * broken slide is not silently swallowed.
 */
async function withBrowserRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try { return await fn() } catch (err) {
      lastErr = err
      console.error(`[course-gen] browser step failed (attempt ${i + 1}/${attempts}):`, err)
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 2000 * (i + 1)))
    }
  }
  throw lastErr
}

interface Cursor { module_index: number; slide_index: number }

export interface OrchestratorTick {
  done: boolean
  cursor: Cursor
  step: string
  progress: number
}

function containsCustom(node: BlueprintNode | undefined | null): boolean {
  if (!node) return false
  if (node.type === "custom") return true
  const kids = (node as any).children as BlueprintNode[] | undefined
  if (Array.isArray(kids)) return kids.some(containsCustom)
  if (node.type === "comparison") return node.columns.some(c => c.children.some(containsCustom))
  return false
}

export async function handleOrchestratorTick(job: any): Promise<OrchestratorTick> {
  const courseId = job.course_id
  const plan = job.input?.plan as any[]
  if (!Array.isArray(plan) || plan.length === 0) throw new Error("Orchestrator has no approved plan")

  const cursor: Cursor = job.input?.cursor ?? { module_index: 0, slide_index: 0 }

  const { data: course } = await db
    .from("cg_courses")
    .select("*, cg_themes(tokens, layout_templates)")
    .eq("id", courseId)
    .single()
  if (!course) throw new Error("Course not found")

  const theme = (course as any).cg_themes
  if (!theme) throw new Error("Course has no theme")
  const tokens = theme.tokens as ThemeTokens
  const masters = theme.layout_templates as Record<string, Master>

  const totalSlides = plan.reduce((s, m) => s + (m.slides?.length ?? 0), 0)
  const doneBefore = plan
    .slice(0, cursor.module_index)
    .reduce((s, m) => s + (m.slides?.length ?? 0), 0) + cursor.slide_index

  const mod = plan[cursor.module_index]
  const slide = mod?.slides?.[cursor.slide_index]

  // Nothing left → course is ready.
  if (!mod || !slide) {
    await db.from("cg_courses")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", courseId)
    return { done: true, cursor, step: "Finished", progress: 100 }
  }

  const master = masters[slide.layout_kind] ?? masters.content_white
  // 1-based for humans: the cursor is 0-indexed, but "Module 0 of 1" reads
  // like a bug to anyone watching the progress panel.
  const stepLabel = `Module ${cursor.module_index + 1} of ${plan.length} — slide ${cursor.slide_index + 1}/${mod.slides.length}`

  // ── 0. Gather this module's content, once, before any slide is designed ──
  // Runs on the first tick of each module and caches to cg_modules so a
  // restart mid-module doesn't re-spend the call. Everything downstream then
  // reasons about FINISHED material instead of inventing facts and composing
  // a layout in the same breath.
  await progress(job.id, `${stepLabel} — gathering module content`, pct(doneBefore, totalSlides))
  const contentPlan = await getOrGatherModuleContent(courseId, mod)
  const slidePlan = contentPlan.slides[cursor.slide_index]

  // Shapes already used earlier in this module — read from what's already
  // persisted, so the design pass can deliberately vary instead of every
  // slide independently reaching for the same default.
  const { data: priorPages } = await db
    .from("cg_pages")
    .select("source_content")
    .eq("module_id", mod.module_id)
    .lt("order_index", cursor.slide_index)
  const shapesUsed = (priorPages ?? [])
    .map((p: any) => p.source_content?.shape)
    .filter(Boolean)

  // ── 1. Design (Sonnet) ────────────────────────────────────────────────────
  await progress(job.id, `${stepLabel} — designing`, pct(doneBefore + 0.15, totalSlides))
  let source = await handleSlideContentJob({
    course_id: courseId,
    module_id: mod.module_id,
    input: {
      slide,
      module_title: mod.title,
      module_number: mod.module_number,
      slide_index: cursor.slide_index,
      slide_total: mod.slides.length,
      content_plan: slidePlan,
      shapes_used: shapesUsed,
      module_accent: moduleAccentToken(mod.module_number),
      tokens,
      dark_background: master.background.tone === "dark",
    },
  })

  // Cover and divider text is decided here, not by the agent, because it is
  // about the COURSE and the module — facts the per-slide agent has no
  // business restating. Every module's cover leads with the course title so
  // a module extracted on its own still identifies the course it belongs to;
  // the module's own name becomes the secondary line. The divider drops the
  // "Module N:" prefix because the master already draws that number as a
  // large ghost numeral beside it.
  if (slide.layout_kind === "cover") {
    source.title = course.title
    if (!mod.is_module_zero) (source as any).subtitle = stripModulePrefix(mod.title)
  } else if (slide.layout_kind === "section_divider") {
    source.title = stripModulePrefix(source.title ?? mod.title)
  }

  let elements: CanvasElement[] = []
  let verdictFeedback = ""
  let factVerdict: FactVerdict | null = null

  for (let attempt = 0; attempt <= MAX_QA_RETRIES; attempt++) {
    // ── 2. Compile (code — CSS resolves geometry, then bake) ───────────────
    await progress(job.id, `${stepLabel} — laying out`, pct(doneBefore + 0.3, totalSlides))
    // The compile step drives a real browser, which on a small instance can
    // fail transiently (a slow Chromium launch, a page that misses its
    // navigation budget). Media and QA already tolerate that; this one did
    // not, so a single timeout aborted the whole course and threw away the
    // remaining slides. Retried here rather than inside the compiler so the
    // second attempt gets an entirely fresh browser.
    // Captured before the closure: `source` is reassigned on retry, so the
    // narrowing would not survive into the callback.
    const blueprint = source.blueprint
    const compiled = blueprint
      ? await withBrowserRetry(() => compileBlueprint({
          blueprint,
          master, tokens,
          title: source.title,
          subtitle: (source as any).subtitle,
        }))
      : { elements: titleOnlyElements(source, master, tokens), overflow: false, underfill: false }
    elements = compiled.elements

    // Geometric overflow is detectable without a vision call — fix it first.
    if (compiled.overflow && attempt < MAX_QA_RETRIES) {
      verdictFeedback = "The content overflowed its area. Produce noticeably less text and a simpler structure."
      source = await regenerate(courseId, mod, slide, cursor, slidePlan, shapesUsed, verdictFeedback)
      continue
    }
    // The opposite failure — nothing previously caught a slide that's mostly
    // empty white space; it passed QA legitimately because nothing checked.
    if (compiled.underfill && attempt < MAX_QA_RETRIES) {
      verdictFeedback = "This composition leaves too much empty space for the size of its area — it will read as unfinished rather than intentional. Either add genuine supporting material (another fact from the gathered content, a supporting stat, a second example) or choose a shape that fills the space honestly — a larger single statement, a fuller flow/tiers/radial composition. Do not just stretch existing text bigger."
      source = await regenerate(courseId, mod, slide, cursor, slidePlan, shapesUsed, verdictFeedback)
      continue
    }

    // ── 3. Media (library-first, generation fallback, validated) ───────────
    await progress(job.id, `${stepLabel} — sourcing imagery`, pct(doneBefore + 0.5, totalSlides))
    try {
      const media = await handleMediaJob({
        course_id: courseId,
        input: { elements, slide_title: source.title, sensitive: (source as any).sensitive },
      })
      elements = media.elements
    } catch (err) {
      console.error("[course-gen] media step failed (continuing without imagery):", err)
    }

    // An image that never resolved (no library match, no usable generation)
    // used to ship as-is — a visibly empty dashed box in the final deck,
    // since nothing downstream caught it. Same retry pattern as overflow:
    // fix it at the content layer rather than let a broken box through.
    const unresolvedImage = elements.some(e => e.type === "image" && !e.url)
    if (unresolvedImage && attempt < MAX_QA_RETRIES) {
      verdictFeedback = "The requested photo/illustration could not be sourced or generated. Do not use a figure for this content — represent it instead with a callout, table, chart, or one of the relationship primitives (flow/radial/tiers/custom)."
      source = await regenerate(courseId, mod, slide, cursor, slidePlan, shapesUsed, verdictFeedback)
      continue
    }

    // ── 4. QA vision check ────────────────────────────────────────────────
    await progress(job.id, `${stepLabel} — quality check`, pct(doneBefore + 0.7, totalSlides))
    let verdict
    try {
      verdict = await handleQaJob({
        input: {
          elements, master, tokens,
          slide_title: source.title,
          page_number: cursor.slide_index + 1,
          module_number: mod.module_number,
          partner_logo_light: course.partner_logo_light_url,
          partner_logo_dark: course.partner_logo_dark_url,
          is_custom: containsCustom(source.blueprint),
        },
      })
    } catch (err) {
      console.error("[course-gen] QA step failed (accepting slide):", err)
      break
    }

    // ── 4b. Factual check — does it match the clause it cites? ─────────────
    // Runs only once the slide looks right, so a slide destined for a layout
    // rewrite doesn't burn a fact call on text that's about to change.
    if (verdict.pass) {
      await progress(job.id, `${stepLabel} — checking facts`, pct(doneBefore + 0.85, totalSlides))
      try {
        factVerdict = await handleFactCheckJob({
          course_id: courseId,
          input: { elements, slide_title: source.title, citations: (source as any).citations },
        })
      } catch (err) {
        // An unavailable checker must not silently become a clean bill of
        // health — record that this slide went unverified.
        console.error("[course-gen] fact check failed:", err)
        factVerdict = {
          checked: false, pass: true, claims: [], fabricated_citations: [],
          feedback: `Fact check could not run: ${(err as any)?.message ?? "unknown error"}`,
        }
      }
    }

    const factOk = !factVerdict || factVerdict.pass
    if ((verdict.pass && factOk) || attempt === MAX_QA_RETRIES) break

    // Route the fix to the layer that can actually resolve it. A factual
    // failure always goes back to the content layer — no layout change can
    // make a wrong number right.
    verdictFeedback = !factOk
      ? factVerdict!.feedback
      : verdict.feedback || verdict.issues.map(i => i.detail).join("; ")
    source = await regenerate(courseId, mod, slide, cursor, slidePlan, shapesUsed, verdictFeedback)
  }

  // ── 5. Persist the finished slide ────────────────────────────────────────
  await db.from("cg_pages").insert({
    module_id: mod.module_id,
    order_index: cursor.slide_index,
    layout_kind: slide.layout_kind,
    background: {},
    elements,
    source_content: source,
    blueprint: source.blueprint ?? null,
    manually_diverged: false,
    // Kept on the slide so a reviewer can see WHY it was accepted — including
    // "unverified", which is a real state and not the same as "correct".
    fact_check: factVerdict,
  })

  // ── 6. Advance ───────────────────────────────────────────────────────────
  const next: Cursor =
    cursor.slide_index + 1 < mod.slides.length
      ? { module_index: cursor.module_index, slide_index: cursor.slide_index + 1 }
      : { module_index: cursor.module_index + 1, slide_index: 0 }

  const finished = next.module_index >= plan.length
  if (finished) {
    await db.from("cg_courses")
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", courseId)
  }

  return {
    done: finished,
    cursor: next,
    step: finished ? "Finished" : stepLabel,
    progress: pct(doneBefore + 1, totalSlides),
  }
}

async function regenerate(
  courseId: string, mod: any, slide: any, cursor: Cursor,
  slidePlan: unknown, shapesUsed: string[], feedback: string,
) {
  return handleSlideContentJob({
    course_id: courseId,
    module_id: mod.module_id,
    input: {
      slide,
      module_title: mod.title,
      module_number: mod.module_number,
      slide_index: cursor.slide_index,
      slide_total: mod.slides.length,
      content_plan: slidePlan,
      shapes_used: shapesUsed,
      module_accent: moduleAccentToken(mod.module_number),
      retry_feedback: feedback,
    },
  })
}

/**
 * Cached per module in `cg_modules.content_plan` — gathering is a single text
 * call (no browser, cheap), but still worth caching so a worker restart
 * mid-module doesn't re-spend it, and so every slide's design pass in this
 * module sees the exact same material.
 */
async function getOrGatherModuleContent(courseId: string, mod: any): Promise<ModuleContentPlan> {
  const { data: row } = await db
    .from("cg_modules")
    .select("content_plan")
    .eq("id", mod.module_id)
    .single()
  if (row?.content_plan?.slides?.length) return row.content_plan as ModuleContentPlan

  const plan = await handleModuleContentJob({
    course_id: courseId,
    module_id: mod.module_id,
    input: { mod },
  })
  await db.from("cg_modules").update({ content_plan: plan }).eq("id", mod.module_id)
  return plan
}

// Cover / divider / closing slides carry only master-zone text.
function titleOnlyElements(source: any, master: Master, tokens: ThemeTokens): CanvasElement[] {
  const dark = master.background.tone === "dark"
  const out: CanvasElement[] = []
  const titleZone = master.zones.find(z => z.name === "title")
  if (titleZone && source.title) {
    out.push({
      id: "el-title", type: "text",
      x: titleZone.x, y: titleZone.y, width: titleZone.width, height: titleZone.height,
      zIndex: 1,
      runs: [{ text: source.title, bold: true }],
      style: {
        // Shrunk to fit rather than fixed: the cover's title zone sits
        // directly above the logo band, so a long course title rendered at
        // the master's nominal size ran straight through it.
        fontSize: fitTitleFontSize({
          text: source.title,
          widthPx: (titleZone.width / 100) * SLIDE_W,
          heightPx: (titleZone.height / 100) * SLIDE_H,
          baseSize: (tokens.type_scale as any)?.[titleZone.token ?? "h2"] ?? 40,
        }),
        fontWeight: 800,
        color: dark ? "token:text-inverse" : "token:navy",
        align: "left", lineHeight: 1.2,
      },
    } as CanvasElement)
  }
  const subZone = master.zones.find(z => z.name === "subtitle")
  // An explicitly-set subtitle wins over the zone's standing text. The only
  // subtitles reaching here are set by the orchestrator itself (the module
  // name on a module cover) — the design agent never runs for these masters
  // — so this cannot reintroduce agent drift, and the brand tagline still
  // renders wherever nothing more specific was supplied.
  const subText = source.subtitle ?? subZone?.text
  if (subZone && subText) {
    out.push({
      id: "el-subtitle", type: "text",
      x: subZone.x, y: subZone.y, width: subZone.width, height: subZone.height,
      zIndex: 2,
      runs: [{ text: subText }],
      style: { fontSize: 18, color: dark ? "token:text-inverse" : "token:text", align: "left" },
    } as CanvasElement)
  }
  return out
}

function pct(done: number, total: number): number {
  return Math.min(99, Math.round((done / Math.max(1, total)) * 100))
}

async function progress(jobId: string, step: string, progressPct: number) {
  await db.from("cg_generation_jobs")
    .update({ current_step: step, progress_pct: progressPct })
    .eq("id", jobId)
}
