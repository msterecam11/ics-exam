// Distributes `total` questions proportionally across a bank's topics based
// on each topic's available question count — used by the "Distribute"
// button on a multi-bank exam's question source page. A topic with more
// tagged questions gets a proportionally larger share, since that reflects
// how much real content the bank's own Expert Analyze found on that topic.
//
// Capacity-aware: never allocates more to a topic than it actually has.
// Uses the same largest-remainder rounding as scoreDisplay.ts so the
// allocated total always lands exactly on `total` (never off-by-one from
// naive per-topic rounding) — unless the bank's combined capacity across
// all topics is smaller than `total`, in which case it allocates everything
// available and the caller should treat the shortfall as a real signal
// (not enough tagged questions to satisfy the request), not silently OK.
export function distributeProportional(
  total: number,
  topics: { key: string; available: number }[]
): Record<string, number> {
  const result = new Map(topics.map(t => [t.key, 0]))
  if (total <= 0 || topics.length === 0) return Object.fromEntries(result)

  const remaining = new Map(topics.map(t => [t.key, t.available]))
  let active = topics.filter(t => t.available > 0)
  let toPlace = Math.min(total, topics.reduce((s, t) => s + t.available, 0))

  // A single pass always suffices here: each topic's raw proportional share
  // is mathematically bounded by its own remaining capacity whenever toPlace
  // is bounded by total active capacity (true on the first pass, and true
  // again on any subsequent pass since toPlace only shrinks). The loop is
  // kept as a defensive safety net rather than a relied-upon requirement.
  while (toPlace > 0 && active.length > 0) {
    const activeCapacity = active.reduce((s, t) => s + remaining.get(t.key)!, 0)
    if (activeCapacity === 0) break

    const proportions = active.map(t => (remaining.get(t.key)! / activeCapacity) * toPlace)
    const floored = proportions.map(v => Math.floor(v))
    const flooredSum = floored.reduce((a, b) => a + b, 0)
    const remainder = Math.max(0, Math.round(toPlace) - flooredSum)

    const byFractionDesc = proportions
      .map((v, i) => ({ i, frac: v - floored[i] }))
      .sort((a, b) => b.frac - a.frac)

    const alloc = [...floored]
    for (let k = 0; k < remainder && k < byFractionDesc.length; k++) {
      alloc[byFractionDesc[k].i]++
    }

    let overflow = 0
    active.forEach((t, i) => {
      const cap = remaining.get(t.key)!
      const give = Math.min(alloc[i], cap)
      overflow += alloc[i] - give
      result.set(t.key, result.get(t.key)! + give)
      remaining.set(t.key, cap - give)
    })

    toPlace = overflow
    active = active.filter(t => remaining.get(t.key)! > 0)
  }

  return Object.fromEntries(result)
}
