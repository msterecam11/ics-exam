import { db } from "@/lib/db"
import { getEnrollmentById, getExamRules, type EnrollmentContext } from "@/lib/lms-enrollment"

// ── Feedback (Step 6: FB-1 … FB-6) ────────────────────────────────────────
//
// FB-1  Settings come from the PROGRAM (on/off, mandatory, anonymous). Courses
//       keep their own settings only for enrollments outside any program.
// FB-2  Asked when the course is completed, OR when the student has used every
//       final-exam attempt without passing.
// FB-3  Mandatory: the certificate is still issued/released as normal, but can
//       only be downloaded once the student has answered.
// FB-4  Questions: 5 ratings (+ Instructor when the program has instructors or
//       classes), would-recommend, "what went well", "what should we improve".
// FB-5  End-of-program survey once a student has completed all their courses.
// FB-6  Anonymous means names are never shown anywhere. Group breakdowns shared
//       outside the institute need at least FEEDBACK_MIN_GROUP responses.

export { FEEDBACK_MIN_GROUP } from "@/lib/lms-report-shared"
export const RECOMMEND_VALUES = ["yes", "maybe", "no"] as const
export type Recommend = (typeof RECOMMEND_VALUES)[number]
const MAX_TEXT = 2000

export type FeedbackSettings = { enabled: boolean; mandatory: boolean; anonymous: boolean; source: "program" | "course" }
export type AskedReason = "completed" | "attempts_exhausted"

export type FeedbackState = {
  settings: FeedbackSettings
  /** Why the student is (or would be) asked; null = not yet. */
  reason: AskedReason | null
  submitted: boolean
  /** Enabled, reason reached, not answered yet. */
  due: boolean
  /** Show the Instructor rating (program has instructors or class sessions). */
  askInstructor: boolean
}

type EnrollmentLike = Pick<EnrollmentContext, "id" | "course_id" | "status" | "program_id" | "member"> & { program?: EnrollmentContext["program"] }

export async function feedbackSettings(e: Pick<EnrollmentLike, "course_id" | "program_id">): Promise<FeedbackSettings> {
  if (e.program_id) {
    const { data } = await db.from("lms_programs").select("feedback_enabled, feedback_mandatory, feedback_anonymous").eq("id", e.program_id).maybeSingle()
    if (data) {
      const p = data as any
      return { enabled: !!p.feedback_enabled, mandatory: !!p.feedback_enabled && !!p.feedback_mandatory, anonymous: !!p.feedback_anonymous, source: "program" }
    }
  }
  const { data } = await db.from("lms_courses").select("feedback_enabled, feedback_mandatory, feedback_anonymous").eq("id", e.course_id).maybeSingle()
  const c = (data ?? {}) as any
  return { enabled: !!c.feedback_enabled, mandatory: !!c.feedback_enabled && !!c.feedback_mandatory, anonymous: !!c.feedback_anonymous, source: "course" }
}

/** Every final exam in the course used up without a pass (FB-2). */
export async function examAttemptsExhausted(e: EnrollmentLike): Promise<boolean> {
  const { data: exams } = await db.from("lms_modules").select("id, activity_settings").eq("course_id", e.course_id).eq("module_type", "final_exam")
  if (!exams?.length) return false
  const { data: course } = await db.from("lms_courses").select("final_exam_pass_mark").eq("id", e.course_id).maybeSingle()
  const { data: attempts } = await db.from("lms_module_attempts").select("module_id, passed").eq("enrollment_id", e.id).in("module_id", (exams as any[]).map(x => x.id))
  const rows = (attempts ?? []) as any[]
  for (const exam of exams as any[]) {
    const mine = rows.filter(a => a.module_id === exam.id)
    if (mine.some(a => a.passed)) continue
    const { maxAttempts } = await getExamRules(e as any, course as any, exam.activity_settings)
    if (mine.length >= maxAttempts && mine.length > 0) return true
  }
  return false
}

async function programAsksInstructor(programId: string | null, courseId?: string): Promise<boolean> {
  if (!programId) return false
  const { count: instructors } = await db.from("lms_program_instructors").select("*", { count: "exact", head: true }).eq("program_id", programId)
  if ((instructors ?? 0) > 0) return true
  let q = db.from("lms_sessions").select("*", { count: "exact", head: true }).eq("program_id", programId)
  if (courseId) q = q.eq("course_id", courseId)
  const { count: sessions } = await q
  return (sessions ?? 0) > 0
}

export async function getFeedbackState(e: EnrollmentLike): Promise<FeedbackState> {
  const settings = await feedbackSettings(e)
  const [{ data: existing }, exhausted, askInstructor] = await Promise.all([
    db.from("lms_feedback").select("id").eq("enrollment_id", e.id).maybeSingle(),
    e.status === "completed" ? Promise.resolve(false) : examAttemptsExhausted(e),
    programAsksInstructor(e.program_id, e.course_id),
  ])
  const reason: AskedReason | null = e.status === "completed" ? "completed" : exhausted ? "attempts_exhausted" : null
  const submitted = !!existing
  return { settings, reason, submitted, due: settings.enabled && !!reason && !submitted, askInstructor }
}

/**
 * FB-3: true when this enrollment's certificate may not be downloaded yet
 * because mandatory feedback hasn't been given.
 */
export async function certificateNeedsFeedback(enrollmentId: string | null | undefined): Promise<boolean> {
  if (!enrollmentId) return false
  const e = await getEnrollmentById(enrollmentId)
  if (!e) return false
  const settings = await feedbackSettings(e)
  if (!settings.mandatory) return false
  const { data } = await db.from("lms_feedback").select("id").eq("enrollment_id", enrollmentId).maybeSingle()
  return !data
}

// ── Reading stored feedback ───────────────────────────────────────────────

export type FeedbackRatings = {
  overall: number | null; content: number | null; platform: number | null
  pace: number | null; materials: number | null; instructor: number | null
}

const num = (v: unknown) => { const n = Number(v); return v === null || v === undefined || !Number.isFinite(n) ? null : n }

/**
 * Ratings of one lms_feedback row. Rows from the original form (version 1)
 * stored the PLATFORM rating in rating_instructor — reports used to show it as
 * an "Instructor" rating. Rows are never rewritten; they are read correctly here.
 */
export function readFeedbackRatings(row: any): FeedbackRatings {
  const v2 = Number(row?.form_version) >= 2
  return {
    overall:    num(row?.rating_overall),
    content:    num(row?.rating_content),
    platform:   v2 ? num(row?.rating_platform) : num(row?.rating_instructor),
    pace:       num(row?.rating_pace),
    materials:  num(row?.rating_materials),
    instructor: v2 ? num(row?.rating_instructor) : null,
  }
}

export const FEEDBACK_ROW_COLUMNS =
  "id, form_version, rating_overall, rating_content, rating_platform, rating_instructor, rating_pace, rating_materials, recommend, comments, comment_went_well, comment_improve, is_anonymous, asked_reason, submitted_at, enrollment_id, program_id, student_id, course_id"

export const COURSE_RATING_LABELS: [keyof FeedbackRatings, string][] = [
  ["overall", "Overall"], ["content", "Content"], ["platform", "Platform"],
  ["pace", "Pace"], ["materials", "Materials"], ["instructor", "Instructor"],
]

/** Comments of a row (original single box, or the two new boxes). */
export function readFeedbackComments(row: any): { wentWell: string | null; improve: string | null; general: string | null } {
  const t = (s: unknown) => (typeof s === "string" && s.trim() ? s.trim() : null)
  return { wentWell: t(row?.comment_went_well), improve: t(row?.comment_improve), general: t(row?.comments) }
}

// ── Validation of a submitted form ────────────────────────────────────────

export function parseRating(v: unknown, field: string, required = false): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v === undefined || v === null || v === "" || v === 0) {
    return required ? { ok: false, error: `${field} rating is required` } : { ok: true, value: null }
  }
  const n = Number(v)
  if (!Number.isInteger(n) || n < 1 || n > 5) return { ok: false, error: `${field} rating must be 1 to 5` }
  return { ok: true, value: n }
}

export function parseRecommend(v: unknown): { ok: true; value: Recommend | null } | { ok: false; error: string } {
  if (v === undefined || v === null || v === "") return { ok: true, value: null }
  return (RECOMMEND_VALUES as readonly string[]).includes(String(v)) ? { ok: true, value: v as Recommend } : { ok: false, error: "Invalid recommendation" }
}

export function parseText(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_TEXT) : null
}

// ── End-of-program survey (FB-5) ──────────────────────────────────────────

export type ProgramSurveyState = {
  enabled: boolean
  anonymous: boolean
  /** Every course the member takes is completed. */
  eligible: boolean
  submitted: boolean
  due: boolean
  askInstructor: boolean
}

export async function getProgramSurveyState(memberId: string): Promise<ProgramSurveyState | null> {
  const { data: m } = await db
    .from("lms_program_members")
    .select("id, program_id, status, lms_programs(feedback_enabled, feedback_anonymous, is_individual, status)")
    .eq("id", memberId).maybeSingle()
  if (!m) return null
  const member = m as any
  const p = member.lms_programs
  // Individual enrollments are single courses — their course feedback is enough.
  const enabled = !!p?.feedback_enabled && !p?.is_individual && p?.status !== "draft"
  const [{ data: runs }, { data: existing }, askInstructor] = await Promise.all([
    db.from("lms_enrollments").select("status").eq("member_id", memberId).neq("status", "dropped"),
    db.from("lms_program_feedback").select("id").eq("member_id", memberId).maybeSingle(),
    programAsksInstructor(member.program_id),
  ])
  const list = (runs ?? []) as any[]
  const eligible = member.status !== "withdrawn" && list.length > 0 && list.every(r => r.status === "completed")
  const submitted = !!existing
  return { enabled, anonymous: !!p?.feedback_anonymous, eligible, submitted, due: enabled && eligible && !submitted, askInstructor }
}
