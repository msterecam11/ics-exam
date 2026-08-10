// Module Content Gather — runs ONCE per module, before any slide's design
// pass starts. This is the "gather everything, then think about how to show
// it" step: it writes the actual substantive material for every slide in the
// module in one pass, and names the RELATIONSHIP the material has (a
// sequence, a hierarchy, a comparison, an escalation…) — not a layout.
//
// Splitting this out of slideContent.ts matters for two reasons:
//   1. The design pass gets to reason about FINISHED material instead of
//      inventing facts and composing a layout in the same breath.
//   2. Because this call sees the whole module at once, it can name each
//      slide's relationship independently — the design pass then sees, for
//      each slide, what its neighbours already look like and can deliberately
//      vary instead of drifting into "every slide is a card grid."

import { db } from "@/lib/db"
import { MODELS, claudeJSON } from "../ai"
import { retrieveForCourse, formatSections } from "../retrieval"
import type { ModuleContentPlan } from "../primitives"

const MAX_REF_CHARS = 20_000

const RELATIONSHIP_GUIDE = `For each slide, name the RELATIONSHIP its facts actually have — this is what the design pass will build the visual around, so be honest about it rather than defaulting to "enumeration":
- "sequence" — stages that happen in order (a process, a lifecycle, an escalation path)
- "hierarchy" — levels of authority/oversight, one governing the one below
- "hub-and-satellites" — one central concept with several related things attached to it
- "comparison" — two (rarely three) things being weighed against each other
- "cause-effect" — one condition leading to a consequence
- "escalation" — severity/magnitude increasing across steps (pair with "sequence" framing when it's also ordered)
- "cumulative" — several factors combining/stacking into one outcome
- "single-statement" — one idea worth landing on its own, not a list of facts
- "enumeration" — genuinely just a set of facts with no inherent order or relation (the correct answer for plain reference material — don't force a diagram onto content that is honestly just a list)`

export async function handleModuleContentJob(job: any): Promise<ModuleContentPlan> {
  const { course_id, module_id } = job
  const { mod } = job.input as { mod: any }

  const { data: course } = await db.from("cg_courses").select("*").eq("id", course_id).single()
  if (!course) throw new Error("Course not found")

  const { data: refs } = await db
    .from("cg_reference_materials")
    .select("file_name, extracted_text")
    .eq("course_id", course_id)
  const readable = (refs ?? []).filter(r => r.extracted_text)
  const perRef = readable.length ? Math.floor(MAX_REF_CHARS / readable.length) : 0
  const legacyBlock = readable
    .map(r => `### ${r.file_name}\n${(r.extracted_text as string).slice(0, perRef)}`)
    .join("\n\n")

  const retrieved = await retrieveForCourse({
    courseId: course_id,
    query: [mod.title, ...mod.slides.flatMap((s: any) => [s.title, s.intent, ...(s.key_points ?? []), ...(s.covers ?? [])])]
      .filter(Boolean).join(" "),
    limit: 20,
    maxChars: MAX_REF_CHARS,
  })
  const refBlock = [formatSections(retrieved), legacyBlock].filter(Boolean).join("\n\n")

  const slideLines = mod.slides.map((s: any, i: number) =>
    `${i + 1}. "${s.title}" (${s.layout_kind}) — intent: ${s.intent}\n   key points: ${JSON.stringify(s.key_points ?? [])}${s.covers?.length ? `\n   required coverage: ${JSON.stringify(s.covers)}` : ""}`
  ).join("\n")

  const prompt = `You are the Research/Content stage of ICS Aviation's course generator — you gather and write the real material for a module BEFORE anyone thinks about how it will look. Your only job here is substance: facts, precision, citations. Design happens in a separate pass that hasn't run yet.

## Course
Title: ${course.title}
Regulatory framework: ${course.regulatory_framework ?? "none specified"}
Audience: ${course.target_audience ?? "aviation professionals"}
Language: ${course.language === "ar" ? "Arabic" : "English"}

## Module: "${mod.title}" (module ${mod.module_number})
Slides to write:
${slideLines}

${refBlock ? `## Reference material (ground every claim in this; cite where used)\n${refBlock}\n` : ""}

## What to produce, per slide
- "facts": the actual substantive points this slide must convey — precise, factual, aviation-professional register. Write real content, not placeholders. Cover every key point and every required-coverage line (reproduce bracketed reference codes verbatim).
- "relationship": how these facts relate to EACH OTHER.
${RELATIONSHIP_GUIDE}
- "citations": clause + document for every factual claim that comes from the reference material. Use the clause number the material actually shows — never invent one.
- "data": OPTIONAL. If this slide's material contains quantities that are genuinely comparable TO EACH OTHER — several durations, several counts, a set of percentages, a before/after pair — pull them out as {label, value, unit} so the design pass can show them as a chart or meter rather than burying them in a sentence. Omit the field entirely otherwise. Do NOT invent numbers to fill it, do not convert a single lone figure into a one-item series (that is a stat, not a chart), and do not list quantities that measure different things and therefore cannot sit on one axis.

- "role": the job this slide does in the module's ARGUMENT. Assigned across the whole module at once, like emphasis, because a throughline is a property of the sequence and not of any one slide.
    · "setup" — establishes the frame, the problem, or why the rest matters. Usually early, usually few elements.
    · "evidence" — the substance that proves or specifies the case: the figures, the bands, the requirements, the procedure. Most slides are this.
    · "turn" — where the understanding changes: the consequence of getting it wrong, the constraint that reframes everything before it, the point the module is actually FOR. At most two per module, often exactly one.
    · "consequence" — what follows from the turn in practice: what someone must now do, check or provision.
    · "reference" — a lookup a learner returns to rather than reads through. Honest to label a table this rather than dressing it up as an argument.
  A module that is entirely "evidence" is a reference document, not a lesson: it states things correctly and builds to nothing. If nothing here genuinely turns, say so by not marking one — do not promote an ordinary slide to make the shape look right.
- "emphasis": this slide's weight in the MODULE, decided across the whole module at once — this is the one judgement no individual slide can make about itself.
  You are looking at every slide in this module together, which is exactly why you assign this here. Ask which one or two slides carry the idea a learner should still have a week later: the point everything else supports, the figure that reframes the topic, the consequence that makes the rest matter. Those are "peak". Assign "quiet" to the genuinely supporting slides — a definition, a list of references, a short bridge. Everything else is "normal".
  AT MOST TWO peaks per module, and a module of six or more slides should have at least two quiet ones. This is a budget, not a rating: if you mark everything "normal" the module reads flat, and if you mark half of it "peak" nothing stands out at all. A peak earns its prominence from the quiet slides around it.

Structural slides (cover, section_divider, closing_cta) still get a "relationship" of "single-statement", minimal facts (just the title's substance), and "emphasis":"normal".

## Output
Return ONLY valid JSON:
{
  "slides": [
    { "slide_title": "...", "facts": ["...", "..."], "relationship": "sequence|hierarchy|hub-and-satellites|comparison|cause-effect|escalation|cumulative|single-statement|enumeration", "role": "setup|evidence|turn|consequence|reference", "emphasis": "peak|normal|quiet", "citations": [{"source_doc_id":"...","excerpt":"..."}], "data": [{"label":"...","value":12,"unit":"months"}] }
  ]
}
One entry per slide listed above, in the same order.`

  // Same flat-cap bug as outline.ts's original 32k, one file over: this call
  // writes real substantive facts — "aviation-professional register... write
  // real content, not placeholders" — for EVERY slide in the module, in one
  // response. A 16k ceiling was sized for a small module and never revisited;
  // a real module with ~30 slides each carrying several written facts plus
  // citations, role and emphasis blows past it before finishing, and that is
  // exactly what happened on "Data Collection & Sources" (16000 tokens, still
  // unfinished). Budgeted from the actual slide count for this module rather
  // than guessed, floored at the old 16k so small modules see no change.
  const maxTokens = Math.min(64_000, Math.max(16_000, 2_000 + mod.slides.length * 550))

  const result = await claudeJSON({
    model: MODELS.slide_content,
    prompt,
    maxTokens,
    label: `Module content gather "${mod.title}"`,
  })

  if (!Array.isArray(result?.slides) || result.slides.length === 0)
    throw new Error(`Module content gather for "${mod.title}" came back without slides`)

  enforceEmphasisBudget(result.slides)
  return result as ModuleContentPlan
}

/** At most this many slides per module may be the emphatic ones. */
const MAX_PEAKS = 2
/** And at most this many may be the point the module turns on. */
const MAX_TURNS = 2
const ROLES = new Set(["setup", "evidence", "turn", "consequence", "reference"])

/**
 * A budget, held in code rather than trusted to the prompt.
 *
 * "At most two peaks" is the kind of instruction a model agrees with and then
 * drifts past on a long module — and the failure is silent and total: mark six
 * slides emphatic and the module reads exactly as flat as marking none, since
 * emphasis is entirely relative. Extra peaks are demoted from the END, keeping
 * the earliest-chosen ones, on the reasoning that a module's first-nominated
 * peaks are its most considered.
 */
function enforceEmphasisBudget(slides: { emphasis?: string; role?: string }[]): void {
  let kept = 0
  let turns = 0
  for (const s of slides) {
    if (s.emphasis !== "peak" && s.emphasis !== "quiet") s.emphasis = "normal"
    if (s.emphasis === "peak" && ++kept > MAX_PEAKS) s.emphasis = "normal"

    // An unrecognised role is dropped rather than coerced: guessing "evidence"
    // would state something about the slide that nothing established, and the
    // design agent is better off with no guidance than with invented guidance.
    if (!s.role || !ROLES.has(s.role)) { delete s.role; continue }
    // Everything cannot be the turning point, for the same reason everything
    // cannot be the peak — the label only means anything by contrast.
    if (s.role === "turn" && ++turns > MAX_TURNS) s.role = "evidence"
  }
}
