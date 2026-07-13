// Manual Score distribution algorithm — pure, no DB access.
//
// Given a candidate's real answers and an admin-entered target overall
// percentage, decides which answers/points need to change so the new total
// matches the target exactly whenever mathematically possible, respecting
// each question type's real scoring rules:
//
//   - mcq_single is strictly binary in real scoring (full marks or zero) —
//     there is no naturally "partial" outcome for it, so flipping one is a
//     real state change, done only when necessary.
//   - mcq_multi, ordering, matching, open_ended all already support genuine
//     partial credit as a normal outcome, so they can be fine-tuned to any
//     value in [0, max] without fabricating anything implausible.
//
// Correctness comes first: which specific binary questions get flipped is
// decided by an exact subset-sum search over the WHOLE paper (not an
// independent per-topic approximation, which can drift significantly from
// the true target with no way to correct itself — a candidate's overall
// score must land on the requested number whenever any question at all can
// absorb a fractional remainder, and land on the true closest achievable
// value otherwise, never an approximation that happens to be a topic-by-
// topic coincidence). Flexible-type questions handle the remaining
// fractional amount, proportional to their own weight, since they can take
// any value in [0, max] with no accuracy trade-off at all.
//
// Only when the candidate's entire paper is mcq_single is an arbitrary
// target potentially unreachable — in that case the mathematically closest
// achievable value is returned with is_exact_match: false, never silently
// claiming a number that wasn't actually reached.

export type ManualScoreQuestionType = "mcq_single" | "mcq_multi" | "ordering" | "matching" | "open_ended"

export interface AnswerForManualScore {
  candidate_answer_id: string
  type: ManualScoreQuestionType
  max_score: number
  achieved_score: number
  topic: string
}

export interface ManualScoreOverride {
  candidate_answer_id: string
  original_score_achieved: number
  manual_score_achieved: number
}

export interface ManualScoreResult {
  target_score: number
  achieved_score: number
  is_exact_match: boolean
  is_identical_to_original: boolean
  overrides: ManualScoreOverride[]
}

const FLEXIBLE_TYPES = new Set<ManualScoreQuestionType>(["mcq_multi", "ordering", "matching", "open_ended"])
const EPSILON = 0.005
const CENTS = 100 // scores are stored with 2 decimal places — work in integer cents for exact subset-sum

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

// Exact 0/1 subset-sum via DP over integer cents: finds the achievable sum
// (from any subset of `weights`) closest to `targetCents`, and which items
// make it up. O(n * cap) — comfortably fast for any realistic exam size
// (cap is bounded by the paper's own total point value in cents).
function closestSubsetSum(weightsCents: number[], targetCents: number): { sum: number; subset: boolean[] } {
  const n = weightsCents.length
  const cap = weightsCents.reduce((s, w) => s + w, 0)
  if (cap === 0 || n === 0) return { sum: 0, subset: weightsCents.map(() => false) }

  // reachable[s] = true if sum s is achievable from items processed so far.
  // cameFrom[s] = index of the item whose inclusion first made s reachable
  // (0/1 knapsack: iterate sums downward per item so none is used twice).
  const reachable = new Uint8Array(cap + 1)
  const cameFromItem = new Int32Array(cap + 1).fill(-1)
  const cameFromSum = new Int32Array(cap + 1).fill(-1)
  reachable[0] = 1

  for (let i = 0; i < n; i++) {
    const w = weightsCents[i]
    if (w <= 0) continue
    for (let s = cap; s >= w; s--) {
      if (reachable[s - w] && !reachable[s]) {
        reachable[s] = 1
        cameFromItem[s] = i
        cameFromSum[s] = s - w
      }
    }
  }

  let bestSum = 0
  let bestDiff = Infinity
  for (let s = 0; s <= cap; s++) {
    if (!reachable[s]) continue
    const diff = Math.abs(s - targetCents)
    if (diff < bestDiff) { bestDiff = diff; bestSum = s }
  }

  const subset = weightsCents.map(() => false)
  let s = bestSum
  while (s > 0 && cameFromItem[s] !== -1) {
    subset[cameFromItem[s]] = true
    s = cameFromSum[s]
  }

  return { sum: bestSum / CENTS, subset }
}

// Proportionally fills `target` points across a set of flexible-type
// questions, each bounded by its own max — a waterfall allocation so
// clamping against any single question's max never loses points, they just
// flow to whichever other questions still have room.
function distributeFlexible(
  flexible: AnswerForManualScore[],
  target: number,
  newScores: Map<string, number>
) {
  if (flexible.length === 0) return
  const totalMax = flexible.reduce((s, a) => s + a.max_score, 0)
  if (totalMax <= 0) return
  target = clamp(target, 0, totalMax)

  // Accumulate in full floating-point precision — rounding to 2 decimals
  // inside this loop can make a tiny remaining amount round down to exactly
  // zero progress every iteration, which never satisfies the loop's exit
  // condition: a genuine infinite loop. Rounding only happens once, at the
  // very end, when writing the final values.
  const alloc = new Map(flexible.map(a => [a.candidate_answer_id, 0]))
  const room = new Map(flexible.map(a => [a.candidate_answer_id, a.max_score]))
  let remaining = target
  let items = [...flexible]
  let guard = 0

  while (remaining > EPSILON && items.length > 0 && guard < 100) {
    guard++
    const totalRoom = items.reduce((s, a) => s + room.get(a.candidate_answer_id)!, 0)
    if (totalRoom <= EPSILON) break
    const nextItems: AnswerForManualScore[] = []
    let allocatedThisRound = 0
    for (const a of items) {
      const r = room.get(a.candidate_answer_id)!
      const share = Math.min(r, (r / totalRoom) * remaining)
      alloc.set(a.candidate_answer_id, alloc.get(a.candidate_answer_id)! + share)
      room.set(a.candidate_answer_id, r - share)
      allocatedThisRound += share
      if (room.get(a.candidate_answer_id)! > EPSILON) nextItems.push(a)
    }
    remaining -= allocatedThisRound
    items = nextItems
    if (allocatedThisRound < EPSILON) break // no progress this round — bail rather than spin
  }

  if (Math.abs(remaining) >= EPSILON) {
    const first = flexible[0]
    const cur = alloc.get(first.candidate_answer_id)!
    alloc.set(first.candidate_answer_id, clamp(cur + remaining, 0, first.max_score))
  }

  // Round to cents via largest-remainder so the SUM of the rounded values
  // exactly matches `target` (to the cent). Rounding each item's float
  // allocation independently can drift the total a few cents away from the
  // target even though each individual rounding looks correct in isolation —
  // the classic apportionment problem.
  const targetCents = Math.round(target * CENTS)
  const flooredCents = flexible.map(a => Math.floor(alloc.get(a.candidate_answer_id)! * CENTS))
  const flooredSum = flooredCents.reduce((s, v) => s + v, 0)
  const remainderCents = Math.max(0, targetCents - flooredSum)

  const order = flexible
    .map((a, i) => ({ i, frac: alloc.get(a.candidate_answer_id)! * CENTS - flooredCents[i] }))
    .sort((a, b) => b.frac - a.frac)

  const finalCents = [...flooredCents]
  for (let k = 0; k < remainderCents && k < order.length; k++) finalCents[order[k].i]++

  flexible.forEach((a, i) => {
    const maxCents = Math.round(a.max_score * CENTS)
    newScores.set(a.candidate_answer_id, Math.min(finalCents[i], maxCents) / CENTS)
  })
}

export function computeManualScore(
  answers: AnswerForManualScore[],
  targetPct: number
): ManualScoreResult {
  targetPct = clamp(round2(targetPct), 0, 100)

  const totalMax = answers.reduce((s, a) => s + a.max_score, 0)
  const realAchieved = round2(answers.reduce((s, a) => s + a.achieved_score, 0))
  const realPct = totalMax > 0 ? round2((realAchieved / totalMax) * 100) : 0

  // Exact rule: manual target equal to the real score changes nothing at all.
  if (totalMax <= 0 || Math.abs(targetPct - realPct) < EPSILON) {
    return {
      target_score: targetPct,
      achieved_score: realPct,
      is_exact_match: true,
      is_identical_to_original: true,
      overrides: [],
    }
  }

  const targetAchieved = round2((targetPct / 100) * totalMax)

  const flexible = answers.filter(a => FLEXIBLE_TYPES.has(a.type))
  const binary = answers.filter(a => a.type === "mcq_single")
  const flexibleMax = flexible.reduce((s, a) => s + a.max_score, 0)
  const binaryMax = binary.reduce((s, a) => s + a.max_score, 0)

  const newScores = new Map<string, number>(answers.map(a => [a.candidate_answer_id, a.achieved_score]))

  // Decide the ideal split between binary and flexible contributions,
  // preserving the candidate's real relative balance between the two
  // groups where possible — then clamp so each group only ever needs to
  // supply what it's actually capable of, letting the other group take up
  // the exact remainder.
  const realBinaryEarned = binary.reduce((s, a) => s + a.achieved_score, 0)
  const realFlexibleEarned = flexible.reduce((s, a) => s + a.achieved_score, 0)
  const scale = realAchieved > 0 ? targetAchieved / realAchieved : null

  let binaryIdealTarget = scale !== null
    ? realBinaryEarned * scale
    : (binaryMax / totalMax) * targetAchieved
  binaryIdealTarget = clamp(binaryIdealTarget, 0, binaryMax)

  // Exact subset-sum search across every mcq_single question in the whole
  // paper — this is what guarantees the true closest achievable value
  // rather than an independent per-topic approximation that can drift far
  // from the target with nothing to correct it.
  let binaryRealizedSum = 0
  if (binary.length > 0) {
    const weightsCents = binary.map(a => Math.round(a.max_score * CENTS))
    const { sum, subset } = closestSubsetSum(weightsCents, Math.round(binaryIdealTarget * CENTS))
    binaryRealizedSum = sum
    binary.forEach((a, i) => newScores.set(a.candidate_answer_id, subset[i] ? a.max_score : 0))
  }

  // Flexible questions absorb whatever remains of the true target after the
  // binary subset-sum result — exact whenever any flexible question exists,
  // since it can take any value in [0, max].
  const flexibleRemainder = clamp(targetAchieved - binaryRealizedSum, 0, flexibleMax)
  distributeFlexible(flexible, flexibleRemainder, newScores)

  const realizedTotal = round2([...newScores.values()].reduce((s, v) => s + v, 0))
  const achievedPct = round2((realizedTotal / totalMax) * 100)
  const isExact = Math.abs(achievedPct - targetPct) < EPSILON

  const overrides: ManualScoreOverride[] = []
  for (const a of answers) {
    const newVal = newScores.get(a.candidate_answer_id)!
    if (Math.abs(newVal - a.achieved_score) >= EPSILON) {
      overrides.push({
        candidate_answer_id: a.candidate_answer_id,
        original_score_achieved: a.achieved_score,
        manual_score_achieved: newVal,
      })
    }
  }

  return {
    target_score: targetPct,
    achieved_score: achievedPct,
    is_exact_match: isExact,
    is_identical_to_original: false,
    overrides,
  }
}
