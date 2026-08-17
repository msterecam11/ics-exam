// One-time-ish export: freeze a set of REAL generated slides as a render corpus.
//
// This is deliberately NOT a fixture. Fixtures (src/lib/course-gen/harness/
// fixtures.ts) are hand-written and test one primitive each — that is the right
// shape for "does this primitive draw correctly", and the rule against copying
// generated blueprints into them stands.
//
// What fixtures cannot do is reproduce REAL density: a slide carrying six
// facts of aviation prose, a 2x2 tile grid whose body text wraps to three
// lines, a chart squeezed beside a table. Every geometry bug the users found
// needed exactly that, which is why hand-written fixtures stayed green while
// finished decks overlapped. So this captures real slides once, freezes them,
// and diffs future renders against them.
//
// Usage:  node scripts/export-harness-corpus.mjs <course-id> [max]
//
// Selection favours structural variety: one slide per distinct top-level shape
// signature, preferring the densest example of each, so a small corpus still
// covers many composition types.

import { createClient } from "@supabase/supabase-js"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

// Minimal .env.local reader — this runs outside Next, so nothing has loaded it.
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim())
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
}

const courseId = process.argv[2]
const MAX = Number(process.argv[3] ?? 12)
if (!courseId) {
  console.error("usage: node scripts/export-harness-corpus.mjs <course-id> [max]")
  process.exit(1)
}

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const { data: mods, error: modErr } = await db
  .from("cg_modules").select("id, order_index").eq("course_id", courseId).order("order_index")
if (modErr) throw modErr

const { data: pages, error: pgErr } = await db
  .from("cg_pages")
  .select("id, module_id, order_index, layout_kind, blueprint, source_content")
  .in("module_id", (mods ?? []).map(m => m.id))
if (pgErr) throw pgErr

const modIx = new Map((mods ?? []).map(m => [m.id, m.order_index]))

// Only real compositions — covers/dividers carry master text only and prove
// nothing about layout.
const candidates = (pages ?? []).filter(p =>
  p.blueprint && (p.layout_kind === "content_white" || p.layout_kind === "content_lightblue"
    || p.layout_kind === "summary_dark"))

const signature = bp =>
  (bp?.children ?? []).map(c => c?.type).filter(Boolean).join(">") || bp?.type || "?"
const weight = bp => JSON.stringify(bp).length  // crude density proxy

// Densest example of each distinct shape signature.
const bySig = new Map()
for (const p of candidates) {
  const sig = signature(p.blueprint)
  const prev = bySig.get(sig)
  if (!prev || weight(p.blueprint) > weight(prev.blueprint)) bySig.set(sig, p)
}

const picked = [...bySig.values()]
  .sort((a, b) => weight(b.blueprint) - weight(a.blueprint))
  .slice(0, MAX)
  .sort((a, b) => (modIx.get(a.module_id) - modIx.get(b.module_id)) || (a.order_index - b.order_index))

const corpus = picked.map(p => ({
  name: `corpus-m${modIx.get(p.module_id)}s${p.order_index}`,
  master: p.layout_kind,
  title: p.source_content?.title ?? "(untitled)",
  shape: signature(p.blueprint),
  blueprint: p.blueprint,
  decor: p.source_content?.decor ?? undefined,
}))

mkdirSync(".harness", { recursive: true })
const out = path.join(".harness", "corpus.json")
writeFileSync(out, JSON.stringify({ courseId, capturedAt: new Date().toISOString(), slides: corpus }, null, 2))
console.log(`wrote ${corpus.length} slides to ${out}`)
for (const c of corpus) console.log(`  ${c.name}  [${c.master}]  ${c.shape}`)
