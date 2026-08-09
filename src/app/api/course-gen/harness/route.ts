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
import { screenshotSlide, handleQaJob } from "@/lib/course-gen/jobs/qa"
import { handleSlideContentJob } from "@/lib/course-gen/jobs/slideContent"
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
  const qa = body?.qa === true
  const revise = body?.revise === true
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
        // Opt-in, because unlike everything else here it costs money: one
        // Haiku vision call per fixture. Worth it to calibrate the rubric's
        // threshold against real renders rather than guessing it — the same
        // discipline that caught the linter's contrast cutoff rejecting the
        // client's own brand colours.
        ...(qa ? { qa: await handleQaJob({ input: { elements: compiled.elements, master, tokens, slide_title: fixture.title, page_number: 1, module_number: 1 } }) } : {}),
        // Drives the Phase 6 loop end to end: render the failing attempt, hand
        // the design agent BOTH the picture and the linter's findings, and
        // render whatever it composes instead. Costs one Sonnet vision call,
        // which is why it is opt-in — but it is the only way to see whether
        // sighted revision actually revises.
        ...(revise && !compiled.lint.pass
          ? { revision: await reviseFixture(name, fixture, compiled, master, tokens) }
          : {}),
      })
    } catch (err: any) {
      results.push({ name, error: String(err?.message ?? err) })
    }
  }

  return NextResponse.json({ outDir: OUT_DIR, count: results.length, results })
}

/**
 * One turn of the sighted-revision loop, outside a real generation.
 *
 * The design agent is handed the render of its own rejected slide plus the
 * linter's findings, and its replacement is compiled and screenshotted so the
 * before and after sit side by side on disk.
 */
async function reviseFixture(
  name: string, fixture: Fixture,
  compiled: { elements: any[]; lint: any },
  master: Master, tokens: ThemeTokens,
) {
  const before = await screenshotSlide({
    elements: compiled.elements, master, tokens, pageNumber: 1, moduleNumber: 1,
  })
  await writeFile(path.join(OUT_DIR, `${name}.before.png`), Buffer.from(before, "base64"))

  const advisory = compiled.lint.findings.filter((f: any) => !f.gating).map((f: any) => f.message).join(" ")
  const revised = await handleSlideContentJob({
    input: {
      slide: { title: fixture.title, layout_kind: fixture.master, intent: "revision", key_points: [] },
      module_title: "Harness", module_number: 1, slide_index: 0, slide_total: 1,
      // The design agent is forbidden from inventing facts, so an empty plan
      // correctly makes it return nothing. In production the module's gathered
      // material is already there; here the rejected slide's own text stands
      // in for it, so the agent has the same job it really has — rearrange
      // existing material, not write new material.
      content_plan: {
        facts: compiled.elements
          .filter((e: any) => e.type === "text" && !e.decor)
          .flatMap((e: any) => (e.runs ?? []).map((r: any) => r.text))
          .filter((t: string) => t && t.trim().length > 2),
        relationship: "enumeration",
      },
      shapes_used: [], module_accent: "token:accent-warm",
      tokens, dark_background: master.background.tone === "dark",
      photos_used: 1, slides_remaining: 0,
      retry_feedback: [compiled.lint.feedback, advisory].filter(Boolean).join(" "),
      render_png: before,
    },
  })

  if (!revised?.blueprint) return { error: "agent returned no blueprint", shape: revised?.shape ?? null }

  const after = await compileBlueprint({
    blueprint: revised.blueprint, master, tokens, title: fixture.title, decor: (revised as any).decor,
  })
  const shot = await screenshotSlide({ elements: after.elements, master, tokens, pageNumber: 1, moduleNumber: 1 })
  await writeFile(path.join(OUT_DIR, `${name}.after.png`), Buffer.from(shot, "base64"))

  return {
    shapeBefore: (fixture.blueprint as any).type,
    shapeAfter: revised.blueprint.type,
    lintBefore: { pass: compiled.lint.pass, findings: compiled.lint.findings.map((f: any) => `${f.rule}`) },
    lintAfter: { pass: after.lint.pass, metrics: after.lint.metrics, findings: after.lint.findings.map((f: any) => `${f.gating ? "GATE" : "advise"} ${f.rule}`) },
  }
}
