// Slide Design job — the Design Agent's per-slide pass.
//
// This used to also write the slide's substance; it no longer does. The
// module content-gather pass (moduleContent.ts) writes the facts for every
// slide in the module BEFORE this runs, so this agent's only job is the one
// a real presentation designer actually does: look at finished material and
// decide the most honest way to show it. That split matters — a model
// writing facts and composing a layout in the same breath reaches for
// whatever's easiest to hold in its head at once, which is always a card or
// a bullet list. Given material that already exists, it can reason about
// what SHAPE that material actually has.
//
// The tier ladder still exists, but not as a restriction:
//   Tier 1  exemplar fast-path for classic shapes
//   Tier 2  free composition from primitives
//   Tier 3  gated `custom` node for anything primitives + relationship
//           shapes still can't express — a normal tool, not a last resort.

import { MODELS, claudeJSON, claudeVisionJSON } from "../ai"
import { exemplarPromptBlock } from "../exemplars"
import { iconPromptBlock } from "../icons"
import type { SlideContentPlan, SlideSourceContent } from "../primitives"

const PRIMITIVE_REFERENCE = `Containers:  { "type":"row", "gap":"md", "weights":[2,3], "children":[…] }   horizontal split; weights are relative widths
             { "type":"stack", "gap":"md", "children":[…] }                  vertical flow
"weights" is not limited to even splits. [1,3], [3,7], [2,5] are all real
compositions — a narrow sidebar rail beside a wide main column, a small
supporting figure beside dominant text. Reach for an asymmetric split when
one side genuinely carries more weight than the other; [1,1] every time is
its own kind of sameness.
Fact/enumeration primitives (right when the content really is a plain list):
  { "type":"heading", "text":"…", "level":4, "color":"token:accent-warm", "icon":"strategy", "accentBar":true, "eyebrow":"GOVERNANCE" }
    "level" 1-5 spans the whole type scale — 60 / 50 / 40 / 30 / 25px. It is the main size lever you have, so
    use its range: a slide where every heading is level 4 has no hierarchy, whatever else is on it. Level 1-2
    is for the ONE line a slide is built around, not for section labels.
  { "type":"body", "text":"…", "size":"lead|body|caption" }  OR  { "type":"body", "text":[{"text":"Plain "},{"text":"bold bit","bold":true},{"text":"the one phrase to spot at a glance","highlight":"token:tab-yellow"}] }
    size "lead" is a standfirst: ONE larger opening line that frames everything beneath it, the way a subtitle
    does. At most one per slide, and only where the slide genuinely opens with a framing statement instead of
    diving straight in. "caption" is the small note under a figure or table. Omit it for ordinary running text.
  { "type":"bullets", "items":["…","…"] }
  { "type":"card", "tone":"plain|cream|glass|accent", "accent":"token:primary", "children":[…] }
  { "type":"badge-number", "n":"01", "variant":"navy|band-warm|band-blue", "heading":"…" }
  { "type":"callout", "tone":"requirement|definition|impact|note", "label":"DEF:", "text":"…" }
  { "type":"icon-row", "icon":"shield-check", "text":"…", "accent":"token:success" }
  { "type":"icon-tile", "icon":"shield-check", "heading":"…", "body":"…", "accent":"token:primary" }  solid accent square + white glyph, then heading and body — put 3-4 in a row for a card grid with real visual anchors
  { "type":"alternating-list", "items":[{"text":"…","icon":"check"}] }
  { "type":"question-rows", "questions":["…","…"] }
  { "type":"stat", "value":"5 years", "label":"validity period", "size":"normal|hero" }
  { "type":"figure", "media":{"want":"photo","subject":"…","purpose":"…"}, "caption":"FIG 2.1: …", "shadow":true, "mask":"none|circle|rounded|squircle" }  mask crops the photo — "circle" turns a stock shot into a deliberate portrait/vignette
  { "type":"table", "headerRow":true, "rows":[{"cells":[{"text":"…"},{"text":"…"}]}] }
  { "type":"chart", "chartType":"bar|line|donut", "unit":"m", "xTitle":"…", "yTitle":"…", "data":{"labels":["…"],"datasets":[{"label":"…","data":[1,2]}]} }
    ALWAYS set "unit" when the numbers have one — it is what tells the reader whether a bar means metres,
    minutes or per cent, and the gathered material already carries it. The renderer appends "(unit)" onto
    the axis title FOR you — xTitle/yTitle must name what the axis IS ("Runway Occupancy Time") and NEVER
    already contain the unit or its own parentheses, or it prints doubled ("Runway Occupancy Time (s) (s)").
    Axis titles name what each axis IS; skip one only when its own labels already say so. At most 5 series:
    past that colour identifies nothing.
  { "type":"meter", "items":[{"label":"…","value":72,"max":100,"caption":"72%","accent":"token:primary"}] }  labelled proportion bars — "how far along / how much of the whole"
  { "type":"comparison", "columns":[{"heading":"CERTIFICATION","icon":"airplane-takeoff","accent":"token:accent-warm","children":[…]}] }
Relationship primitives (reach for these when the relationship IS the content — see the reasoning step below):
  { "type":"flow", "direction":"horizontal|vertical", "escalate":false, "marker":"text|circle", "steps":[{"n":"01","heading":"…","body":"…","icon":"…"}] }
  { "type":"radial", "hub":{"heading":"…","icon":"…"}, "spokes":[{"heading":"…","body":"…","icon":"…"}] }
  { "type":"tiers", "bands":[{"heading":"…","items":["…","…"],"tone":"token:navy"}] }
  { "type":"quote-banner", "text":"…", "attribution":"…" }
  { "type":"band", "text":"…", "icon":"…" } — full-bleed single-line strip, e.g. a takeaway pinned under the rest of the content
  { "type":"stat-equation", "terms":[{"label":"…","sublabel":"…"}], "result":{"label":"…","sublabel":"…"} }
  { "type":"tag-list", "items":[{"label":"…","tag":"LEADING","tone":"success|warning|danger|neutral"}] }
    "tag" is REQUIRED and must be a real per-item status/category word ("REQUIRED", "GAP", "ON TRACK") — every item needs one that actually differs in meaning from its neighbours.
    If the items are just a plain enumeration with nothing per-item to tag (a list of technique names, checklist items with no individual status), use "bullets" instead — do not invent a filler tag just to satisfy the shape.
Tier 3 — for anything none of the above can express (a real timeline, a diagram with non-standard connectors, a hero treatment). Equally valid to reach for; not a last resort:
  { "type":"custom", "justification":"why nothing else fits", "aspect":2.5,
    "children":[{"kind":"shape|line|text|icon","x":0,"y":40,"width":100,"height":4,"props":{…}}] }
    — x/y/width/height are % of THIS node's own box (never the slide).
    THE ONLY props each kind reads — anything else is silently dropped, so do not invent others:
      shape: "fill" (token), "radius" (number), "dashed" (boolean, dashed fill pattern)
      line:  "stroke" (token), "dashed" (boolean), "arrow" ("none"|"end"|"start"|"both")
             An arrow turns a rule into a CONNECTOR, which is what makes a real diagram possible:
             a timeline with direction, a process chain, a feedback loop, one box leading to another.
             Direction follows the box you give it — wider than tall points right, taller than wide
             points down. This is the piece that was missing when a "custom" composition could place
             boxes but never say which one leads to which.
      text:  "text" (string), "fontSize" (number), "color" (token), "align" ("left"|"center"|"right"), "rotate" (degrees)
      icon:  "name" (from the icon vocabulary below), "color" (token), "rotate" (degrees)
    "rotate" works on shape/icon/text (not line); a line takes "arrow" instead.
    For a connector that runs along a horizontal or vertical axis use a line with
    "arrow" — it is the real thing and stays crisp at any size. Reserve a rotated
    "arrow-right" icon for a diagonal cue, which a line cannot express.
    Two labels must not land in overlapping x/y/width/height boxes — check the
    numbers against each other before finalizing, the way you'd eyeball a real
    layout before shipping it.

Colour tokens: token:primary, token:primary-dark, token:primary-light, token:navy,
token:accent-warm, token:danger, token:success, token:tab-yellow, token:text, token:text-inverse.`

/**
 * The palette, with real values.
 *
 * The agent used to receive token NAMES only — it was choosing colours from a
 * list of words with no idea what any of them looked like, and was never told
 * whether the slide it was designing had a dark background. That is exactly
 * how dark navy headings ended up on the dark blue summary master, invisible.
 * Showing the actual hex, plus stating the background outright, is the fix.
 */
function paletteBlock(tokens: any, dark: boolean): string {
  const c = tokens?.colors ?? {}
  const swatch = (name: string) => (c[name] ? `  token:${name} = ${c[name]}` : null)
  const list = [
    "primary", "primary-dark", "primary-light", "navy", "accent-warm",
    "danger", "success", "tab-yellow", "text", "text-inverse",
    "surface", "surface-alt", "surface-cream", "border-subtle",
  ].map(swatch).filter(Boolean).join("\n")

  const contrast = dark
    ? `THIS SLIDE HAS A DARK BACKGROUND (deep blue).
- Body text, headings and labels MUST use token:text-inverse. token:text and token:navy are near-black and will be invisible here.
- For accents pick only the LIGHT end of the palette — token:primary-light, token:tab-yellow, token:success — never token:navy or token:primary-dark.
- Cards on this master should use "tone":"glass" (translucent white), not "plain" or "cream".`
    : `THIS SLIDE HAS A LIGHT BACKGROUND (white or pale blue).
- Body text uses token:text; headings token:navy or the module accent.
- token:text-inverse is white — use it ONLY as text sitting on a filled dark shape (a navy band, a coloured flow step), never on the slide background itself.`

  return `${list}\n\n${contrast}`
}

const STYLE_REFERENCE = `card, callout, flow, radial, tiers and quote-banner each accept an optional "style":
  "style": { "corner":"sharp|soft|round|pill", "fill":"plain|filled|tinted|outline|glass|gradient",
             "elevation":"flat|raised|lifted|inset|ring", "density":"tight|normal|airy",
             "accent":"token:…", "intensityRamp":true }

This is what stops every slide looking the same. Two slides that both use
"flow" should not be visually identical — pick treatments that suit THIS
content, not the same defaults every time.

How to choose, honestly:
- fill "plain" — the neutral default; right when the content is the point and the container shouldn't compete.
- fill "tinted" — a soft wash of the accent. Good for grouping related items without shouting.
- fill "outline" — structure with no weight. Good when several items sit together and a filled block each would be heavy.
- fill "filled" — a solid accent block. Reserve for the ONE thing that should be read first.
- fill "gradient" — depth on a hero element: a quote-banner, a single closing statement. Never on a row of six cards.
- fill "glass" — translucent, ONLY on a dark or photographic background. It does nothing on white.
- elevation — ONE level per slide. "lifted" marks a focal object; "raised" is a gentle lift; "inset" recesses a
  supporting panel; "ring" haloes a single element. Mixing levels on one slide reads as inconsistent, not layered.
- corner — "sharp" reads formal and technical, "round" friendly, "pill" light, "notched" (a cut top-right corner)
  a deliberate, slightly technical accent — use it sparingly, on the one card that should look distinct, not
  every card on a slide. Keep corner style consistent WITHIN a slide; vary it BETWEEN slides so the module
  doesn't feel stamped from one mould.
- flow "marker":"circle" — draws each step's number inside a solid circular badge instead of bare digits.
  Reaches for a genuinely different look than the default numbered card; use when a step sequence is the
  slide's main event, not for every flow reflexively.
- density — "airy" when there is little content and it would otherwise look stranded; "tight" when there is a lot.
  This is the main lever for filling a slide honestly instead of leaving dead space.
- intensityRamp (flow) — steps the accent's strength across the steps so a sequence reads as progression.
  Use for ordered stages. Do NOT combine with "escalate", which already ramps green→red for severity.

Three more small tools, used sparingly — each is for ONE moment per slide at most, never decoration throughout:
- heading "eyebrow" — a short letterspaced label above a heading naming its category ("GOVERNANCE"). Skip it when the heading already says that.
- stat "size":"hero" — makes a number the largest thing on the slide. Reserve for the single figure the audience should leave remembering — never more than one hero stat per slide.
- body run "highlight" — a marker wash behind one phrase in running text, for the one thing that must be found at a glance. One highlighted phrase per slide at most; a paragraph with three highlights has none.`

const ICON_REFERENCE = `Use ONLY these icon names — anything else renders as a blank marker, exactly
like an invented clause number. Pick by meaning, not by keyword: an icon should
say something the text doesn't already say.

${iconPromptBlock()}`

const EFFECTS_REFERENCE = `Any element node may carry "effects":
  "effects": { "shadow": "sm|md|lg|glow", "gradient": {"from":"token:primary","to":"token:primary-dark","angle":135},
               "blur": 12, "textShadow": "soft|strong", "opacity": 0.9 }

These are a normal part of the toolkit, not an exception to justify:
- shadow — lifts a card off the background to signal "this is the focal object."
  Use ONE elevation level per slide; mixing sm/md/lg on the same slide reads as
  inconsistent rather than layered.
- gradient — a cover, a section divider, a quote-banner, or a single hero stat.
  Not behind running text: it costs contrast for decoration.
- blur — a "glass" card over a dark or photographic background.
- textShadow — text placed over a photo, to keep it readable.
- NEVER put shadow or gradient on a chart or table — it obscures the data.
Use them where they earn their place; skip them where they wouldn't. Neither
"always flat" nor "always depth" is the goal — matching the content is.`

const RELATIONSHIP_TO_SHAPE = `The relationship named for this slide is what should choose the structure — not habit, not whichever primitive is fastest to fill in:
- "sequence" → "flow" (steps with connectors), or a numbered stack for a short 2-3 step case
- "hierarchy" → "tiers" (stacked bands, top governs bottom)
- "hub-and-satellites" → "radial" (one hub, related items around it)
- "comparison" → "comparison" primitive, or a row of two contrasted columns/cards
- "cause-effect" → "flow" (2 steps) or a "custom" connector composition if the causal link needs to be visually explicit
- "escalation" → "flow" with "escalate":true (colour ramp encodes severity), or "stat-equation" for a compounding read
- "cumulative" → "stat-equation" (terms + operators resolving to one outcome)
- "single-statement" → "quote-banner", or a large centered stat
- "enumeration" → cards, bullets, a table, or a tag-list — this is the one case where a plain list IS the honest answer; do not force a diagram onto content that has no real relationship`

export async function handleSlideContentJob(job: any): Promise<SlideSourceContent> {
  const {
    slide,             // outline entry: { title, layout_kind, intent, key_points }
    module_title,
    module_number,
    slide_index,
    slide_total,
    content_plan,       // SlideContentPlan for THIS slide, from the module gather pass
    shapes_used,        // root blueprint `type`s already used by earlier slides in this module
    module_accent,       // this module's assigned branded accent token
    tokens,              // the real theme — hex values, not just token names
    dark_background,     // whether THIS slide's master is dark
    photos_used,         // how many earlier slides in this module carry a photo
    photo_target,        // how many slides in this module SHOULD carry one
    slides_remaining,    // how many slides are left after this one
    retry_feedback,     // set when QA bounced this slide back
    render_png,         // base64 PNG of the attempt being rejected — see below
  } = job.input ?? {}

  // Cover and section_divider carry ONLY master-zone text — the real ICS
  // decks show nothing else on these (course title + fixed tagline on the
  // cover; module number + module title on the divider, nothing more). A
  // prompt instruction saying "keep it minimal" still lets a model add a
  // stray subtitle or a light blueprint; skipping the design call entirely
  // is the actual guarantee. The compiler also refuses a blueprint on these
  // masters (they have no content zone) as a second layer of defense, but
  // this is the one that keeps the door from being opened in the first place.
  if (slide.layout_kind === "cover" || slide.layout_kind === "section_divider") {
    return {
      intent: String(slide.intent),
      layout_kind: slide.layout_kind,
      title: String(slide.title),
      sensitive: false,
      citations: [],
    } as SlideSourceContent
  }

  const isStructural = ["closing_cta"].includes(slide.layout_kind)
  const plan: SlideContentPlan | undefined = content_plan

  const factsBlock = plan?.facts?.length
    ? plan.facts.map((f: string) => `  - ${f}`).join("\n")
    : "(structural slide — no substantive facts, just the title)"

  // Turns "use photos sometimes" into a decision this slide can actually
  // make. Without the module's running count, every slide independently
  // concluded its own subject was too abstract to photograph and the whole
  // deck came out with no imagery at all.
  //
  // Stated as a QUOTA, not a yes/no. The previous version flipped to "imagery
  // is established — only add another if it earns its place" as soon as one
  // figure existed anywhere in the module, which read as a stop sign and drove
  // the whole system to about one photo per module. The running gap is what
  // makes this actionable on the slide in front of you.
  const photoNote = (() => {
    if (isStructural) return ""
    const used = photos_used ?? 0
    const target = photo_target ?? 0
    const left = slides_remaining ?? 0
    const gap = target - used
    if (gap <= 0) {
      return `This module has met its imagery target (${used} of ${target}). Add another figure only if this slide genuinely calls for one.`
    }
    if (gap >= left) {
      return `IMAGERY IS BEHIND: ${used} of ${target} slides in this module carry a photograph and only ${left} slide(s) remain after this one. Unless this slide's subject is genuinely un-photographable, use a figure here.`
    }
    return `Imagery so far: ${used} of a target ${target} slides in this module, with ${left} slide(s) left after this one. Prefer a figure here if this slide's subject has any real physical setting.`
  })()

  // Emphasis is assigned once for the whole module by the gather pass, which
  // is the only stage that sees every slide at once. A slide asked about its
  // own importance in isolation always says "important", which is precisely
  // how a module of individually-reasonable slides comes out uniform.
  const emphasisNote = isStructural ? "" : ({
    peak: `\n## This slide is a PEAK of its module\nOf all the slides here, this is one of at most two carrying what a learner should still have a week from now. Give it a genuinely different visual weight from its neighbours — a hero stat, a quote-banner, a full-bleed band, a dominant figure, a level 1-2 heading. This is the slide the quiet ones around it exist to set up, so it must not look like one more content slide with slightly bolder text.`,
    quiet: `\n## This slide is a QUIET one\nIt supports the module rather than carrying it. Compose it cleanly and plainly: no hero stat, no gradient, no full-bleed band, no level 1-2 heading. Restraint here is not laziness — it is what gives this module's peak slides room to land. A deck where every slide competes has no emphasis at all.`,
    normal: `\n## Emphasis: normal\nA regular content slide. Compose it well, but leave the loudest devices — hero stats, gradients, full-bleed banners — to this module's peak slides.`,
  } as Record<string, string>)[plan?.emphasis ?? "normal"] ?? ""

  // Role answers a different question from emphasis and from relationship,
  // and the three are deliberately independent: relationship decides the
  // SHAPE, emphasis decides how LOUD, role decides what the slide is FOR.
  // A quiet slide can still be the turn; evidence is very often a table.
  const roleNote = isStructural ? "" : ({
    setup: `\n## This slide's job: SETUP\nIt frames what follows — the problem, the stakes, or why any of the rest matters. Keep it uncluttered: a setup slide crowded with detail stops setting anything up. A lead line, one strong image or a single statement usually does more here than a full grid.`,
    evidence: `\n## This slide's job: EVIDENCE\nIt specifies or proves the case — figures, bands, requirements, procedure. Density is legitimate here in a way it is not elsewhere: a table, a chart or a full comparison is the honest answer when the detail IS the point. Do not decorate it into something lighter than it is.`,
    turn: `\n## This slide's job: THE TURN\nThis is where the learner's understanding changes — the constraint that reframes everything before it, or the consequence of getting it wrong. It should not look like the slides around it. Reach for the strongest device the content honestly supports: a single statement, a hero figure, a full-bleed band, a stark comparison. This is the slide the module exists for.`,
    consequence: `\n## This slide's job: CONSEQUENCE\nWhat follows in practice — what must now be done, checked or provisioned. Concrete and actionable in tone; a checklist, an ordered flow or a tag-list of states usually fits better than prose.`,
    reference: `\n## This slide's job: REFERENCE\nSomething a learner returns to and looks up rather than reads through. A clean table or a plain structured list is the RIGHT answer here — do not dress lookup material as an argument. Legibility and scanability beat visual interest.`,
  } as Record<string, string>)[plan?.role ?? ""] ?? ""

  // The module's art direction, decided by the gather pass where every slide
  // was visible at once. Deliberately phrased as the medium already chosen for
  // this slide rather than as a suggestion — the whole point is that the choice
  // was made with knowledge this slide does not have. Absent when the gather
  // had no clear answer, in which case the agent judges for itself as before.
  const visualNote = isStructural ? "" : ({
    "image-led": `\n## This slide's medium: IMAGE-LED\nThe module's art direction assigns a photograph to this slide, because its subject has a real physical setting and seeing it teaches more than reading about it. Build around the figure — give it genuine size (an asymmetric split, or a full-width figure with a caption), not a thumbnail bolted onto a wall of text. Write media.subject as a concrete observable scene a stock library would hold.`,
    data: `\n## This slide's medium: DATA\nThe numbers ARE the point here, and the gathered material carries them as a series. Draw them — a chart, or meters if they are proportions of a whole. Do not bury comparable quantities in sentences, and give the chart most of the row's width so its axis labels stay legible.`,
    diagram: `\n## This slide's medium: DIAGRAM\nThe relationship between the parts is the point, so the structure should carry it: a flow, a radial hub, tiers, a comparison. Pick the one that matches the relationship named above rather than the one you reached for last.`,
    statement: `\n## This slide's medium: STATEMENT\nOne sentence carries this slide. Set it large and give it room — a quote-banner, a full-bleed band, or hero-scale type with almost nothing else. Resist adding supporting boxes; the emptiness is what makes it land.`,
    "reference-table": `\n## This slide's medium: REFERENCE TABLE\nThis is lookup material. A clean table is the right answer — rows, columns, a header row, no decoration competing with the data. Scanability beats visual interest here.`,
  } as Record<string, string>)[plan?.visual ?? ""] ?? ""

  // Counted, not "avoid back-to-back". The previous wording forbade only
  // consecutive repeats and then said in as many words that "two flow slides in
  // one module are fine" — so the agent settled on its favourite and stayed
  // there: `flow` was the root shape on 24% of the 46-slide GSE deck while
  // badge-number, alternating-list, meter and radial were never chosen once.
  // Naming the over-used shape as spent, and naming what is still unspent, is
  // what actually widens the vocabulary.
  const varietyNote = (() => {
    const used: string[] = shapes_used ?? []
    if (!used.length) return "This is the first content slide in the module — no prior shape to avoid yet."

    const counts = used.reduce<Record<string, number>>((a, s) => { a[s] = (a[s] ?? 0) + 1; return a }, {})
    const spent = Object.entries(counts).filter(([, n]) => n >= 2).map(([s]) => s)
    const ALTERNATIVES = ["comparison", "tiers", "radial", "alternating-list", "meter", "table",
      "stat-equation", "quote-banner", "icon-tile", "row (asymmetric split with a figure)", "custom"]
    const unspent = ALTERNATIVES.filter(a => !used.includes(a.split(" ")[0]))

    const tally = Object.entries(counts).map(([s, n]) => `${s}×${n}`).join(", ")
    const lines = [`Root shapes already used in this module: ${tally}.`]
    if (spent.length) {
      lines.push(`ALREADY USED TWICE OR MORE — do NOT choose ${spent.map(s => `"${s}"`).join(" or ")} for this slide. Reach for a different root shape even if your first instinct is to repeat one of them; only override this if the content is genuinely inexpressible any other way, and say so in "justification".`)
    } else {
      lines.push(`Do not repeat a root shape back-to-back unless the relationship forces it.`)
    }
    if (unspent.length) {
      lines.push(`Not yet used in this module — prefer one of these where the content fits: ${unspent.slice(0, 7).join(", ")}.`)
    }
    lines.push(`When a shape must repeat, vary the treatment too: a different fill, corner, density or elevation. Two identical-looking slides are the failure mode this system exists to avoid.`)
    return lines.join("\n\n")
  })()

  const prompt = `You are the Design Agent for ICS Aviation's course generator. The material for this slide has already been researched and written — your ONLY job is to decide the most honest way to show it. You are not filling in a template; you are a presentation designer looking at finished content and reasoning about its shape, the way a person would before opening a design tool.

## Course
Module ${module_number}: "${module_title}"  (slide ${slide_index + 1} of ${slide_total})
Slide title: "${slide.title}"
Layout master: ${slide.layout_kind}
${module_accent ? `This module's accent: **${module_accent}** — use it (not token:accent-warm by default) for headings, badges, borders, icon highlights, and other decorative accent choices in this slide. This is what makes each module feel distinct while staying inside the ICS palette. Do NOT use it for token:success/token:danger/token:tab-yellow roles — those stay reserved for real positive/negative/caution meaning (e.g. inside an escalating flow or a tag-list), never as decoration.` : ""}

## The material for this slide (already gathered — do not invent new facts, only decide how to show these)
${factsBlock}
${plan?.relationship ? `\nRelationship these facts have to each other: **${plan.relationship}**` : ""}
${roleNote}${visualNote}${emphasisNote}
${plan?.data?.length ? `\nComparable quantities in this material — these are REAL numbers from the source, already extracted for you:\n${plan.data.map(d => `  - ${d.label}: ${d.value}${d.unit ? ` ${d.unit}` : ""}`).join("\n")}\nThis slide has genuinely chartable data. Showing it as a chart or meter almost always beats restating the numbers inside a sentence — a reader compares bars instantly and parses prose slowly. Use "chart" (bar for comparing categories, line for a trend over time, donut for parts of a whole with 5 or fewer slices) or "meter" for proportions. Keep the numbers exactly as given; never round them into something the source didn't say.` : ""}
${retry_feedback ? `\n## FIX REQUIRED (previous attempt failed quality review)\n${retry_feedback}` : ""}${render_png ? `\n\nThe image attached to this message IS your previous attempt, rendered exactly as a reader will see it. Look at it before changing anything. The note above is what a reviewer measured; the picture is the thing itself, so trust your eyes over the paraphrase. Then compose a DIFFERENT arrangement that fixes what you can see — do not resubmit the same structure with the wording tweaked.` : ""}

## Reasoning step — do this before composing
1. Look at the relationship named above. What does it actually mean about how these facts connect — is one leading to another, is one central and the rest orbit it, are two things being weighed, does severity build?
2. Name, in one sentence, why a specific shape fits that relationship better than a plain card or bullet list would — UNLESS the relationship is genuinely "enumeration," in which case say so plainly; a card grid is the correct, honest answer for a real list.
3. Only then compose the blueprint.

${RELATIONSHIP_TO_SHAPE}

${varietyNote}

### House patterns (from real ICS decks — a starting reference, not the ceiling)
${exemplarPromptBlock()}

### Primitive reference
${PRIMITIVE_REFERENCE}

### Palette — real values, and this slide's background
${paletteBlock(tokens, !!dark_background)}

### Style parameters — how to make this slide look like itself
${STYLE_REFERENCE}

### Decoration — what sits behind the content
Alongside "blueprint" you may return an optional "decor" object. It renders
BEHIND everything, faintly, and carries no information:
  "decor": { "numeral":"03", "icon":"shield-check", "pattern":"dots|grid|diagonal",
             "edge":"left|top", "corners":true, "accent":"token:…" }

- numeral — a huge faint number anchoring a stage, step or module. Only when the
  slide genuinely IS that numbered thing; never as a decorative digit.
- icon — a huge faint glyph of the slide's subject, from the icon vocabulary below.
- pattern — a texture across the zone. Use sparingly; never behind a table or chart,
  where it competes with the data.
- edge / corners — a hairline accent framing the zone. Quiet structure, not ornament.

Pick AT MOST ONE of numeral / icon / pattern per slide — two faint layers behind
each other is noise, not depth. Most slides need none of this: reach for it when a
slide would otherwise read as a bare box of text, not as a habit.

### Icon vocabulary
${ICON_REFERENCE}

### Depth and effects
${EFFECTS_REFERENCE}

### Composition principles
- **Spend your boldness in one place.** Before composing, decide the ONE element on this slide that gets to be the loud thing — a big stat, a strong image, a quote-banner, a badge-number's first step. Everything else on the slide must visibly defer to it: smaller, quieter, less saturated. A slide with three equally emphasised elements reads as busy, not rich, even if each element is well made on its own.
- **Structure must be true, not habitual.** A numbered badge, an accent bar, a divider line — each is a claim about the content ("this has an order," "this is the important line"). Before using accentBar/badge-number/numbered markers, ask: does this content actually have that property, or is it just the shape this system reaches for by default? An accent bar on every heading, a number on every card — that is decoration wearing structure's clothes, and it is one of the most recognisable tells of templated AI output. Use it because it is true, not because it is available.
- Build hierarchy with SIZE, WEIGHT and SPACE — not colour alone.
- Use whitespace to group. Related items sit close; unrelated items get a full gap.
- Keep a line of body text roughly 60-75 characters.
- Prefer wrapping to truncation.
- Font weight carries meaning: 700-800 headings, 500 labels, 400 body.
- Match chart type to the question: trend over time → line; category comparison → bar; parts of a whole (5 or fewer) → donut.

## Self-check before you output
Ask the sharper question, not just "is this generic": **would I produce this exact composition for a different slide with similarly-shaped content?** If the answer is yes, it isn't built from THIS slide's specific facts, it's a template with the words swapped — regardless of which primitive it uses, including the new relationship ones. If the relationship clearly wasn't "enumeration" and you still produced a plain bullet list or card grid, stop and reconsider. And check the boldness budget: is there genuinely one loud element here, or did you give everything the same weight?

## Content rules
- Aviation-professional register; precise, factual, no filler or marketing language.
- Fit the slide: a diagram-shaped slide (flow/radial/tiers) needs less running prose than a bullet slide — let the shape carry meaning instead of restating it in a paragraph. As a ceiling, keep total body text under ~110 words.
- Reproduce citations from the gathered material's "citations" list where you use that fact; never invent a clause number.
- Photography: still never ask for a photo OF an abstract idea — "a compliance framework", "clause 139.15(b)" — no such photograph exists and the search returns something vaguely aviation-shaped and wrong. But that rule is about the SUBJECT, not a reason to avoid imagery: almost every module has slides whose subject has a real physical setting (an inspection walk, a control tower, a fire appliance, a works site, people in a briefing) even when the surrounding argument is abstract. Reach for those. ${photoNote} At most one figure per slide.
- Flag "sensitive": true when the slide covers safety-critical, medical, legal, or regulatory-compliance content.
${isStructural ? `- This is a ${slide.layout_kind} slide: keep it minimal — a strong title, and either no blueprint at all or a very light one.` : ""}

## Output
Return ONLY valid JSON:
{
  "intent": "${slide.intent}",
  "layout_kind": "${slide.layout_kind}",
  "title": "final slide title",
  "blueprint": { …structural tree, or null for a bare structural slide… },
  "decor": { …optional; omit entirely unless the slide genuinely benefits… },
  "sensitive": false,
  "citations": [{ "source_doc_id": "file name it came from", "excerpt": "short supporting quote" }]
}`

  // With a render attached the designer SEES the slide it is fixing. Until now
  // its only channel was one sentence: the reviewer looked at a picture, formed
  // a visual judgement, compressed it to a line, and the designer rebuilt the
  // problem from that line and worked blind. The first attempt has nothing to
  // show, so it stays a text call and costs what it always did; only a retry
  // pays for vision, which is exactly when it is worth paying for.
  const result = render_png
    ? await claudeVisionJSON({
        model: MODELS.slide_content,
        prompt,
        imagesBase64Png: [render_png],
        maxTokens: 16_000,
        label: `Slide redesign (sighted) "${slide.title}"`,
      })
    : await claudeJSON({
        model: MODELS.slide_content,
        prompt,
        maxTokens: 16_000,
        label: `Slide design "${slide.title}"`,
      })

  if (!result?.title) throw new Error("Slide design came back without a title")
  result.layout_kind = slide.layout_kind
  if (!result.intent) result.intent = slide.intent
  result.shape = result.blueprint?.type ?? null

  return result as SlideSourceContent
}
