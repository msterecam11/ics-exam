import { db } from "@/lib/db"
import { getEnrollmentById, getExamRules, todayISO, type EnrollmentContext } from "@/lib/lms-enrollment"
import { enrollmentAttendance, sessionsForViewers } from "@/lib/lms-sessions"

// ── The pass rule ──────────────────────────────────────────────────────────
//
// A course either keeps the original rule — passing its final exam completes
// it — or sets a pass rule in two layers:
//
//   1. requirements: a component switched to "required" must be met
//      (exam passed, every required assignment passed, every exercise passed,
//      attendance ≥ the minimum, online modules completed);
//   2. a weighted score: the components' scores by their weights (0–100,
//      adding up to 100) must reach the course's pass mark.
//
// Components that don't exist in the course (no exercises, no class days…)
// are left out and the remaining weights are scaled up to 100.
//
// Nothing is decided early: while something can still change (days still to
// come, work not yet marked, attempts left) the result is "in progress".

export const COMPONENTS = ["exam", "assignments", "exercises", "attendance", "modules"] as const
export type ComponentKey = typeof COMPONENTS[number]
export const COMPONENT_LABEL: Record<ComponentKey, string> = {
  exam: "Final exam", assignments: "Assignments", exercises: "Exercises", attendance: "Attendance", modules: "Online modules",
}

export type ComponentRule = { weight: number; required: boolean; pass?: number; min?: number }
export type CompletionRules = { pass_mark: number; components: Partial<Record<ComponentKey, ComponentRule>> }

const int = (v: unknown, lo: number, hi: number) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null
}

/** Checks a rule an admin sends. Null clears it (back to "exam only"). */
export function readRules(raw: any): { ok: true; rules: CompletionRules | null } | { ok: false; error: string } {
  if (raw === null) return { ok: true, rules: null }
  if (!raw || typeof raw !== "object") return { ok: false, error: "Invalid rule" }
  const passMark = int(raw.pass_mark, 0, 100)
  if (passMark === null) return { ok: false, error: "The pass mark must be a whole number from 0 to 100" }
  const components: Partial<Record<ComponentKey, ComponentRule>> = {}
  let total = 0
  for (const k of COMPONENTS) {
    const c = raw.components?.[k]
    if (!c) continue
    const weight = int(c.weight, 0, 100)
    if (weight === null) return { ok: false, error: `${COMPONENT_LABEL[k]}: the weight must be a whole number from 0 to 100` }
    const rule: ComponentRule = { weight, required: c.required === true }
    if (k === "assignments" && c.pass !== undefined) {
      const p = int(c.pass, 0, 100); if (p === null) return { ok: false, error: "Assignments: the pass mark must be 0–100" }
      rule.pass = p
    }
    if (k === "attendance") {
      const m = int(c.min ?? 80, 0, 100); if (m === null) return { ok: false, error: "Attendance: the minimum must be 0–100" }
      rule.min = m
    }
    if (weight === 0 && !rule.required) continue           // not used at all
    components[k] = rule
    total += weight
  }
  if (!Object.keys(components).length) return { ok: false, error: "Use at least one component" }
  if (total !== 100 && total !== 0) return { ok: false, error: `The weights add up to ${total} — they must add up to 100` }
  return { ok: true, rules: { pass_mark: passMark, components } }
}

/** A sensible starting rule for a course of this delivery mode. */
export function defaultRules(deliveryMode: string): CompletionRules {
  if (deliveryMode === "online") return {
    pass_mark: 70,
    components: { exam: { weight: 100, required: true }, modules: { weight: 0, required: true } },
  }
  return {
    pass_mark: 70,
    components: {
      exam:        { weight: 50, required: true },
      assignments: { weight: 30, required: true, pass: 60 },
      exercises:   { weight: 10, required: true },
      attendance:  { weight: 10, required: true, min: 80 },
    },
  }
}

// ── Evaluating one enrolment ─────────────────────────────────────────────────

export type ComponentResult = {
  key: ComponentKey
  label: string
  weight: number            // after scaling to the components that exist
  required: boolean
  score: number | null      // 0–100, null = nothing to score yet
  met: boolean | null       // the requirement; null = can still change
  pending: boolean
  requirement: string | null
  detail: string            // what's done / missing, in words
}

export type PassResult = {
  mode: "rule" | "exam_only"
  components: ComponentResult[]
  score: number | null
  passMark: number | null
  passed: boolean
  pending: boolean
  /** Why it isn't passed yet (or failed), for the participant and staff. */
  reasons: string[]
}

const pct = (score: unknown, max: unknown) => (Number(max) > 0 ? Math.round((Number(score) / Number(max)) * 100) : null)
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)
/** An assignment's / exercise's share within its component (activity_settings.weight, default 1). */
const itemWeight = (m: any) => { const w = Number(m?.activity_settings?.weight); return Number.isFinite(w) && w > 0 ? w : 1 }
const wavg = (xs: { score: number; w: number }[]) => {
  const tw = xs.reduce((t, x) => t + x.w, 0)
  return tw > 0 ? Math.round(xs.reduce((t, x) => t + x.score * x.w, 0) / tw) : null
}

/** The course's rule, or null when it keeps "pass the final exam". */
export async function courseRules(courseId: string): Promise<CompletionRules | null> {
  const { data } = await db.from("lms_courses").select("completion_rules").eq("id", courseId).maybeSingle()
  const r = (data as any)?.completion_rules
  return r && typeof r === "object" && r.components ? r as CompletionRules : null
}

export async function evaluatePassRule(enrollmentOrId: string | EnrollmentContext): Promise<PassResult | null> {
  const e = typeof enrollmentOrId === "string" ? await getEnrollmentById(enrollmentOrId) : enrollmentOrId
  if (!e) return null
  const { data: courseRow } = await db.from("lms_courses").select("id, final_exam_pass_mark, completion_rules").eq("id", e.course_id).maybeSingle()
  const course = courseRow as any
  if (!course) return null
  const rules: CompletionRules | null = course.completion_rules?.components ? course.completion_rules : null

  const [{ data: mods }, { data: attempts }, { data: exResults }] = await Promise.all([
    db.from("lms_modules").select("id, title, module_type, is_mandatory, activity_settings, assignment_due_date, order_index").eq("course_id", e.course_id).order("order_index"),
    db.from("lms_module_attempts").select("module_id, score, max_score, passed, status, ai_feedback").eq("enrollment_id", e.id),
    db.from("lms_exercise_results").select("module_id, passed, score_pct").eq("enrollment_id", e.id),
  ])
  const modules = (mods ?? []) as any[]
  const atts = (attempts ?? []) as any[]
  const today = todayISO()
  const out: ComponentResult[] = []
  const reasons: string[] = []

  // ── Final exam ──
  const examMods = modules.filter(m => m.module_type === "final_exam")
  const examOf = async () => {
    const mine = atts.filter(a => examMods.some(m => m.id === a.module_id))
    const rulesE = await getExamRules(e, course, examMods[0]?.activity_settings)
    const best = mine.reduce<number | null>((b, a) => { const p = pct(a.score, a.max_score); return p !== null && (b === null || p > b) ? p : b }, null)
    const passed = mine.some(a => a.passed)
    const left = rulesE.maxAttempts - mine.length
    return { best, passed, left, passMark: rulesE.passMark, taken: mine.length }
  }

  if (!rules) {
    // The original rule: pass the final exam.
    if (!examMods.length) return { mode: "exam_only", components: [], score: null, passMark: null, passed: false, pending: true, reasons: ["This course has no final exam yet"] }
    const x = await examOf()
    const pending = !x.passed && x.left > 0
    return {
      mode: "exam_only",
      components: [{ key: "exam", label: COMPONENT_LABEL.exam, weight: 100, required: true, score: x.best, met: x.passed ? true : pending ? null : false, pending,
        requirement: `Pass (${x.passMark}%)`, detail: x.taken ? `Best ${x.best ?? 0}% · ${x.taken} attempt${x.taken === 1 ? "" : "s"}` : "Not taken yet" }],
      score: x.best, passMark: x.passMark, passed: x.passed, pending,
      reasons: x.passed ? [] : [pending ? (x.taken ? `Final exam not passed yet (${x.left} attempt${x.left === 1 ? "" : "s"} left)` : "Final exam not taken yet") : "Final exam not passed and no attempts left"],
    }
  }

  const want = (k: ComponentKey) => rules.components[k]

  if (want("exam") && examMods.length) {
    const r = want("exam")!
    const x = await examOf()
    // A required exam waits while a retake could still pass it. An exam that
    // only adds to the score waits only until it has been taken: its best
    // result counts, and a possible retake doesn't hold the decision open.
    const pending = r.required ? !x.passed && x.left > 0 : x.taken === 0 && x.left > 0
    out.push({ key: "exam", label: COMPONENT_LABEL.exam, weight: r.weight, required: r.required,
      score: x.best ?? (pending ? null : 0), met: x.passed ? true : pending ? null : false, pending,
      requirement: `Pass (${x.passMark}%)`, detail: x.taken ? `Best ${x.best ?? 0}% · ${x.taken} attempt${x.taken === 1 ? "" : "s"}` : "Not taken yet" })
    if (r.required && !x.passed) reasons.push(pending ? (x.taken ? `Final exam not passed yet (${x.left} attempt${x.left === 1 ? "" : "s"} left)` : "Final exam not taken yet") : "Final exam not passed and no attempts left")
    // A component that only adds to the score still says what it's waiting for.
    else if (!r.required && pending) reasons.push("Final exam not taken yet")
  }

  const assignMods = modules.filter(m => m.module_type === "assignment")
  if (want("assignments") && assignMods.length) {
    const r = want("assignments")!
    let pending = false, allMet = true
    const scores: { score: number; w: number }[] = []
    const notes: string[] = []
    for (const m of assignMods) {
      const mine = atts.filter(a => a.module_id === m.id)
      // Only a mark an instructor gave or confirmed counts: the AI's score on a
      // written answer is a suggestion until then.
      const graded = mine.filter(a => a.status === "released" || (a.status === "graded" && a.ai_feedback?.graded_by === "instructor"))
      const best = graded.reduce<number | null>((b, a) => { const p = pct(a.score, a.max_score); return p !== null && (b === null || p > b) ? p : b }, null)
      const passMark = Number(m.activity_settings?.pass_mark ?? r.pass ?? 60)
      const due = m.assignment_due_date ? String(m.assignment_due_date).slice(0, 10) : null
      const required = m.is_mandatory !== false
      if (best !== null) {
        scores.push({ score: best, w: itemWeight(m) })
        if (required && best < passMark) { allMet = false; notes.push(`${m.title}: ${best}% (needs ${passMark}%)`) }
      } else if (mine.length) {
        pending = true; notes.push(`${m.title}: waiting to be marked`)
      } else if (due && due < today) {
        scores.push({ score: 0, w: itemWeight(m) })
        if (required) { allMet = false; notes.push(`${m.title}: not submitted`) }
      } else {
        pending = true; notes.push(`${m.title}: not submitted yet`)
      }
    }
    const met = !allMet ? false : pending ? null : true
    out.push({ key: "assignments", label: COMPONENT_LABEL.assignments, weight: r.weight, required: r.required,
      score: pending ? wavg(scores) : wavg(scores) ?? 0, met, pending: pending && met !== false,
      requirement: "Each required assignment passed", detail: notes.length ? notes.join(" · ") : `${scores.length} marked · average ${wavg(scores) ?? 0}%` })
    if (r.required && met !== true) reasons.push(...notes)
    else if (!r.required && pending) reasons.push(...notes.filter(n => /waiting to be marked|not submitted yet/.test(n)))
  }

  const exMods = modules.filter(m => m.module_type === "exercise")
  if (want("exercises") && exMods.length) {
    const r = want("exercises")!
    const byMod = new Map(((exResults ?? []) as any[]).map(x => [x.module_id, x]))
    const scores: { score: number; w: number }[] = []
    const notes: string[] = []
    let pending = false, allMet = true
    for (const m of exMods) {
      const x = byMod.get(m.id)
      if (!x) { pending = true; notes.push(`${m.title}: not marked yet`); continue }
      scores.push({ score: x.score_pct !== null && x.score_pct !== undefined ? Number(x.score_pct) : x.passed ? 100 : 0, w: itemWeight(m) })
      if (m.is_mandatory !== false && !x.passed) { allMet = false; notes.push(`${m.title}: not passed`) }
    }
    const met = !allMet ? false : pending ? null : true
    out.push({ key: "exercises", label: COMPONENT_LABEL.exercises, weight: r.weight, required: r.required,
      score: wavg(scores), met, pending: pending && met !== false,
      requirement: "Every required exercise passed", detail: notes.length ? notes.join(" · ") : `${scores.length} passed` })
    if (r.required && met !== true) reasons.push(...notes)
    else if (!r.required && pending) reasons.push(...notes.filter(n => /not marked yet/.test(n)))
  }

  if (want("attendance")) {
    const r = want("attendance")!
    const viewer = { course_id: e.course_id, program_id: e.program_id, track_id: e.member?.track_id ?? null, group_id: e.group_id }
    const all = await sessionsForViewers<{ id: string; session_date: string }>([viewer], "id, session_date").catch(() => [])
    if (all.length) {
      const att = await enrollmentAttendance({ ...viewer, student_id: e.student_id })
      const future = all.some(s => s.session_date > today)
      const p = att.attendancePct ?? 0
      const min = r.min ?? 80
      // Final only once the last day has passed.
      const met = future ? null : p >= min
      out.push({ key: "attendance", label: COMPONENT_LABEL.attendance, weight: r.weight, required: r.required,
        score: att.attendancePct, met, pending: future,
        requirement: `At least ${min}%`, detail: `${p}% so far${future ? " · days still to come" : ""}` })
      if (r.required && met === false) reasons.push(`Attendance ${p}% (needs ${min}%)`)
      else if (r.required && future) reasons.push("Attendance: days still to come")
    }
  }

  const pkgMods = modules.filter(m => m.module_type === "package")
  if (want("modules") && pkgMods.length) {
    const r = want("modules")!
    const { data: progress } = await db.from("lms_package_progress").select("module_id, status").eq("enrollment_id", e.id)
    const done = new Set(((progress ?? []) as any[]).filter(p => p.status === "passed" || p.status === "completed").map(p => p.module_id))
    const required = pkgMods.filter(m => m.is_mandatory !== false)
    const score = Math.round((pkgMods.filter(m => done.has(m.id)).length / pkgMods.length) * 100)
    const missing = required.filter(m => !done.has(m.id))
    out.push({ key: "modules", label: COMPONENT_LABEL.modules, weight: r.weight, required: r.required,
      score, met: missing.length ? null : true, pending: missing.length > 0,
      requirement: "All required modules completed", detail: missing.length ? `${missing.length} still to complete` : "All completed" })
    if (r.required && missing.length) reasons.push(`${missing.length} online module${missing.length === 1 ? "" : "s"} still to complete`)
  }

  // Scale the weights to the components that exist.
  const weighted = out.filter(c => c.weight > 0)
  const totalW = weighted.reduce((t, c) => t + c.weight, 0)
  for (const c of out) c.weight = totalW > 0 && c.weight > 0 ? Math.round((c.weight / totalW) * 1000) / 10 : 0
  const scoreKnown = weighted.every(c => c.score !== null)
  const score = totalW > 0 && scoreKnown ? Math.round(weighted.reduce((t, c) => t + (c.score ?? 0) * c.weight, 0) / 100) : null

  const failedReq = out.some(c => c.required && c.met === false)
  const pendingAny = out.some(c => c.pending) || (totalW > 0 && !scoreKnown)
  const reqOk = out.every(c => !c.required || c.met === true)
  const scoreOk = totalW === 0 || (score !== null && score >= rules.pass_mark)
  const passed = !failedReq && !pendingAny && reqOk && scoreOk
  const pending = !passed && !failedReq && pendingAny
  if (!passed && !pending && !failedReq && !scoreOk) reasons.push(`Score ${score}% is below the pass mark (${rules.pass_mark}%)`)

  return { mode: "rule", components: out, score, passMark: rules.pass_mark, passed, pending, reasons }
}
