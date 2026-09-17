// One-off emails triggered by something that just happened, rather than by the
// daily job: EM-8 (last exam attempt left) and EM-15 (assignment to grade).
//
// Both go through sendRuleEmail, so the master switch, the program's own
// setting, test mode and the log behave exactly as they do for a reminder.

import { db } from "@/lib/db"
import { sendRuleEmail, programEmailOverrides } from "@/lib/lms-email-settings"
import { buildLastAttemptEmail, buildGradingDueEmail } from "@/lib/lms-email-templates"

/** EM-8 — they failed the final exam and have exactly one attempt left. */
export async function notifyLastAttempt(o: {
  studentId: string; courseId: string; programId: string | null
  scorePct: number; passMark: number; attemptsUsed: number; maxAttempts: number
}) {
  const [{ data: student }, { data: course }] = await Promise.all([
    db.from("lms_students").select("name, email").eq("id", o.studentId).single(),
    db.from("lms_courses").select("title").eq("id", o.courseId).single(),
  ])
  if (!student || !course) return

  // The sections they did worst on, so the nudge points somewhere useful.
  const weakTopics = await weakestTopics(o.studentId, o.courseId)

  const t = buildLastAttemptEmail({
    studentName: student.name, courseTitle: (course as any).title, courseId: o.courseId,
    scorePct: o.scorePct, passMark: o.passMark,
    attemptsUsed: o.attemptsUsed, maxAttempts: o.maxAttempts, weakTopics,
  })
  await sendRuleEmail({
    rule: "last_attempt", to: student.email, studentId: o.studentId,
    courseId: o.courseId, programId: o.programId,
    programSettings: await programEmailOverrides(o.programId), ...t,
  })
}

/** Up to four topics the student scored lowest on in their best attempt. */
async function weakestTopics(studentId: string, courseId: string): Promise<string[]> {
  try {
    const { buildCourseReport } = await import("@/lib/lms-course-report")
    const r = await buildCourseReport(studentId, courseId, { computeCohort: false })
    return (r?.topicScores ?? [])
      .filter(t => t.pct < 70)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 4)
      .map(t => `${t.topic} (${t.pct}%)`)
  } catch {
    return []
  }
}

/** EM-15 — a student submitted work that needs marking. */
export async function notifyGradingDue(o: {
  studentId: string; courseId: string; moduleTitle: string; submittedAt?: string
}) {
  try {
    const [{ data: student }, { data: course }, { data: enr }] = await Promise.all([
      db.from("lms_students").select("name").eq("id", o.studentId).single(),
      db.from("lms_courses").select("title").eq("id", o.courseId).single(),
      db.from("lms_enrollments").select("program_id, lms_programs(name)")
        .eq("student_id", o.studentId).eq("course_id", o.courseId)
        .order("enrolled_at", { ascending: false }).limit(1).maybeSingle(),
    ])
    if (!student || !course) return

    const programId = (enr as any)?.program_id ?? null
    const staff = await programStaff(programId)
    if (!staff.length) return
    const overrides = await programEmailOverrides(programId)

    for (const s of staff) {
      const t = buildGradingDueEmail({
        instructorName: s.name, studentName: (student as any).name,
        courseTitle: (course as any).title, assignmentTitle: o.moduleTitle,
        submittedAt: o.submittedAt ?? new Date().toISOString(),
        programName: (enr as any)?.lms_programs?.name ?? null,
        courseId: o.courseId, studentId: o.studentId,
      })
      await sendRuleEmail({
        rule: "grading_due", to: s.email, programId, courseId: o.courseId,
        programSettings: overrides, ...t,
      })
    }
  } catch (err) {
    console.error("[email] grading notice failed", err)
  }
}

/** The instructors on a program; nobody when the work isn't part of one. */
async function programStaff(programId: string | null): Promise<{ id: string; name: string; email: string }[]> {
  if (!programId) return []
  const { data: links } = await db.from("lms_program_instructors").select("user_id").eq("program_id", programId)
  const ids = (links ?? []).map((l: any) => l.user_id)
  if (!ids.length) return []
  const { data } = await db.from("admin_users").select("id, name, email").in("id", ids).eq("is_active", true)
  return (data ?? []) as any[]
}
