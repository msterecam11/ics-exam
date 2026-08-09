// Course Generator — structural primitives & element schema.
//
// The Content Agent composes each slide's interior as a STRUCTURAL blueprint
// tree built from these primitives — it never emits coordinates. The compiler
// renders the tree with real CSS (flex/grid) inside the master's content
// zone, measures the resolved nodes, and bakes them into absolutely
// positioned elements (percent-of-slide x/y/w/h) that the canvas editor
// operates on. Style values are theme-token references, never raw px/hex,
// so re-theming repaints everything.

// ─── Token references ────────────────────────────────────────────────────────
// A style slot holds either a literal (rare, editor-set) or "token:<name>".
export type TokenRef = `token:${string}` | string
import type { ArrowEnds } from "./connectors"
export type { ArrowEnds }

// ─── Blueprint (structural) layer ────────────────────────────────────────────

export type SpacingStep = "xs" | "sm" | "md" | "lg" | "xl"

// ─── Style parameters ─────────────────────────────────────────────────────
// Every primitive used to render with hardcoded padding, radius and fill, so
// two `card` slides were the same component with different words in it — the
// single biggest reason a deck with genuine structural variety still read as
// "every slide looks the same". These let the design agent make real visual
// decisions inside a bounded, always-on-brand range: still token-driven,
// still bakes to plain editable elements, but no longer one fixed look.

/** Corner language. `pill` is fully rounded; `sharp` is square. */
export type CornerStyle = "sharp" | "soft" | "round" | "pill" | "notched"
/** How a surface is filled. `tinted` is a 12% wash of the accent; `glass` is
 *  translucent white for dark/photographic grounds; `gradient` runs the accent
 *  into its darker sibling. */
export type FillStyle = "filled" | "outline" | "tinted" | "glass" | "gradient" | "plain"
/** Depth. One level per slide — mixing them reads as inconsistent. */
export type Elevation = "flat" | "raised" | "lifted" | "inset" | "ring"
/** Internal breathing room. */
export type Density = "tight" | "normal" | "airy"

export interface StyleParams {
  corner?: CornerStyle
  fill?: FillStyle
  elevation?: Elevation
  density?: Density
  /** Accent this surface derives its colour from. Defaults to the module accent. */
  accent?: TokenRef
  /** Multi-item primitives: step the accent's intensity across items so the
   *  sequence itself carries meaning, rather than repeating one flat colour. */
  intensityRamp?: boolean
}

export interface BlueprintBase {
  type: string
  /** Optional stable key so re-compiles can match nodes across edits. */
  key?: string
}

/** Containers — geometry is resolved by the CSS engine, never the LLM. */
export interface RowNode extends BlueprintBase {
  type: "row"
  gap?: SpacingStep
  /** Relative widths, e.g. [1,1] equal columns, [2,1] weighted. */
  weights?: number[]
  children: BlueprintNode[]
}
export interface ColNode extends BlueprintBase {
  type: "col"
  gap?: SpacingStep
  children: BlueprintNode[]
}
export interface StackNode extends BlueprintBase {
  type: "stack" // vertical flow, natural heights
  gap?: SpacingStep
  children: BlueprintNode[]
}

/** Leaf/content primitives — transcribed from ICS's real deck patterns. */
export interface HeadingNode extends BlueprintBase {
  type: "heading"
  text: string
  level?: 2 | 3 | 4 | 5
  color?: TokenRef // e.g. "token:accent-warm" for the orange section labels
  icon?: string    // phosphor icon name, rendered before the text
  accentBar?: boolean // vertical accent bar to the left (real-deck pattern)
  /** Small letterspaced caps line above the heading — "GOVERNANCE", not a
   *  second sentence. Names the category the heading belongs to; skip it
   *  when the heading already says that on its own. */
  eyebrow?: string
}
export interface BodyNode extends BlueprintBase {
  type: "body"
  /** Rich runs: plain string or array of styled runs (bold emphasis etc.). */
  text: string | TextRun[]
  /**
   * Running text had exactly one size, so the only way to open a slide with a
   * standfirst — a larger opening line that sets up everything beneath it —
   * was to misuse a heading. "lead" is that line; "caption" is the small note
   * under a figure or table.
   */
  size?: "lead" | "body" | "caption"
}
export interface BulletsNode extends BlueprintBase {
  type: "bullets"
  items: string[]
  // Per-item icons: use "icon-row" repeated instead — that primitive already
  // bakes icon and text as properly separate elements. A bullet item never
  // carried a working icon here; the field existed but nothing rendered it.
}
export interface CardNode extends BlueprintBase {
  type: "card"
  tone?: "plain" | "cream" | "glass" | "accent" // cream = requirement callout, glass = dark summary cards
  accent?: TokenRef // top/left border accent color
  /** Overrides `tone`'s fixed look where set — corner, fill, depth, density. */
  style?: StyleParams
  children: BlueprintNode[]
}
export interface BadgeNumberNode extends BlueprintBase {
  type: "badge-number"
  n: number | string // "01"
  variant?: "navy" | "band-warm" | "band-blue" // navy box vs full-width colored header band
  heading?: string
}
export interface CalloutNode extends BlueprintBase {
  type: "callout"
  tone: "requirement" | "definition" | "impact" | "note"
  label?: string // "DEF:", "IMPACT:", "Requirement Level"
  text: string
}
export interface IconRowNode extends BlueprintBase {
  type: "icon-row"
  icon: string
  text: string
  accent?: TokenRef
}
export interface AlternatingListNode extends BlueprintBase {
  type: "alternating-list" // gray rows + yellow accent tabs + per-row icons (p7 pattern)
  items: { text: string; icon?: string }[]
}
export interface QuestionRowsNode extends BlueprintBase {
  type: "question-rows" // self-assessment pattern (p23)
  questions: string[]
}
export interface StatNode extends BlueprintBase {
  type: "stat"
  value: string
  label: string
  /** "hero" makes the number the largest thing on the slide — the number
   *  IS the message, not a caption under something else. Use for the one
   *  figure the audience should leave remembering. */
  size?: "normal" | "hero"
}
export interface FigureNode extends BlueprintBase {
  type: "figure" // image card with optional navy caption bar ("FIG 2.1 ...")
  media: MediaRequest
  caption?: string
  shadow?: boolean
  /** Crops the photo to a shape. A circle or arch turns a rectangular stock
   *  photo into a deliberate portrait/vignette; "rounded" is the default
   *  card look. The mechanism already existed on ElementEffects and rendered
   *  correctly — nothing ever offered it at the blueprint level. */
  mask?: "none" | "circle" | "rounded" | "squircle"
}

export interface MeterNode extends BlueprintBase {
  // Labelled horizontal bars — a proportion read at a glance. Right when the
  // point is "how far along / how much of the whole", which a donut states
  // less clearly and a table not at all.
  type: "meter"
  items: { label: string; value: number; max?: number; caption?: string; accent?: TokenRef }[]
  style?: StyleParams
}

export interface IconTileNode extends BlueprintBase {
  // A solid accent square holding a white glyph, with a heading and short
  // body beneath it. This is the single strongest device in the reference
  // decks we compared against and the one we had no equivalent for: it gives
  // a card grid a real visual anchor instead of another line of text where
  // the icon is just a small tinted glyph in the margin.
  type: "icon-tile"
  icon: string
  heading: string
  body?: string
  accent?: TokenRef
  style?: StyleParams
}
export interface TableNode extends BlueprintBase {
  type: "table"
  headerRow: boolean
  rows: { cells: { text: string; colSpan?: number; rowSpan?: number }[] }[]
}
export interface ChartNode extends BlueprintBase {
  type: "chart"
  chartType: "bar" | "line" | "donut"
  data: { labels: string[]; datasets: { label: string; data: number[] }[] }
  /**
   * What the numbers ARE — "metres", "%", "minutes". The gather pass has
   * always extracted a unit alongside each value (SlideContentPlan.data) and
   * the chart schema had nowhere to put it, so every chart drew bare numbers
   * against an unlabelled axis and the reader had to guess.
   */
  unit?: string
  /** Axis captions. Omit either when the labels already say it. */
  xTitle?: string
  yTitle?: string
}
export interface ComparisonNode extends BlueprintBase {
  type: "comparison" // 2-column labeled comparison (p3/p14 pattern)
  columns: { heading: string; icon?: string; accent?: TokenRef; children: BlueprintNode[] }[]
}

// ─── Relationship primitives ──────────────────────────────────────────────
// The categories above are almost all "here is a fact" shapes. These exist
// for the opposite case: the content's real point is how things relate to
// each other — a sequence, a center-and-satellites, a hierarchy, an
// escalation. Reach for one of these whenever the relationship IS the
// content, not just when a card grid has run out of room.

export interface FlowNode extends BlueprintBase {
  type: "flow" // sequential stages connected by a directional line (process, lifecycle, escalation)
  direction?: "horizontal" | "vertical"
  style?: StyleParams
  /** Draws each step's number inside a solid circular badge instead of as
   *  bare numeral text — a real numbered-stage look, not just a bold digit. */
  marker?: "text" | "circle"
  steps: { n?: number | string; heading: string; body?: string; icon?: string }[]
  /** Colour ramp low→high across steps (green→amber→orange→red) — for
   *  severity/escalation content where position in the sequence IS the point. */
  escalate?: boolean
}
export interface RadialNode extends BlueprintBase {
  type: "radial" // one hub concept with related items connected around it
  hub: { heading: string; icon?: string }
  style?: StyleParams
  spokes: { heading: string; body?: string; icon?: string }[]
}
export interface TiersNode extends BlueprintBase {
  type: "tiers" // stacked horizontal bands where each governs the one below, linked by a downward arrow
  style?: StyleParams
  bands: { heading: string; items?: string[]; tone?: TokenRef }[]
}
export interface BandNode extends BlueprintBase {
  // Full-width strip, edge to edge — a takeaway line, a section break, a
  // divider statement. The one primitive here that is meant to be placed as
  // a DIRECT child of the slide's top-level stack, not nested inside a row,
  // so it actually reads as breaking out of the composition's margins rather
  // than as one more boxed card among others.
  type: "band"
  text: string
  icon?: string
  style?: StyleParams
}
export interface QuoteBannerNode extends BlueprintBase {
  type: "quote-banner" // one full-width oversized statement — the single idea the slide must leave behind
  text: string
  attribution?: string
  style?: StyleParams
}
export interface StatEquationNode extends BlueprintBase {
  type: "stat-equation" // terms joined by "+" resolving to a result joined by "=" — cumulative/compounding logic
  terms: { label: string; sublabel?: string }[]
  result: { label: string; sublabel?: string }
}
export interface TagListNode extends BlueprintBase {
  type: "tag-list" // label rows each ending in a small colored status pill
  items: { label: string; tag: string; tone?: "success" | "warning" | "danger" | "neutral" }[]
}

// Tier 3 (gated): custom visual composition for content no primitive covers
// (timelines, diagrams-with-arrows, hero stat treatments). The ONE place the
// LLM expresses geometry — small-scale, relative to this node's own box
// (0-100 of its width/height), never the whole slide. Must justify its use;
// gets stricter QA. Children are limited to simple visual atoms so the
// result always bakes to standard editable elements — never an opaque blob.
export interface CustomNode extends BlueprintBase {
  type: "custom"
  justification: string // why no primitive combination could express this
  aspect?: number // preferred width/height ratio of the box, e.g. 2.5
  children: {
    kind: "shape" | "line" | "text" | "icon"
    x: number; y: number; width: number; height: number // % of the custom box
    // The ONLY props each kind reads — the renderer silently drops anything
    // else, so an invented prop name (an "arrow" on a line, a "style" on a
    // shape) has no effect and the model never finds out:
    //   shape: fill, radius, dashed (boolean)
    //   line:  stroke, dashed (boolean)
    //   text:  text, fontSize, color, align ("left"|"center"|"right"), rotate (deg)
    //   icon:  name, color, rotate (deg)
    // "rotate" is NOT applied as a CSS transform before the compiler measures
    // this node — a rotated element's bounding box is its rotated envelope,
    // not its design size. It rides through unchanged into the baked
    // element's own `rotation` field, applied only at paint time.
    props: Record<string, string | number | boolean>
  }[]
}

export type BlueprintNode =
  | RowNode | ColNode | StackNode
  | HeadingNode | BodyNode | BulletsNode | CardNode | BadgeNumberNode
  | CalloutNode | IconRowNode | AlternatingListNode | QuestionRowsNode
  | StatNode | FigureNode | TableNode | ChartNode | ComparisonNode
  | FlowNode | RadialNode | TiersNode | QuoteBannerNode | StatEquationNode | TagListNode
  | BandNode | IconTileNode | MeterNode
  | CustomNode

/** What the Media Agent resolves into an actual image. */
export interface MediaRequest {
  want: "photo" | "illustration" | "icon-graphic"
  subject: string
  purpose: string
  /** Resolved by media job: */
  resolved_url?: string
  source?: "library" | "generated"
  source_ref?: string // library asset id or generation prompt
  review_status?: "auto_approved" | "needs_human_review"
}

// ─── Baked element layer (what cg_pages.elements stores) ─────────────────────
// All coordinates are PERCENTAGES of the slide (1280×720 reference).

/** Visual effects available on any element — plain CSS under the hood, so
 *  they bake, render, export to PDF, and stay editable identically. */
export interface ElementEffects {
  /** Drop shadow: "none" | "sm" | "md" | "lg" | "glow" */
  shadow?: "none" | "sm" | "md" | "lg" | "glow"
  opacity?: number          // 0-1
  blur?: number             // px, backdrop blur for glass looks
  /** Text only: outline/stroke around glyphs. */
  textStroke?: { width: number; color: TokenRef }
  /** Text only: shadow behind glyphs (readability over photos). */
  textShadow?: "none" | "soft" | "strong"
  /** Fill with a gradient between two tokens instead of a flat colour. */
  gradient?: { from: TokenRef; to: TokenRef; angle?: number }
  /** Image only. */
  grayscale?: boolean
  brightness?: number       // 1 = unchanged
  /** Colour intensity. 1 = untouched, 0 = greyscale. Sourced photography is
   *  slightly desaturated so a course built from many photographers reads as
   *  one deck rather than a scrapbook. */
  saturate?: number
  /** Image only: crop the image to a shape. */
  mask?: "none" | "circle" | "rounded" | "squircle"
  /** Border on any element. */
  border?: { width: number; color: TokenRef; style?: "solid" | "dashed" }
}

export interface ElementBase {
  id: string
  type: string
  x: number; y: number; width: number; height: number
  zIndex: number
  rotation?: number
  locked?: boolean
  effects?: ElementEffects
  /** Stamped from a master and not yet filled in — rendered as a prompt
   *  and cleared on first edit. */
  placeholder?: boolean
  /** Part of the decoration layer (see decor.ts): a ghost numeral, watermark
   *  glyph or edge accent. Carries no information and must never be counted
   *  as content — a huge faint numeral bakes as a text node, and without this
   *  flag it would make an almost-empty slide measure as comfortably full. */
  decor?: boolean
}
export interface TextRun {
  text: string; bold?: boolean; italic?: boolean; color?: TokenRef
  /** Marker-style background wash behind just this run — for the one phrase
   *  in a paragraph that should be found at a glance, not the whole line. */
  highlight?: TokenRef
}
export interface TextElement extends ElementBase {
  type: "text"
  runs: TextRun[]
  style: {
    fontSize: number; fontWeight?: number; color?: TokenRef
    align?: "left" | "center" | "right"; lineHeight?: number
    /** Set by the compiler when the text measured as exactly one line. */
    noWrap?: boolean
  }
}
export interface ImageElement extends ElementBase {
  type: "image"
  url: string
  fit?: "cover" | "contain"
  source?: "library" | "generated" | "user"
  source_ref?: string
  review_status?: "auto_approved" | "needs_human_review"
}
export interface IconElement extends ElementBase {
  type: "icon"
  name: string // phosphor icon name
  color?: TokenRef
}
export interface ShapeElement extends ElementBase {
  type: "shape"
  shape: "rect" | "line" | "ellipse"
  style: {
    fill?: TokenRef; stroke?: TokenRef; strokeWidth?: number; radius?: number
    opacity?: number; shadow?: boolean; dashed?: boolean
    /** shape "line" only — arrowheads, so a rule can become a connector.
     *  Without this the agent could draw a line between two boxes but never
     *  say which one leads to the other, which is why no timeline or process
     *  chain could be composed. */
    arrow?: ArrowEnds
    /** How `fill` is painted — solid, a tint of it, a gradient into its deeper
     *  sibling, an outline, or glass. Baked so the PDF and the editor paint
     *  the same surface the compiler measured. */
    fillStyle?: FillStyle
    /** 0-1, steps `filled`/`tinted` strength for ramped sequences. */
    intensity?: number
    /** Elevation name, kept so the editor can round-trip it. */
    elevation?: Elevation
    /** Repeating texture drawn in `fill`, for decoration surfaces. */
    pattern?: "dots" | "grid" | "diagonal"
    /** Corner style — border-radius values plus "notched" (a diagonal cut
     *  top-right corner, via clip-path) and "circle" (a numeral marker drawn
     *  as a perfect circle rather than a rounded square). Both are safe to
     *  bake: clip-path affects paint only, never the box getBoundingClientRect
     *  measures, so — unlike rotation — it never needs deferring to paint time. */
    corner?: CornerStyle | "circle"
  }
}
export interface TableCell { text: string; colSpan?: number; rowSpan?: number; style?: Record<string, TokenRef | number | string> }
export interface TableElement extends ElementBase {
  type: "table"
  rows: { height?: number; cells: TableCell[] }[]
  colWidths: number[] // percentages of table width
  tableStyle: { headerRow?: boolean; altRowFill?: TokenRef; borders?: TokenRef; typography?: TokenRef }
}
export interface ChartElement extends ElementBase {
  type: "chart"
  chartType: "bar" | "line" | "donut"
  data: { labels: string[]; datasets: { label: string; data: number[] }[] }
  /** Carried from the blueprint so the PDF and the editor draw the SAME
   *  captioned axes the measurement pass drew — a caption present only at
   *  compose time is the bug class this system keeps hitting. */
  unit?: string
  xTitle?: string
  yTitle?: string
}

export type CanvasElement =
  | TextElement | ImageElement | IconElement | ShapeElement | TableElement | ChartElement

// ─── Slide semantic layer (cg_pages.source_content) ──────────────────────────

export type LayoutKind =
  | "cover" | "section_divider" | "content_white" | "content_lightblue"
  | "summary_dark" | "self_assessment" | "closing_cta"

/**
 * Slide-level decoration — everything that sits BEHIND the content.
 *
 * One mechanism, several devices. These are the marks a designer adds to stop
 * a slide reading as a bare box of text: a huge faint numeral anchoring the
 * step, a watermark glyph carrying the subject, a hairline accent along one
 * edge. They never carry information the content doesn't already state, so
 * they can be ignored entirely without losing meaning — which is exactly what
 * makes them safe to add and safe to leave out.
 */
export interface DecorSpec {
  /** Oversized faint numeral, back-left. Use for a step, stage or module. */
  numeral?: string | number
  /** Oversized faint glyph, back-right. Must be a name from the icon set. */
  icon?: string
  /** Repeating texture across the content zone. */
  pattern?: "dots" | "grid" | "diagonal"
  /** Hairline accent strip along one edge of the content zone. */
  edge?: "left" | "top"
  /** L-brackets framing the content zone's corners. */
  corners?: boolean
  /** Colour for all of the above. Defaults to the module accent. */
  accent?: TokenRef
}

export interface SlideSourceContent {
  intent: string // e.g. "comparison", "numbered-process", "blank_master"
  layout_kind: LayoutKind
  title?: string
  subtitle?: string
  blueprint?: BlueprintNode // the interior composition (content zone only)
  decor?: DecorSpec         // what sits behind the composition
  media_requests?: MediaRequest[]
  sensitive?: boolean // regulatory/safety/medical/legal → generated images need human review
  citations?: { source_doc_id: string; excerpt?: string }[]
  /** The root blueprint node's `type` — recorded so the next slide's design
   *  pass can see what shape its siblings already used and deliberately vary,
   *  the way a human laying out a whole module would. */
  shape?: string
}

/** Per-slide gathered material — the output of the module content-gather
 *  pass. Facts exist here BEFORE any layout decision is made, so the design
 *  pass reasons about a finished thing rather than inventing content and
 *  composing it in the same breath. */
export interface SlideContentPlan {
  slide_title: string
  facts: string[] // the substantive material this slide must convey
  /** The nature of the relationship between the facts above — this is what
   *  should drive the visual structure, not a menu pick. */
  relationship: "sequence" | "hierarchy" | "hub-and-satellites" | "comparison"
    | "cause-effect" | "escalation" | "cumulative" | "single-statement" | "enumeration"
  /**
   * This slide's weight in the MODULE's arc, decided once for the whole
   * module rather than by each slide about itself.
   *
   * Every slide previously judged its own prominence in isolation, and a
   * slide asked "should this be striking?" always answers yes — which is how
   * a module of individually-reasonable slides ends up reading as uniform.
   * Nothing is emphatic if everything is. A module gets one or two "peak"
   * slides at most; "quiet" slides exist to make them land.
   */
  emphasis?: "peak" | "normal" | "quiet"
  citations: { source_doc_id: string; excerpt?: string }[]
  /**
   * Comparable quantities this slide's material actually contains, pulled
   * out as structured values rather than left inside prose.
   *
   * The chart primitives have always rendered correctly in all three paths
   * and were used ZERO times across a real 46-slide course. The cause was
   * never the prompt: the gather pass emitted only `facts: string[]`, so a
   * figure like "renewal needs 6-12 months of lead time" reached the design
   * agent as a sentence, and there was no series anywhere for a chart to
   * draw. Extracted here, at the point the material is actually being read.
   *
   * Only ever populated when the numbers are genuinely comparable to each
   * other — three durations, four counts, a set of percentages. A single
   * lone figure is a `stat`, not a chart, and forcing it into one invents a
   * comparison the source never made.
   */
  data?: { label: string; value: number; unit?: string }[]
}
export interface ModuleContentPlan {
  slides: SlideContentPlan[]
}
