// Scales raw per-question point values so their DISPLAYED total is always
// exactly `target` (default 100) — used only for what candidates see
// (take-page "X pts" badges, results review "X/Y pts"). Grading itself
// always uses the real underlying question.score values; this never
// touches that math, it only changes what's shown.
//
// Uses the largest-remainder method: naive per-value rounding can drift
// the displayed sum away from the target (e.g. 33.33 + 33.33 + 33.33 =
// 99.99, not 100). This guarantees the rounded values sum to exactly
// `target`, and a raw value of 0 always scales cleanly to 0 — never NaN.
export function scaleToTarget(rawValues: number[], target = 100, decimals = 2): number[] {
  if (rawValues.length === 0) return []

  const sum = rawValues.reduce((a, b) => a + b, 0)
  const factor = 10 ** decimals

  // Degenerate case (every value is 0, or the pool is empty of weight) —
  // split the target evenly rather than dividing by zero.
  const proportions = sum > 0
    ? rawValues.map(v => (v / sum) * target)
    : rawValues.map(() => target / rawValues.length)

  const floored = proportions.map(v => Math.floor(v * factor))
  const flooredSum = floored.reduce((a, b) => a + b, 0)
  const remainder = Math.max(0, Math.round(target * factor) - flooredSum)

  const byFractionDesc = proportions
    .map((v, i) => ({ i, frac: v * factor - floored[i] }))
    .sort((a, b) => b.frac - a.frac)

  const result = [...floored]
  for (let k = 0; k < remainder && k < byFractionDesc.length; k++) {
    result[byFractionDesc[k].i]++
  }

  return result.map(v => v / factor)
}

// Clean display string for a scaled score — trims trailing zeros
// ("3" not "3.00") while keeping real precision when it matters ("3.33").
export function formatScore(value: number): string {
  return (Math.round(value * 100) / 100).toString()
}
