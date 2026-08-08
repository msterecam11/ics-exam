// Slide render harness — DEVELOPMENT ONLY.
//
// Renders a hand-written blueprint through the REAL pipeline (compileBlueprint
// → renderSlideHtml → Puppeteer) and writes a PNG to .harness/out/. No model
// call, no database, no cost — the theme is read straight from theme1.ts.
//
// Why this exists: every visual bug in this system so far was found by
// generating a real course (paid, slow) and screenshotting it afterwards.
// Nothing could be looked at before it shipped. This makes "look at it first"
// the cheap option.
//
// It deliberately uses the same functions production does. A harness with its
// own renderer would prove only that the harness works.

export const maxDuration = 120

import { NextResponse } from "next/server"
import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { compileBlueprint } from "@/lib/course-gen/compiler"
import { screenshotSlide } from "@/lib/course-gen/jobs/qa"
import { ICS_THEME_1, type Master } from "@/lib/course-gen/theme1"
import { FIXTURES, FIXTURE_NAMES, type Fixture } from "@/lib/course-gen/harness/fixtures"
import type { ThemeTokens } from "@/lib/course-gen/tokens"

const OUT_DIR = path.join(process.cwd(), ".harness", "out")

/** Refuses to exist in production — this endpoint renders arbitrary input. */
function devOnly(): NextResponse | null {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return null
}

export async function GET() {
  const blocked = devOnly()
  if (blocked) return blocked
  return NextResponse.json({
    fixtures: FIXTURE_NAMES.map(name => ({
      name,
      master: FIXTURES[name].master,
      title: FIXTURES[name].title,
      note: FIXTURES[name].note ?? null,
    })),
    outDir: OUT_DIR,
    usage: 'POST { "fixture": "<name>" } | { "all": true } | { "blueprint": {...}, "master": "content_white", "title": "..." }',
  })
}

export async function POST(req: Request) {
  const blocked = devOnly()
  if (blocked) return blocked

  const body = await req.json().catch(() => ({}))
  const tokens = ICS_THEME_1.tokens as unknown as ThemeTokens
  const masters = ICS_THEME_1.layout_templates as unknown as Record<string, Master>

  let jobs: { name: string; fixture: Fixture }[]
  if (body?.all) {
    jobs = FIXTURE_NAMES.map(name => ({ name, fixture: FIXTURES[name] }))
  } else if (body?.fixture) {
    const fixture = FIXTURES[body.fixture]
    if (!fixture) {
      return NextResponse.json({ error: `Unknown fixture "${body.fixture}"`, known: FIXTURE_NAMES }, { status: 400 })
    }
    jobs = [{ name: body.fixture, fixture }]
  } else if (body?.blueprint) {
    // Ad-hoc: render a blueprint pasted straight in, for iterating on a shape
    // before it becomes a fixture.
    jobs = [{
      name: String(body.name ?? "adhoc"),
      fixture: {
        master: body.master ?? "content_white",
        title: String(body.title ?? "Ad-hoc render"),
        blueprint: body.blueprint,
        decor: body.decor,
      },
    }]
  } else {
    return NextResponse.json({ error: "Pass { fixture } , { all: true } or { blueprint }" }, { status: 400 })
  }

  await mkdir(OUT_DIR, { recursive: true })
  const results: any[] = []

  // Sequential on purpose: each render launches its own Chromium, and this
  // box is the same 512MB-class instance that already suffers when the PDF
  // export and a generation collide. Rendering 20 fixtures in parallel would
  // reproduce that failure for no benefit.
  for (const { name, fixture } of jobs) {
    const master = masters[fixture.master]
    if (!master) {
      results.push({ name, error: `Unknown master "${fixture.master}"` })
      continue
    }
    const started = Date.now()
    try {
      const compiled = await compileBlueprint({
        blueprint: fixture.blueprint,
        master, tokens,
        title: fixture.title,
        decor: fixture.decor,
      })

      const png = await screenshotSlide({
        elements: compiled.elements,
        master, tokens,
        pageNumber: 1,
        moduleNumber: 1,
      })

      const file = path.join(OUT_DIR, `${name}.png`)
      await writeFile(file, Buffer.from(png, "base64"))

      results.push({
        name,
        file,
        ms: Date.now() - started,
        note: fixture.note ?? null,
        elements: compiled.elements.length,
        overflow: compiled.overflow,
        // designLint.ts — exactly what production decides, not a second
        // implementation of the same measurements. An earlier version of this
        // route carried its own geometry probe; once the linter existed that
        // was two copies of one calculation, which is the drift that has
        // already caused four bugs in this system.
        lintPass: compiled.lint.pass,
        findings: compiled.lint.findings.map(f => `${f.gating ? "GATE" : "advise"} ${f.rule}: ${f.message}`),
        metrics: compiled.lint.metrics,
      })
    } catch (err: any) {
      results.push({ name, error: String(err?.message ?? err) })
    }
  }

  return NextResponse.json({ outDir: OUT_DIR, count: results.length, results })
}
