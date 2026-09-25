import { db } from "@/lib/db"
import { selectAll } from "@/lib/lms-report-cache"
import { completionRate, passRate, atRiskReasons } from "@/lib/lms-metrics"
import { evaluatePassRule } from "@/lib/lms-pass-rule"
import { canSeeTrack, type StaffScope } from "@/lib/staff-access"

// Reports home: headline numbers, "needs attention" lists and the browse
// tables, for everything the signed-in staff member may see. Built from a few
// bulk reads and the shared metric definitions, so numbers match the reports.

export type Period = "90d" | "year" | "all"
export const PERIOD_LABEL: Record<Period, string> = { "90d": "Last 90 days", year: "Last 12 months", all: "All time" }
export const parsePeriod = (v: string | null | undefined): Period => (v === "year" || v === "all" ? v : "90d")

export type AttentionKind = "behind" | "inactive" | "deadlines" | "certificates" | "feedback"
export const ATTENTION: Record<AttentionKind, { label: string; hint: string }> = {
  behind:       { label: "Behind schedule",     hint: "Behind the expected pace near the deadline, or one exam attempt left" },
  inactive:     { label: "Inactive 14+ days",   hint: "No activity for 14 days or more, or never started" },
  deadlines:    { label: "Deadlines this week", hint: "Still in progress with the end date in the next 7 days" },
  certificates: { label: "Certificates held",   hint: "Issued but not released to the student yet" },
  feedback:     { label: "Missing feedback",    hint: "Finished a course that asks for feedback, none given" },
}

export type AttentionItem = {
  enrollmentId: string; studentId: string; student: string; company: string | null
  courseId: string; course: string; programId: string | null; program: string | null
  detail: string; href: string
}

const DAY = 86_400_000
const todayISO = () => new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10)
const maxIso = (...v: (string | null | undefined)[]) => v.filter(Boolean).sort().pop() ?? null

async function inChunks<T>(ids: string[], fetch: (chunk: string[]) => Promise<T[]>, size = 200): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += size) out.push(...await fetch(ids.slice(i, i + size)))
  return out
}

export async function loadReportsHome(scope: StaffScope, period: Period) {
  const today = todayISO()
  const since = period === "all" ? null : new Date(Date.now() - (period === "year" ? 365 : 90) * DAY).toISOString()

  // Programs, courses, companies (small tables).
  const [{ data: progRows }, { data: courseRows }, { data: companyRows }] = await Promise.all([
    db.from("lms_programs").select("id, name, reference, status, company_id, is_individual, start_date, end_date, feedback_enabled"),
    db.from("lms_courses").select("id, title, delivery_mode, status, feedback_enabled"),
    db.from("lms_companies").select("id, name, code, status"),
  ])
  const programs = new Map(((progRows ?? []) as any[]).map(p => [p.id, p]))
  const courses = new Map(((courseRows ?? []) as any[]).map(c => [c.id, c]))
  const companies = new Map(((companyRows ?? []) as any[]).map(c => [c.id, c]))

  // Enrollments in scope. Instructors: only their programs and tracks.
  const all = await selectAll<any>((from, to) => {
    let q = db.from("lms_enrollments")
      .select("id, student_id, course_id, program_id, member_id, status, progress_pct, enrolled_at, completed_at, lms_program_members(track_id, status, end_date_override)")
      .order("enrolled_at")
    if (!scope.isAdmin) q = q.in("program_id", scope.programIds.length ? scope.programIds : ["00000000-0000-0000-0000-000000000000"])
    return q.range(from, to)
  })
  const enrollments = all.filter(e => {
    if (e.program_id && programs.get(e.program_id)?.status === "draft") return false
    return scope.isAdmin || canSeeTrack(scope, e.program_id, e.lms_program_members?.track_id ?? null)
  })

  // Students (names, companies) for everything in scope.
  const studentIds = [...new Set(enrollments.map(e => e.student_id))]
  const studentRows = await inChunks(studentIds, async c =>
    ((await db.from("lms_students").select("id, name, email, company_id, company").in("id", c)).data ?? []) as any[])
  const students = new Map(studentRows.map(s => [s.id, s]))

  // Final exams, attempts, program attempt rules.
  const { data: examMods } = await db.from("lms_modules").select("id, course_id, activity_settings").eq("module_type", "final_exam")
  const examByCourse = new Map<string, any>()
  for (const m of (examMods ?? []) as any[]) if (!examByCourse.has(m.course_id)) examByCourse.set(m.course_id, m)
  const examIds = [...examByCourse.values()].map(m => m.id)
  const enrollmentIds = enrollments.map(e => e.id)
  const attempts = await inChunks(enrollmentIds, async c => selectAll<any>((from, to) =>
    db.from("lms_module_attempts").select("enrollment_id, module_id, passed, started_at, submitted_at, graded_at").in("enrollment_id", c).range(from, to)))
  const examAttempts = new Map<string, any[]>()
  const anyActivity = new Map<string, string>()
  for (const a of attempts) {
    const at = a.graded_at ?? a.submitted_at ?? a.started_at
    anyActivity.set(a.enrollment_id, maxIso(anyActivity.get(a.enrollment_id), at)!)
    if (!examIds.includes(a.module_id)) continue
    if (!examAttempts.has(a.enrollment_id)) examAttempts.set(a.enrollment_id, [])
    examAttempts.get(a.enrollment_id)!.push(a)
  }
  const programIds = [...new Set(enrollments.map(e => e.program_id).filter(Boolean))] as string[]
  const { data: rules } = programIds.length
    ? await db.from("lms_program_course_rules").select("program_id, course_id, max_attempts").in("program_id", programIds)
    : { data: [] as any[] }
  const maxRule = new Map(((rules ?? []) as any[]).map(r => [`${r.program_id}:${r.course_id}`, Number(r.max_attempts)]))

  const examOf = (e: any) => {
    const mine = examAttempts.get(e.id) ?? []
    const mod = examByCourse.get(e.course_id)
    const maxAttempts = maxRule.get(`${e.program_id}:${e.course_id}`) ?? Number(mod?.activity_settings?.max_attempts ?? 3)
    return { exists: !!mod, sat: mine.length > 0, passed: mine.some(a => a.passed), attempts: mine.length, maxAttempts }
  }

  // Courses with a pass rule (onsite): the result is the rule's decision —
  // counted once decided — not the final exam's.
  const { data: ruledCourses } = await db.from("lms_courses").select("id").not("completion_rules", "is", null)
  const ruleCourses = new Set(((ruledCourses ?? []) as any[]).map(c => c.id))
  const ruleOutcome = new Map<string, { sat: boolean; passed: boolean }>()
  const toEvaluate = enrollments.filter(e => ruleCourses.has(e.course_id) && e.status !== "dropped")
  for (let i = 0; i < toEvaluate.length; i += 8)
    await Promise.all(toEvaluate.slice(i, i + 8).map(async e => {
      const r = await evaluatePassRule(e.id).catch(() => null)
      if (!r || r.mode !== "rule") return
      const passed = r.passed || e.status === "completed"
      ruleOutcome.set(e.id, { sat: passed || !r.pending, passed })
    }))
  const resultOf = (e: any) => ruleOutcome.get(e.id) ?? examOf(e)

  // Last activity for enrollments still in progress.
  const active = enrollments.filter(e => e.status === "active")
  const activeIds = active.map(e => e.id)
  const pkg = await inChunks(activeIds, async c => selectAll<any>((f, t) => db.from("lms_package_progress").select("enrollment_id, updated_at").in("enrollment_id", c).range(f, t)))
  for (const r of pkg) anyActivity.set(r.enrollment_id, maxIso(anyActivity.get(r.enrollment_id), r.updated_at)!)

  // Certificates held and feedback given.
  const certs = await inChunks(enrollmentIds, async c =>
    ((await db.from("lms_certificates").select("enrollment_id, released_at, revoked_at, visible_to_student").in("enrollment_id", c)).data ?? []) as any[])
  // "Held" means waiting to be released to the student. An internal record
  // (a partner certificate kept on file, a hidden ICS copy) is never released,
  // so it doesn't belong on this list.
  const heldCert = new Set(certs.filter(c => !c.released_at && !c.revoked_at && c.visible_to_student !== false).map(c => c.enrollment_id))
  const completedIds = enrollments.filter(e => e.status === "completed").map(e => e.id)
  const fb = await inChunks(completedIds, async c =>
    ((await db.from("lms_feedback").select("enrollment_id").in("enrollment_id", c)).data ?? []) as any[])
  const gaveFeedback = new Set(fb.map(f => f.enrollment_id))

  const openReviews = scope.isAdmin
    ? (await db.from("lms_exam_reviews").select("id", { count: "exact", head: true }).eq("status", "open")).count ?? 0
    : 0

  // ── Attention lists ────────────────────────────────────────────────────────
  const item = (e: any, detail: string): AttentionItem => {
    const s = students.get(e.student_id)
    const p = e.program_id ? programs.get(e.program_id) : null
    const inProgram = p && !p.is_individual
    return {
      enrollmentId: e.id, studentId: e.student_id, student: s?.name ?? "Student",
      company: (s?.company_id && companies.get(s.company_id)?.name) || s?.company || null,
      courseId: e.course_id, course: courses.get(e.course_id)?.title ?? "Course",
      programId: inProgram ? p.id : null, program: inProgram ? p.name : null, detail,
      href: inProgram ? `/lms-admin/reports/programs/${p.id}/students/${e.student_id}` : `/lms-admin/reports/${e.course_id}/${e.student_id}`,
    }
  }
  const lists: Record<AttentionKind, AttentionItem[]> = { behind: [], inactive: [], deadlines: [], certificates: [], feedback: [] }
  for (const e of enrollments) {
    const p = e.program_id ? programs.get(e.program_id) : null
    const member = e.lms_program_members
    if (e.status === "active" && (!p || p.status === "active") && member?.status !== "withdrawn") {
      const end = member?.end_date_override ?? p?.end_date ?? null
      const reasons = atRiskReasons({
        status: e.status, progress: Number(e.progress_pct ?? 0), lastActivity: anyActivity.get(e.id) ?? null,
        enrolledAt: e.enrolled_at, startDate: p?.start_date ?? null, endDate: end,
        // Exam-retake warnings don't apply where the exam only adds to a pass-rule score.
        exam: ruleCourses.has(e.course_id) ? null : examOf(e),
      })
      const idle = reasons.filter(r => r.startsWith("No activity") || r.startsWith("Not started"))
      const behind = reasons.filter(r => !idle.includes(r))
      if (behind.length) lists.behind.push(item(e, behind.join(" · ")))
      if (idle.length) lists.inactive.push(item(e, idle.join(" · ")))
      if (end && end >= today && end <= addDays(today, 7))
        lists.deadlines.push(item(e, `Ends ${end} · ${Math.round(Number(e.progress_pct ?? 0))}% done`))
    }
    if (heldCert.has(e.id)) lists.certificates.push(item(e, e.completed_at ? `Completed ${e.completed_at.slice(0, 10)}` : "Issued"))
    if (e.status === "completed" && !gaveFeedback.has(e.id)) {
      const asks = p ? !!p.feedback_enabled : !!courses.get(e.course_id)?.feedback_enabled
      if (asks) lists.feedback.push(item(e, e.completed_at ? `Completed ${e.completed_at.slice(0, 10)}` : "Completed"))
    }
  }

  // ── Headline numbers ───────────────────────────────────────────────────────
  const inPeriod = (iso: string | null) => !!iso && (!since || iso >= since)
  const periodExam = enrollments
    .filter(e => (examAttempts.get(e.id) ?? []).some(a => inPeriod(a.submitted_at ?? a.graded_at))
      || (ruleCourses.has(e.course_id) && e.status === "completed" && inPeriod(e.completed_at)))
    .map(e => resultOf(e))
  const kpis = {
    activePrograms: [...new Set(enrollments.map(e => e.program_id).filter(Boolean))]
      .filter(id => { const p = programs.get(id); return p?.status === "active" && !p.is_individual }).length,
    inProgress: new Set(active.filter(e => { const p = e.program_id ? programs.get(e.program_id) : null; return !p || p.status === "active" }).map(e => e.student_id)).size,
    completed: enrollments.filter(e => e.status === "completed" && inPeriod(e.completed_at)).length,
    passRate: passRate(periodExam).rate,
    passSat: periodExam.length,
  }

  // ── Browse rows ────────────────────────────────────────────────────────────
  const summarize = (rows: any[]) => ({
    learners: new Set(rows.filter(e => e.status !== "dropped").map(e => e.student_id)).size,
    completion: completionRate(rows).rate,
    pass: passRate(rows.map(resultOf)).rate,
  })
  const byKey = <K,>(key: (e: any) => K | null) => {
    const m = new Map<K, any[]>()
    for (const e of enrollments) { const k = key(e); if (k == null) continue; if (!m.has(k)) m.set(k, []); m.get(k)!.push(e) }
    return m
  }
  const isGroupProgram = (id: string | null) => !!id && !!programs.get(id) && !programs.get(id).is_individual

  const byProgram = byKey(e => (isGroupProgram(e.program_id) ? e.program_id : null))
  const programList = [...programs.values()]
    .filter(p => !p.is_individual && p.status !== "draft" && (scope.isAdmin || scope.tracksByProgram.has(p.id)))
    .map(p => ({ id: p.id, name: p.name, reference: p.reference, status: p.status, start: p.start_date, end: p.end_date,
      companyId: p.company_id, company: p.company_id ? companies.get(p.company_id)?.name ?? null : null,
      ...summarize(byProgram.get(p.id) ?? []) }))

  const companyOf = (e: any) => (isGroupProgram(e.program_id) ? programs.get(e.program_id).company_id : null)
  const byCompany = byKey(companyOf)
  const companyList = [...companies.values()]
    .map(c => ({ id: c.id, name: c.name, code: c.code, status: c.status,
      programs: programList.filter(p => p.companyId === c.id).length,
      running: programList.filter(p => p.companyId === c.id && p.status === "active").length,
      ...summarize(byCompany.get(c.id) ?? []) }))
    .filter(c => c.programs > 0 || (scope.isAdmin && c.status === "active"))

  const byCourse = byKey(e => e.course_id)
  const courseList = [...courses.values()]
    .filter(c => c.status !== "archived" && (scope.isAdmin || byCourse.has(c.id)))
    .map(c => ({ id: c.id, title: c.title, delivery: c.delivery_mode as string | null, status: c.status,
      enrolled: (byCourse.get(c.id) ?? []).filter(e => e.status !== "dropped").length, ...summarize(byCourse.get(c.id) ?? []) }))

  // Individual learners, grouped per course per enrollment month.
  const byIndividualGroup = byKey(e => (scope.isAdmin && !isGroupProgram(e.program_id) ? `${e.course_id}|${String(e.enrolled_at).slice(0, 7)}` : null))
  const individualList = [...byIndividualGroup.entries()].map(([key, rows]) => {
    const [courseId, month] = key.split("|"); const c = courses.get(courseId)
    return { key, courseId, month, course: c?.title ?? "Course", delivery: c?.delivery_mode ?? null,
      live: rows.some(e => e.status === "active"), ...summarize(rows) }
  })

  return { kpis, lists, openReviews, programList, companyList, courseList, individualList }
}
