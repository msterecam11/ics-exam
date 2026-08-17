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

export async function handleModuleContentJob(
  job: any,
  /** Reports which chunk is in flight, so a multi-minute gather shows movement
   *  instead of one frozen line for its whole duration. */
  onProgress?: (step: string) => Promise<void>,
): Promise<ModuleContentPlan> {
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

  // ── Why this is chunked ────────────────────────────────────────────────
  // This call writes real substantive facts for every slide it is asked
  // about, in ONE response. For a 5-slide module that is a small generation.
  // For a 30-slide module it is ~18k tokens in a single uninterruptible
  // request: many minutes long, the likeliest thing in the pipeline to time
  // out, and it loses the ENTIRE module's research when it does. The RAC
  // course stalled here for ten minutes on exactly that, and raising the
  // token cap only made the call bigger.
  //
  // Splitting it fixes the cost profile without changing the architecture:
  // the gather still finishes completely before any slide is designed, and
  // every chunk is still shown the WHOLE module, because "emphasis" and
  // "role" are explicitly judgements across the module rather than about one
  // slide — chunking without that context would quietly break both.
  const CHUNK_SIZE = 8

  const describe = (s: any, i: number) =>
    `${i + 1}. "${s.title}" (${s.layout_kind}) — intent: ${s.intent}\n   key points: ${JSON.stringify(s.key_points ?? [])}${s.covers?.length ? `\n   required coverage: ${JSON.stringify(s.covers)}` : ""}`

  const allSlideLines = mod.slides.map(describe).join("\n")
  const chunks: { from: number; to: number }[] = []
  for (let i = 0; i < mod.slides.length; i += CHUNK_SIZE) {
    chunks.push({ from: i, to: Math.min(i + CHUNK_SIZE, mod.slides.length) })
  }

  const gathered: any[] = []
  for (const { from, to } of chunks) {
    const single = chunks.length === 1
    await onProgress?.(single
      ? "gathering module content"
      : `gathering module content — ${to} of ${mod.slides.length} slides`)

    const slideLines = single
      ? allSlideLines
      : `## The full module, for context — judge "emphasis" and "role" against ALL of it
${allSlideLines}

## Write output for slides ${from + 1}-${to} ONLY
${mod.slides.slice(from, to).map((s: any, i: number) => describe(s, from + i)).join("\n")}`

  const prompt = `You are the Research/Content stage of ICS Aviation's course generator — you gather and write the real material for a module BEFORE anyone thinks about how it will look. Your only job here is substance: facts, precision, citations. Design happens in a separate pass that hasn't run yet.

## Course
Title: ${course.title}
Regulatory framework: ${course.regulatory_framework ?? "none specified"}
Audience: ${course.target_audience ?? "aviation professionals"}
Language: ${course.language === "ar" ? "Arabic" : "English"}

## Module: "${mod.title}" (module ${mod.module_number})
Slides to write:
${slideLines}

${refBlock
  ? `## Reference material (ground every claim in this; cite where used)\n${refBlock}\n`
  // With no documents attached this section used to be silently omitted, which
  // left "cite the clause the material shows" governing a module that had no
  // material at all — so the model cited from memory instead. A real course
  // generated this way produced 34 citations and a regulation number
  // ("GACA CAR 139.373") that does not exist in any attached source. For a
  // compliance audience an invented clause number is the worst possible
  // defect, so the absence of sources is now stated rather than implied.
  : `## NO REFERENCE MATERIAL IS ATTACHED TO THIS COURSE
You have no source documents for this module. That changes what you may write:
- Return "citations": [] on EVERY slide. Do not cite anything.
- Never state a specific regulation, clause, section, paragraph or standard NUMBER (e.g. "GACAR 139.373", "Annex 14 §3.9.2", "IATA AHM 913"). You cannot verify one without the document, and a wrong number is worse than none.
- You MAY name a framework or authority in general terms where it is genuinely well established ("GACA", "ICAO Annex 14", "an aerodrome SMS") — but attach no number to it and do not quote it.
- Write the substance from established professional practice, and prefer describing the OBLIGATION ("operators must record every defect before the unit returns to service") over pinning it to a citation you cannot check.
`}

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

- "visual": the MEDIUM this slide should lean on. Assigned across the whole module at once, for the same reason as emphasis — no individual slide can judge the module's variety from inside itself, and when every slide picks independently they all pick the same safe answer. This is not a restatement of "relationship": a sequence can be a numbered diagram OR a photograph of that sequence happening, and this is where you choose which.
    · "image-led" — the slide's subject has a real physical setting and a photograph of it teaches more than a box of text would. An inspection walk, a control room, equipment on a ramp, people in a briefing. Never for an abstraction.
    · "data" — the slide's point IS its numbers. Requires a populated "data" array; do not mark this without one.
    · "diagram" — the relationship between the parts is the point: a sequence, a hierarchy, a hub, an escalation.
    · "statement" — one sentence carries the slide. A definition that must land exactly, a consequence, a rule. Very few elements, very large type.
    · "reference-table" — lookup material a learner returns to. Rows and columns, honestly labelled as such.
  DISTRIBUTE THESE. A module where every slide is "diagram" reads as templated no matter how well each slide is built — that is the single most common failure of this system. Across a module of six or more content slides, use at least THREE different registers, and aim for roughly a third of the content slides to be "image-led" where the subject genuinely supports a photograph. If a slide has no clearly right register, omit the field rather than guessing.

Structural slides (cover, section_divider, closing_cta) still get a "relationship" of "single-statement", minimal facts (just the title's substance), and "emphasis":"normal".

## Output
Return ONLY valid JSON:
{
  "slides": [
    { "slide_title": "...", "facts": ["...", "..."], "relationship": "sequence|hierarchy|hub-and-satellites|comparison|cause-effect|escalation|cumulative|single-statement|enumeration", "role": "setup|evidence|turn|consequence|reference", "emphasis": "peak|normal|quiet", "visual": "image-led|data|diagram|statement|reference-table", "citations": [{"source_doc_id":"...","excerpt":"..."}], "data": [{"label":"...","value":12,"unit":"months"}] }
  ]
}
${chunks.length === 1
  ? "One entry per slide listed above, in the same order."
  : `Return EXACTLY ${to - from} entries — one for each of slides ${from + 1}-${to}, in that order. Do not write entries for the other slides; they are shown only so you can judge emphasis and role across the whole module.`}`

    // max_tokens is a CEILING, not a budget. You are billed on tokens actually
    // generated, so setting it high costs nothing and setting it low fails the
    // whole job — I got this backwards three times running, tuning it downward
    // as if it were a spend.
    //
    // The 550/slide estimate was also measuring the wrong thing. `output_tokens`
    // INCLUDES thinking, and reasoning about ten slides of aviation research
    // (plus judging emphasis and role across the whole module) is thousands of
    // tokens before a single character of JSON is emitted. A 10-slide chunk
    // died at 7500 with the answer unfinished for exactly that reason.
    //
    // So: a flat, generous allowance for thinking, plus real headroom per
    // slide. Overshooting is free; undershooting is another failed run.
    const THINKING_HEADROOM = 10_000
    const maxTokens = Math.min(32_000, THINKING_HEADROOM + (to - from) * 1_400)

    const result = await claudeJSON({
      model: MODELS.slide_content,
      prompt,
      maxTokens,
      label: `Module content gather "${mod.title}"${chunks.length > 1 ? ` (slides ${from + 1}-${to})` : ""}`,
    })

    if (!Array.isArray(result?.slides) || result.slides.length === 0)
      throw new Error(`Module content gather for "${mod.title}" returned nothing for slides ${from + 1}-${to}`)

    gathered.push(...result.slides)
  }

  // A chunk returning the wrong count would silently misalign every later
  // slide's facts against its title — content that looks written but belongs
  // to a different slide. Caught here rather than discovered as mysteriously
  // wrong material somewhere downstream.
  if (gathered.length !== mod.slides.length) {
    throw new Error(
      `Module content gather for "${mod.title}" returned ${gathered.length} entries for ${mod.slides.length} slides`
    )
  }

  // Budgets apply to the MERGED module: two peaks per module means two in
  // total, not two in every batch of ten.
  enforceEmphasisBudget(gathered)
  // Runs on the merged array, never per chunk — a per-chunk cap would let each
  // chunk fill its own quota with the same register and defeat the point.
  enforceVisualBudget(gathered)
  return { slides: gathered } as ModuleContentPlan
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
const VISUAL_REGISTERS = new Set(["image-led", "data", "diagram", "statement", "reference-table"])

/**
 * Caps how much of a module may share one visual register.
 *
 * "Distribute these" is exactly the kind of instruction that survives three
 * slides and then collapses — and the collapse is invisible per slide, because
 * every individual choice looks defensible. It is only wrong in aggregate,
 * which is precisely what no single slide can see. The real 46-slide course
 * came out 24% one shape for this reason.
 *
 * Over-quota registers are UNSET rather than reassigned: relabelling a table as
 * a "statement" would order the design agent to do something the content
 * cannot support, whereas removing the steer just returns that slide to
 * judging for itself. Same reasoning as the unrecognised-role case below.
 */
function enforceVisualBudget(slides: { visual?: string }[]): void {
  const eligible = slides.filter(s => s.visual && VISUAL_REGISTERS.has(s.visual))
  const cap = Math.max(2, Math.ceil(eligible.length * 0.45))
  const seen: Record<string, number> = {}
  for (const s of slides) {
    if (!s.visual || !VISUAL_REGISTERS.has(s.visual)) { delete s.visual; continue }
    seen[s.visual] = (seen[s.visual] ?? 0) + 1
    if (seen[s.visual] > cap) delete s.visual
  }
}

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
