// Post-generation audit: measures the things the last round of work was
// supposed to change, against the predictions made before it ran.
//
// This exists so the verdict on a test generation is one command instead of
// hand-written SQL. Ad-hoc querying after the fact is how you end up choosing
// the query that agrees with you — the thresholds below were fixed BEFORE the
// run they judge, and the script prints PASS/FAIL against them rather than
// leaving the interpretation open.
//
// Usage:  node scripts/audit-course.mjs <course-id>

import { createClient } from "@supabase/supabase-js"
import { readFileSync } from "node:fs"

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

const courseId = process.argv[2]
if (!courseId) { console.error("usage: node scripts/audit-course.mjs <course-id>"); process.exit(1) }

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: course } = await db.from("cg_courses").select("title, status").eq("id", courseId).single()
if (!course) { console.error("no such course"); process.exit(1) }

const { data: mods } = await db.from("cg_modules")
  .select("id, order_index, title, content_plan, target_slide_count").eq("course_id", courseId).order("order_index")
const { data: pages } = await db.from("cg_pages")
  .select("module_id, order_index, layout_kind, blueprint, elements, source_content, needs_review")
  .in("module_id", (mods ?? []).map(m => m.id))
const { count: linkedDocs } = await db.from("cg_course_documents")
  .select("*", { count: "exact", head: true }).eq("course_id", courseId)

const P = pages ?? []
const contentSlides = P.filter(p => p.layout_kind === "content_white" || p.layout_kind === "content_lightblue")
const j = v => JSON.stringify(v ?? {})

// ── measures ───────────────────────────────────────────────────────────────
const figureRequests = P.filter(p => j(p.blueprint).includes('"figure"')).length
const imageElements  = P.filter(p => /"type"\s*:\s*"image"/.test(j(p.elements))).length
const imageryPct     = P.length ? (imageElements / P.length) * 100 : 0

const rootShape = p => p.blueprint?.type === "stack" || p.blueprint?.type === "row"
  ? (p.blueprint.children ?? []).map(c => c?.type).filter(Boolean).join(">")
  : p.blueprint?.type
// Containers and running text are NOT compositions. Counting them made `body`
// the "most used shape" at 82%, which only says most slides open with a lead
// paragraph — true, unremarkable, and nothing to do with visual monotony. The
// question is how concentrated the actual DEVICES are.
const NOT_A_COMPOSITION = new Set(["body", "heading", "stack", "row", "col", "text"])
const shapeCounts = {}
for (const p of contentSlides) {
  for (const t of String(rootShape(p) ?? "").split(">")) {
    if (t && !NOT_A_COMPOSITION.has(t)) shapeCounts[t] = (shapeCounts[t] ?? 0) + 1
  }
}
const topShare = Object.values(shapeCounts).length
  ? Math.max(...Object.values(shapeCounts)) / contentSlides.length * 100 : 0

const registers = {}
let plansWithVisual = 0
for (const m of mods ?? []) {
  for (const s of m.content_plan?.slides ?? []) {
    if (s?.visual) { registers[s.visual] = (registers[s.visual] ?? 0) + 1; plansWithVisual++ }
  }
}

const citations = P.reduce((n, p) => n + (p.source_content?.citations?.length ?? 0), 0)
const pagesWithCitations = P.filter(p => (p.source_content?.citations?.length ?? 0) > 0).length
const CLAUSE = /\b(?:GACAR?|CAR|Annex|AHM|Doc|Part)\s*\d+[\d.\-§()a-z]*/i
const clauseHits = P.filter(p => CLAUSE.test(j(p.source_content))).length
const flagged = P.filter(p => p.needs_review).length

// ── report ─────────────────────────────────────────────────────────────────
const line = (label, value, verdict) =>
  console.log(`  ${label.padEnd(34)} ${String(value).padEnd(22)} ${verdict ?? ""}`)
const mark = ok => ok ? "PASS" : "FAIL"

console.log(`\n${course.title}\n  status=${course.status}  slides=${P.length}  modules=${(mods ?? []).length}  linkedDocs=${linkedDocs ?? 0}\n`)

console.log("IMAGERY  (was 8.7% of slides; quota targets ~45% of content slides)")
line("figure requests", `${figureRequests} slides`)
line("images resolved", `${imageElements} slides`)
line("share of all slides", `${imageryPct.toFixed(1)}%`, mark(imageryPct >= 20))
console.log()

console.log("VOCABULARY  (was flow on 24% of content slides)")
line("distinct root shapes", Object.keys(shapeCounts).length, mark(Object.keys(shapeCounts).length >= 6))
line("most-used shape share", `${topShare.toFixed(1)}%`, mark(topShare <= 30))
console.log(`  ${Object.entries(shapeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}:${v}`).join("  ")}`)
console.log()

console.log("ART DIRECTION  (visual register — absent means a STALE CACHED PLAN, not a failure)")
line("slides carrying a register", plansWithVisual, mark(plansWithVisual > 0))
line("distinct registers used", Object.keys(registers).length, mark(Object.keys(registers).length >= 3))
console.log(`  ${Object.entries(registers).map(([k, v]) => `${k}:${v}`).join("  ") || "(none — regenerate content_plan)"}`)
console.log()

console.log("GROUNDING")
if ((linkedDocs ?? 0) === 0) {
  line("citations (must be 0, no docs)", citations, mark(citations === 0))
  line("slides naming a clause number", clauseHits, mark(clauseHits === 0))
} else {
  line("citations", `${citations} across ${pagesWithCitations} slides`, "n/a (docs linked)")
}
console.log()

console.log("QA")
line("slides flagged needs_review", flagged, mark(flagged === 0))
console.log()
