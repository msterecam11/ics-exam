// Slide Content job — the Content Agent's per-slide pass, and the single
// biggest quality lever in the system. One focused call per slide (never a
// batch), producing BOTH the semantic content and the structural blueprint,
// because "what to say" and "what shape it takes" are one judgment.
//
// The tier ladder is enforced here in the prompt:
//   Tier 1  exemplar fast-path for classic shapes
//   Tier 2  free composition from primitives (default)
//   Tier 3  gated `custom` node — must justify, gets stricter QA

import { db } from "@/lib/db"
import { MODELS, claudeJSON } from "../ai"
import { exemplarPromptBlock } from "../exemplars"
import { iconPromptBlock } from "../icons"
import { retrieveForCourse, formatSections } from "../retrieval"
import type { SlideSourceContent } from "../primitives"

const MAX_REF_CHARS = 14_000

const PRIMITIVE_REFERENCE = `
Containers:  { "type":"row", "gap":"md", "weights":[2,3], "children":[…] }   horizontal split; weights are relative widths
             { "type":"stack", "gap":"md", "children":[…] }                  vertical flow
Content:
  { "type":"heading", "text":"…", "level":4, "color":"token:accent-warm", "icon":"strategy", "accentBar":true }
  { "type":"body", "text":"…" }  OR  { "type":"body", "text":[{"text":"Plain "},{"text":"bold bit","bold":true}] }
  { "type":"bullets", "items":["…","…"] }
  { "type":"card", "tone":"plain|cream|glass|accent", "accent":"token:primary", "children":[…] }
  { "type":"badge-number", "n":"01", "variant":"navy|band-warm|band-blue", "heading":"…" }
  { "type":"callout", "tone":"requirement|definition|impact|note", "label":"DEF:", "text":"…" }
  { "type":"icon-row", "icon":"shield-check", "text":"…", "accent":"token:success" }
  { "type":"alternating-list", "items":[{"text":"…","icon":"check"}] }
  { "type":"question-rows", "questions":["…","…"] }
  { "type":"stat", "value":"5 years", "label":"validity period" }
  { "type":"figure", "media":{"want":"photo","subject":"…","purpose":"…"}, "caption":"FIG 2.1: …", "shadow":true }
  { "type":"table", "headerRow":true, "rows":[{"cells":[{"text":"…"},{"text":"…"}]}] }
  { "type":"chart", "chartType":"bar|line|donut", "data":{"labels":["…"],"datasets":[{"label":"…","data":[1,2]}]} }
  { "type":"comparison", "columns":[{"heading":"CERTIFICATION","icon":"airplane-takeoff","accent":"token:accent-warm","children":[…]}] }
Tier 3 only:
  { "type":"custom", "justification":"why no primitive fits", "aspect":2.5,
    "children":[{"kind":"shape|line|text|icon","x":0,"y":40,"width":100,"height":4,"props":{…}}] }
    — x/y/width/height are % of THIS node's own box (never the slide).

Colour tokens: token:primary, token:primary-dark, token:primary-light, token:navy,
token:accent-warm, token:danger, token:success, token:tab-yellow, token:text, token:text-inverse.`

const ICON_REFERENCE = `Use ONLY these icon names — anything else renders as a blank marker, exactly
like an invented clause number. Pick by meaning, not by keyword: an icon should
say something the text doesn't already say. A slide with two or three
well-chosen icons reads better than one where every line carries a glyph.

${iconPromptBlock()}`

// Depth and finish. These effects have always rendered; the agent was simply
// never told they existed, so every generated slide was flat. Exposed with
// house rules rather than as a menu — an effects list without a "when" turns
// into decoration, and decoration is what makes a deck look amateur.
const EFFECTS_REFERENCE = `Any element node may carry "effects":
  "effects": { "shadow": "sm|md|lg|glow", "gradient": {"from":"token:primary","to":"token:primary-dark","angle":135},
               "blur": 12, "textShadow": "soft|strong", "opacity": 0.9 }

When to reach for them:
- shadow — lifts a card off the background to signal "this is the focal object".
  Use ONE elevation level per slide; mixing sm, md and lg on the same slide
  reads as inconsistent rather than layered. Cards and figures only.
- gradient — a cover, a section divider, or a single hero stat. Never behind
  running text: it costs contrast for decoration.
- blur — only on a "glass" card sitting over a dark or photographic
  background, which is what it is for. It does nothing over flat white.
- textShadow — only for text placed over a photo, to keep it readable.
- NEVER put shadow or gradient on a chart or table. It obscures the data,
  which is the one thing that slide exists to communicate.

Default to flat. Depth should mark the one thing that matters on the slide.`

// Composition rules, not taste. Each of these is a failure mode that shows up
// in generated decks and is cheap to state up front.
const DESIGN_PRINCIPLES = `- ONE focal point per slide. Decide what the viewer should look at first and
  make it clearly largest / heaviest / most contrasted. If everything is
  emphasised, nothing is.
- Build hierarchy with SIZE, WEIGHT and SPACE — not colour alone. Colour is
  the weakest signal and the first thing lost in print or projection.
- Use whitespace to group. Related items sit close; unrelated items are
  separated by a full gap. Even spacing everywhere reads as a list, not a
  structure.
- Keep a line of body text roughly 60-75 characters. Wider is tiring to read
  across a projected slide; much narrower fragments the sentence.
- Prefer wrapping to truncation. If text does not fit, cut words rather than
  letting the layout clip them.
- Font weight carries meaning: 700-800 headings, 500 labels/eyebrows, 400
  body. Do not bold whole paragraphs for emphasis.
- Match chart type to the question: trend over time -> line; comparison
  between categories -> bar; parts of a whole (5 or fewer) -> donut. More than
  a handful of categories is a bar chart, never a donut.`

export async function handleSlideContentJob(job: any): Promise<SlideSourceContent> {
  const { course_id, module_id } = job
  const {
    slide,            // outline entry: { title, layout_kind, intent, key_points }
    module_title,
    module_number,
    slide_index,
    slide_total,
    previous_titles,  // titles already generated in this module (avoid repetition)
    retry_feedback,   // set when QA bounced this slide back
  } = job.input ?? {}

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

  // Retrieved per SLIDE, so each slide sees the clauses relevant to its own
  // subject instead of the same generic opening pages of every document.
  const retrieved = await retrieveForCourse({
    courseId: course_id,
    query: [slide.title, slide.intent, ...(slide.key_points ?? []), ...(slide.covers ?? []), module_title]
      .filter(Boolean).join(" "),
    limit: 8,
    maxChars: MAX_REF_CHARS,
  })
  const refBlock = [formatSections(retrieved), legacyBlock].filter(Boolean).join("\n\n")

  const isStructural = ["cover", "section_divider", "closing_cta"].includes(slide.layout_kind)

  // The syllabus points the outline assigned to THIS slide. Passed verbatim so
  // reference markers like [MR4.1] survive into the finished slide text.
  const covers: string[] = Array.isArray(slide.covers) ? slide.covers : []
  const coversBlock = covers.length
    ? `REQUIRED COVERAGE this slide must deliver (from the client's syllabus — keep any [MR..] reference markers verbatim):\n${covers.map(c => `  - ${c}`).join("\n")}`
    : ""

  const prompt = `You are the Content Agent for ICS Aviation's course generator. Write ONE slide of a professional aviation training course, and design the structure of its content area.

## Course
Title: ${course.title}
Regulatory framework: ${course.regulatory_framework ?? "none specified"}
Audience: ${course.target_audience ?? "aviation professionals"}
Tone: ${course.tone ?? "corporate/formal"}
Language: ${course.language === "ar" ? "Arabic" : "English"}

## This slide
Module ${module_number}: "${module_title}"  (slide ${slide_index + 1} of ${slide_total})
Planned title: "${slide.title}"
Planned intent: ${slide.intent}
Layout master: ${slide.layout_kind}
Key points to cover: ${JSON.stringify(slide.key_points ?? [])}
${coversBlock}
${previous_titles?.length ? `Already covered in this module (do NOT repeat): ${JSON.stringify(previous_titles)}` : ""}
${retry_feedback ? `\n## FIX REQUIRED (previous attempt failed quality review)\n${retry_feedback}\nProduce less text and/or a simpler structure so everything fits comfortably.` : ""}

${refBlock ? `## Reference material (ground every factual claim in this; cite where used)\n${refBlock}\n` : ""}

## How to design the content area
The slide's frame — logo, title position, footer, background — is FIXED by the master. You design only what goes INSIDE the content area, and you do it by composing a structural tree. You never specify coordinates (except inside a Tier-3 custom node).

Choose the structure that genuinely fits this slide's content:
- **Tier 1** — if the content matches one of the house patterns below, follow that pattern's shape.
- **Tier 2** (default) — compose the primitives freely into whatever arrangement the content actually wants.
- **Tier 3** — only if NO combination of primitives can express it (a real timeline, a flow diagram with connectors, a hero treatment): use a "custom" node and fill in "justification". Prefer Tier 1/2; Tier 3 is rare.

Vary structure across the module — consecutive slides must not look identical.

### House patterns (from real ICS decks)
${exemplarPromptBlock()}

### Primitive reference
${PRIMITIVE_REFERENCE}

### Icon vocabulary
${ICON_REFERENCE}

### Depth and effects
${EFFECTS_REFERENCE}

### Composition principles
${DESIGN_PRINCIPLES}

## Content rules
- Aviation-professional register; precise, factual, no filler or marketing language.
- Fit the slide: roughly 40-90 words of body text total. Long paragraphs break the layout — split into cards/columns/bullets instead.
- Cite precisely: the reference sections carry their clause and page (e.g. "GACAR Part-139 · 139.15 · p.42"). Use the clause number the material actually shows. NEVER invent or guess a clause number — if the material does not give one, describe the requirement without a citation.
- Use a figure/photo only when it genuinely aids understanding, at most one per slide.
- Flag "sensitive": true when the slide covers safety-critical, medical, legal, or regulatory-compliance content (its imagery then gets human review).
${isStructural ? `- This is a ${slide.layout_kind} slide: keep it minimal — a strong title${slide.layout_kind === "cover" ? " and a short subtitle" : ""}, and either no blueprint at all or a very light one.` : ""}

## Output
Return ONLY valid JSON:
{
  "intent": "${slide.intent}",
  "layout_kind": "${slide.layout_kind}",
  "title": "final slide title",
  ${slide.layout_kind === "cover" ? `"subtitle": "short subtitle",` : ""}
  "blueprint": { …structural tree, or null for a bare structural slide… },
  "sensitive": false,
  "citations": [{ "source_doc_id": "file name it came from", "excerpt": "short supporting quote" }]
}`

  const result = await claudeJSON({
    model: MODELS.slide_content,
    prompt,
    maxTokens: 16_000,
    label: `Slide "${slide.title}"`,
  })

  if (!result?.title) throw new Error("Slide content came back without a title")
  result.layout_kind = slide.layout_kind
  if (!result.intent) result.intent = slide.intent

  return result as SlideSourceContent
}
