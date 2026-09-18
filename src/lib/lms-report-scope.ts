import { db } from "@/lib/db"
import { buildGroupReport, type GroupReport } from "@/lib/lms-group-report"
import { buildCourseComparison, buildProgramReport, buildClientReport, buildStudentProgramReport, type CourseComparisonRow, type ProgramReport, type ClientReport } from "@/lib/lms-program-report"
import { cachedReport, type Cached } from "@/lib/lms-report-cache"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v)

// ── Course report scope (RP-3) ─────────────────────────────────────────────
/** month: individual learners (outside group programs) who enrolled that month, "YYYY-MM". */
export type CourseScope = { programId: string | null; trackId: string | null; allRuns: boolean; month: string | null }

export function parseCourseScope(p: { program?: string | null; track?: string | null; scope?: string | null; month?: string | null }): CourseScope {
  const programId = isUuid(p.program) ? p.program : null
  const month = !programId && typeof p.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(p.month) ? p.month : null
  return { programId, trackId: programId && isUuid(p.track) ? p.track : null, allRuns: !programId && !month && p.scope === "all", month }
}

export function courseScopeQuery(s: CourseScope) {
  return [s.programId && `program=${s.programId}`, s.trackId && `track=${s.trackId}`, s.allRuns && "scope=all", s.month && `month=${s.month}`].filter(Boolean).join("&")
}

export function loadGroupReport(courseId: string, scope: CourseScope, opts: { refresh?: boolean } = {}): Promise<Cached<GroupReport> | null> {
  const key = `group:${courseId}:${scope.programId ?? "-"}:${scope.trackId ?? "-"}:${scope.allRuns ? "all" : scope.month ? `month-${scope.month}` : "current"}`
  return cachedReport(key, "course_group", { courseId, programId: scope.programId }, () => buildGroupReport(courseId, scope), opts)
}

export function loadCourseComparison(courseId: string, opts: { refresh?: boolean } = {}): Promise<Cached<CourseComparisonRow[]> | null> {
  return cachedReport(`comparison:${courseId}`, "course_comparison", { courseId }, () => buildCourseComparison(courseId), opts)
}

/** AI expert report for a course group: per program (+track) when scoped, else the course-wide one. */
export async function loadCourseAssessment(courseId: string, scope: CourseScope): Promise<{ assessment: any; generated_at: string } | null> {
  if (scope.programId || scope.month) {
    const { data } = await db.from("lms_scoped_assessments").select("assessment, generated_at")
      .eq("scope_key", courseAssessmentKey(courseId, scope)).maybeSingle()
    return (data as any) ?? null
  }
  const { data } = await db.from("lms_course_assessments").select("assessment, generated_at").eq("course_id", courseId).maybeSingle()
  return (data as any) ?? null
}
export const courseAssessmentKey = (courseId: string, s: CourseScope) =>
  s.month ? `course_individuals:${courseId}:${s.month}` : `course_in_program:${courseId}:${s.programId}:${s.trackId ?? "-"}`

/** Programs (and their tracks) that deliver a course — for the scope picker. */
export async function courseScopeOptions(courseId: string) {
  const { data: enr } = await db.from("lms_enrollments").select("program_id").eq("course_id", courseId).not("program_id", "is", null)
  const ids = [...new Set(((enr ?? []) as any[]).map(e => e.program_id))]
  if (!ids.length) return []
  const [{ data: progs }, { data: tracks }] = await Promise.all([
    db.from("lms_programs").select("id, name, status, is_individual").in("id", ids).eq("is_individual", false).order("name"),
    db.from("lms_program_tracks").select("id, name, program_id, order_index").in("program_id", ids).order("order_index"),
  ])
  return ((progs ?? []) as any[]).map(p => ({
    id: p.id as string, name: p.name as string, status: p.status as string,
    tracks: ((tracks ?? []) as any[]).filter(t => t.program_id === p.id).map(t => ({ id: t.id as string, name: t.name as string })),
  }))
}

// ── Program / client / student-in-program (cached) ─────────────────────────

export function loadProgramReport(programId: string, trackId: string | null, opts: { refresh?: boolean } = {}): Promise<Cached<ProgramReport> | null> {
  return cachedReport(`program:${programId}:${trackId ?? "-"}`, "program", { programId }, () => buildProgramReport(programId, { trackId }), opts)
}

export function loadClientReport(companyId: string, opts: { refresh?: boolean } = {}): Promise<Cached<ClientReport> | null> {
  // Each program inside comes from its own cache, so one busy program doesn't
  // force every other one to rebuild.
  return cachedReport(`client:${companyId}`, "client", { companyId },
    () => buildClientReport(companyId, async id => (await loadProgramReport(id, null, opts))?.data ?? null), opts)
}

export function loadStudentProgramReport(programId: string, studentId: string, opts: { refresh?: boolean } = {}) {
  return cachedReport(`student:${programId}:${studentId}`, "student_in_program", { programId }, async () => buildStudentProgramReport(programId, studentId, (await loadProgramReport(programId, null, opts))?.data), opts)
}

export async function scopedAssessment(scopeKey: string): Promise<{ assessment: any; generated_at: string } | null> {
  const { data } = await db.from("lms_scoped_assessments").select("assessment, generated_at").eq("scope_key", scopeKey).maybeSingle()
  return (data as any) ?? null
}

// ── Export options (RP-15 / RP-16 / FB-8) ─────────────────────────────────
export type ExportOptions = { audience: "internal" | "client"; includeComments: boolean; includeInternal: boolean }

export function parseExportOptions(p: { audience?: string | null; comments?: string | null; internal?: string | null }): ExportOptions {
  const audience = p.audience === "client" ? "client" : "internal"
  return { audience, includeComments: audience === "client" && p.comments === "1", includeInternal: audience === "client" && p.internal === "1" }
}

export function exportQuery(o: ExportOptions) {
  return [`audience=${o.audience}`, o.includeComments && "comments=1", o.includeInternal && "internal=1"].filter(Boolean).join("&")
}

/** Staff session check shared by report APIs. */
// Step 9: admin only for now. Instructors reach reports through the scoped
// checks in staff-access.ts, which limit them to their own programs.
export const isStaffRole = (role?: string | null) => role === "admin"
