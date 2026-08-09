// Pixel comparison against committed baselines.
//
// The harness made it possible to LOOK at a slide before shipping it. This
// makes the looking automatic: every fixture has a committed reference image,
// and any change that moves a pixel is reported without anyone remembering to
// check. Five separate "built, typechecked, never rendered" bugs reached a
// paid generation in this system before the harness existed; this is what
// keeps that closed once nobody is watching for it.
//
// Baselines are COMMITTED, deliberately. A gitignored baseline only protects
// the session that created it — the regression this is meant to catch is the
// one introduced weeks later by someone who never saw the original.

import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises"
import path from "node:path"
import { PNG } from "pngjs"
import pixelmatch from "pixelmatch"

/**
 * Per-channel tolerance. Anti-aliasing of the same glyph can differ by a
 * shade between runs; a real layout change moves whole regions, not single
 * subpixels. Loose enough to ignore renderer noise, tight enough that a 1px
 * shift of a text block still registers.
 */
const THRESHOLD = 0.12

/**
 * Below this fraction of changed pixels a difference is treated as noise.
 * A slide is 1280x720 = 921,600 px, so this is roughly 460 pixels — smaller
 * than a single word.
 */
const NOISE_FLOOR = 0.0005

export interface DiffResult {
  status: "match" | "changed" | "new" | "size-mismatch"
  /** Fraction of pixels that differ, 0-1. */
  ratio?: number
  changedPixels?: number
  /** Written only when something actually changed. */
  diffFile?: string
}

export async function compareToBaseline(opts: {
  name: string
  currentPng: Buffer
  baselineDir: string
  outDir: string
}): Promise<DiffResult> {
  const { name, currentPng, baselineDir, outDir } = opts
  const baselinePath = path.join(baselineDir, `${name}.png`)

  let baselineBuf: Buffer
  try {
    baselineBuf = await readFile(baselinePath)
  } catch {
    // No reference yet. Reported rather than silently created: a baseline
    // that writes itself on first sight would record whatever the code does
    // today, including a bug, and then defend it.
    return { status: "new" }
  }

  const a = PNG.sync.read(baselineBuf)
  const b = PNG.sync.read(currentPng)
  if (a.width !== b.width || a.height !== b.height) {
    return { status: "size-mismatch" }
  }

  const diff = new PNG({ width: a.width, height: a.height })
  const changedPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: THRESHOLD,
    includeAA: false,
  })
  const ratio = changedPixels / (a.width * a.height)

  if (ratio <= NOISE_FLOOR) return { status: "match", ratio, changedPixels }

  const diffFile = path.join(outDir, `${name}.diff.png`)
  await writeFile(diffFile, PNG.sync.write(diff))
  return { status: "changed", ratio, changedPixels, diffFile }
}

/** Promotes the current render to the reference image. */
export async function writeBaseline(opts: {
  name: string
  outDir: string
  baselineDir: string
}): Promise<void> {
  await mkdir(opts.baselineDir, { recursive: true })
  await copyFile(
    path.join(opts.outDir, `${opts.name}.png`),
    path.join(opts.baselineDir, `${opts.name}.png`),
  )
}
