// Onsite phase 7 — the evaluation set and the impact questionnaire.
//
// Evaluations: each module and each instructor of the participant's group,
// rated 1–5 on a few criteria with an optional comment. Asked once the
// participant has completed the course or their group is completed. The
// course-level ratings stay in the course feedback form (lms_feedback).
//
// Impact: some months after completing (EM-21's "days", default 90) the
// participant is asked whether the course changed their work. It gives an
// impact score 0–100 of its own — it never affects completion or the
// certificate.
//
// Both are optional for the participant and switched on per course
// (evaluate_modules, evaluate_instructors, impact_enabled).

import { db } from "@/lib/db"
import type { EnrollmentContext } from "@/lib/lms-enrollment"
import { loadEmailSettings, effectiveRule } from "@/lib/lms-email-settings"

export {
  MODULE_CRITERIA, INSTRUCTOR_CRITERIA, IMPACT_RATINGS, IMPACT_TEXTS, criteriaFor, impactScore,
  type SubjectType, type EvalSubject,
} from "@/lib/lms-evaluation-questions"
import type { EvalSubject } from "@/lib/lms-evaluation-questions"

/** Every rating given must be a whole number 1–5; all criteria are required. */
export function readRatings(v: unknown, keys: readonly string[]): { ok: true; ratings: Record<string, number> } | { ok: false; error: string } {
  const src = v && typeof v === "object" ? (v as Record<string, unknown>) : {}
  const out: Record<string, number> = {}
  for (const k of keys) {
    const n = Number(src[k])
    if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: "Give every line a rating from 1 to 5" }
    out[k] = n
  }
  return { ok: true, ratings: out }
}

export const cleanText = (v: unknown, max = 2000) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

type Course = { id: string; evaluate_modules?: boolean | null; evaluate_instructors?: boolean | null; impact_enabled?: boolean | null }

/** Evaluation is asked once the course is done for them, or their group has finished. */
async function evaluationOpen(e: EnrollmentContext): Promise<boolean> {
  if (e.status === "completed") return true
  if (!e.group_id) return false
  const { data } = await db.from("lms_course_groups").select("status").eq("id", e.group_id).maybeSingle()
  return (data as any)?.status === "completed"
}

/** What this participant is asked to evaluate, and what they already did. */
export async function evaluationSubjects(e: EnrollmentContext, course: Course): Promise<EvalSubject[] | null> {
  if (!course.evaluate_modules && !course.evaluate_instructors) return null
  if (!(await evaluationOpen(e))) return null
  const subjects: EvalSubject[] = []
  if (course.evaluate_modules) {
    // Top-level teaching modules — not the exam, nor an exercise / assignment inside a module.
    const { data: mods } = await db.from("lms_modules").select("id, title, module_type, parent_module_id")
      .eq("course_id", course.id).order("order_index")
    for (const m of (mods ?? []) as any[])
      if (!m.parent_module_id && !["final_exam", "assignment", "exercise"].includes(m.module_type))
        subjects.push({ type: "module", id: m.id, title: m.title, done: false })
  }
  if (course.evaluate_instructors && e.group_id) {
    const { data: staff } = await db.from("lms_group_staff").select("user_id, admin_users(name)").eq("group_id", e.group_id).eq("role", "instructor")
    for (const s of (staff ?? []) as any[]) subjects.push({ type: "instructor", id: s.user_id, title: s.admin_users?.name ?? "Instructor", done: false })
  }
  if (!subjects.length) return null
  const { data: given } = await db.from("lms_evaluations").select("subject_type, subject_id").eq("enrollment_id", e.id)
  const done = new Set(((given ?? []) as any[]).map(g => `${g.subject_type}:${g.subject_id}`))
  return subjects.map(s => ({ ...s, done: done.has(`${s.type}:${s.id}`) }))
}

/** Days after completion before the impact questionnaire is asked (EM-21's setting for their program). */
export async function impactDelayDays(programId: string | null): Promise<number> {
  const settings = await loadEmailSettings()
  let programSettings: any = undefined
  if (programId) {
    const { data } = await db.from("lms_programs").select("email_settings").eq("id", programId).maybeSingle()
    programSettings = (data as any)?.email_settings ?? undefined
  }
  const n = Number(effectiveRule(settings, "impact_survey", programSettings).config.days)
  return Number.isFinite(n) && n > 0 ? n : 90
}

export type ImpactState = { due: false } | { due: true; answered: boolean; score: number | null; dueSince: string }

/** Is the impact questionnaire due for this enrolment (and answered yet)? */
export async function impactState(e: EnrollmentContext, course: Course, today = new Date()): Promise<ImpactState> {
  if (!course.impact_enabled || e.status !== "completed" || !e.completed_at) return { due: false }
  const days = await impactDelayDays(e.program_id ?? null)
  const dueAt = new Date(new Date(e.completed_at).getTime() + days * 86_400_000)
  if (today < dueAt) return { due: false }
  const { data } = await db.from("lms_impact_responses").select("impact_score").eq("enrollment_id", e.id).maybeSingle()
  return { due: true, answered: !!data, score: (data as any)?.impact_score ?? null, dueSince: dueAt.toISOString().slice(0, 10) }
}
