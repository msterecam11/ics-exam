import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  if (role !== "viewer" && role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: accessRows, error: accessErr } = await db
    .from("viewer_access")
    .select("id, resource_type, resource_id, label, permissions")
    .eq("user_id", session.user.id)
    .eq("system", "lms")

  if (accessErr) return NextResponse.json({ error: accessErr.message }, { status: 500 })
  if (!accessRows || accessRows.length === 0) return NextResponse.json([])

  const items: any[] = []

  for (const row of accessRows) {
    const p: Record<string, boolean> = row.permissions ?? {}

    if (row.resource_type === "course") {
      items.push(await resolveCourse(row.resource_id, row, p))
    } else if (row.resource_type === "cohort") {
      items.push(await resolveCohort(row.resource_id, row, p))
    }
  }

  return NextResponse.json(items)
}

// ── Course scope ──────────────────────────────────────────────────────────────
async function resolveCourse(courseId: string, row: any, p: Record<string, boolean>) {
  // Enrollments with student data
  const { data: enrollments } = await db
    .from("lms_enrollments")
    .select("id, student_id, status, enrolled_at, completed_at, lms_students(id, name, email, company, job_title)")
    .eq("course_id", courseId)
    .neq("status", "dropped")

  const studentIds = (enrollments ?? []).map((e: any) => e.student_id)
  if (studentIds.length === 0) {
    return { access_id: row.id, resource_type: row.resource_type, resource_id: courseId, label: row.label, permissions: p, students: [] }
  }

  // Total content items in course (for progress %)
  let totalItems = 0
  if (p.progress) {
    const { data: modules } = await db
      .from("lms_modules")
      .select("id")
      .eq("course_id", courseId)

    const moduleIds = (modules ?? []).map((m: any) => m.id)
    if (moduleIds.length > 0) {
      const { count } = await db
        .from("lms_content_items")
        .select("*", { count: "exact", head: true })
        .in("module_id", moduleIds)
      totalItems = count ?? 0
    }
  }

  // Completed content items per student
  const completedByStudent: Record<string, number> = {}
  if (p.progress && totalItems > 0) {
    const { data: progressRows } = await db
      .from("lms_progress")
      .select("student_id")
      .eq("course_id", courseId)
      .in("student_id", studentIds)
      .eq("status", "completed")

    ;(progressRows ?? []).forEach((pr: any) => {
      completedByStudent[pr.student_id] = (completedByStudent[pr.student_id] ?? 0) + 1
    })
  }

  // Avg score per student — combines quiz attempts + module (exam) attempts
  const quizScoreByStudent: Record<string, number> = {}
  if (p.scores) {
    const sums: Record<string, { total: number; count: number }> = {}

    const addPct = (sid: string, score: number | null, max: number | null) => {
      if (score == null) return
      const pct = max && max > 0 ? Math.round((score / max) * 100) : score
      if (!sums[sid]) sums[sid] = { total: 0, count: 0 }
      sums[sid].total += pct
      sums[sid].count += 1
    }

    // 1. Quiz attempts (lms_quiz_attempts → lms_quizzes.course_id)
    const { data: courseQuizzes } = await db
      .from("lms_quizzes")
      .select("id")
      .eq("course_id", courseId)

    const quizIds = (courseQuizzes ?? []).map((q: any) => q.id)
    if (quizIds.length > 0) {
      const { data: quizAttempts } = await db
        .from("lms_quiz_attempts")
        .select("student_id, score, total_score")
        .in("quiz_id", quizIds)
        .in("student_id", studentIds)
      ;(quizAttempts ?? []).forEach((a: any) => addPct(a.student_id, a.score, a.total_score))
    }

    // 2. Module (final exam) attempts — column is max_score not total_score
    const { data: modAttempts } = await db
      .from("lms_module_attempts")
      .select("student_id, score, max_score")
      .eq("course_id", courseId)
      .in("student_id", studentIds)
    ;(modAttempts ?? []).forEach((a: any) => addPct(a.student_id, a.score, a.max_score))

    Object.entries(sums).forEach(([sid, { total, count }]) => {
      quizScoreByStudent[sid] = Math.round(total / count)
    })
  }

  // Attendance % per student
  const attendanceByStudent: Record<string, { present: number; total: number }> = {}
  if (p.attendance) {
    const { data: sessions } = await db
      .from("lms_sessions")
      .select("id")
      .eq("course_id", courseId)

    const sessionIds = (sessions ?? []).map((s: any) => s.id)
    if (sessionIds.length > 0) {
      const { data: attendance } = await db
        .from("lms_attendance")
        .select("student_id, status")
        .in("session_id", sessionIds)
        .in("student_id", studentIds)

      ;(attendance ?? []).forEach((a: any) => {
        if (!attendanceByStudent[a.student_id])
          attendanceByStudent[a.student_id] = { present: 0, total: 0 }
        attendanceByStudent[a.student_id].total += 1
        if (a.status === "present" || a.status === "late")
          attendanceByStudent[a.student_id].present += 1
      })
    }
  }

  // Assignment submissions per student — count directly from submissions table
  const assignmentsByStudent: Record<string, { submitted: number; graded: number }> = {}
  if (p.assignments) {
    const { data: subs } = await db
      .from("lms_assignment_submissions")
      .select("student_id, status")
      .eq("course_id", courseId)
      .in("student_id", studentIds)

    ;(subs ?? []).forEach((s: any) => {
      if (!assignmentsByStudent[s.student_id])
        assignmentsByStudent[s.student_id] = { submitted: 0, graded: 0 }
      assignmentsByStudent[s.student_id].submitted += 1
      if (s.status === "graded") assignmentsByStudent[s.student_id].graded += 1
    })
  }

  // Certificates per student
  const certByStudent: Record<string, { issued: boolean; released: boolean }> = {}
  if (p.certificates) {
    const { data: certs } = await db
      .from("lms_certificates")
      .select("student_id, issued_at, released_at")
      .eq("course_id", courseId)
      .in("student_id", studentIds)

    ;(certs ?? []).forEach((c: any) => {
      certByStudent[c.student_id] = {
        issued:   !!c.issued_at,
        released: !!c.released_at,
      }
    })
  }

  const students = (enrollments ?? []).map((e: any) => {
    const sid = e.student_id
    const completed = completedByStudent[sid] ?? 0
    const progressPct = totalItems > 0 ? Math.min(100, Math.round((completed / totalItems) * 100)) : null
    const att = attendanceByStudent[sid]

    return {
      id:                e.lms_students?.id ?? sid,
      name:              e.lms_students?.name ?? "Unknown",
      email:             e.lms_students?.email ?? "",
      company:           e.lms_students?.company ?? null,
      job_title:         e.lms_students?.job_title ?? null,
      enrollment_status: e.status,
      enrolled_at:       e.enrolled_at,
      completed_at:      e.completed_at,
      progress_pct:      p.progress ? progressPct : null,
      quiz_avg_score:    p.scores ? (quizScoreByStudent[sid] ?? null) : null,
      attendance_pct:    p.attendance && att
                           ? Math.round((att.present / att.total) * 100)
                           : null,
      assignments:       p.assignments ? (assignmentsByStudent[sid] ?? { submitted: 0, graded: 0 }) : null,
      certificate:       p.certificates ? (certByStudent[sid] ?? { issued: false, released: false }) : null,
    }
  })

  return {
    access_id:     row.id,
    resource_type: row.resource_type,
    resource_id:   courseId,
    label:         row.label ?? "",
    permissions:   p,
    students,
  }
}

// ── Cohort scope ──────────────────────────────────────────────────────────────
async function resolveCohort(cohortId: string, row: any, p: Record<string, boolean>) {
  const { data: members } = await db
    .from("lms_cohort_members")
    .select("student_id, lms_students(id, name, email, company, job_title)")
    .eq("cohort_id", cohortId)

  const studentIds = (members ?? []).map((m: any) => m.student_id)
  if (studentIds.length === 0) {
    return { access_id: row.id, resource_type: row.resource_type, resource_id: cohortId, label: row.label, permissions: p, students: [] }
  }

  // All enrollments for cohort members
  const { data: enrollments } = await db
    .from("lms_enrollments")
    .select("student_id, course_id, status, completed_at")
    .in("student_id", studentIds)
    .neq("status", "dropped")

  // Aggregate per student
  const byStudent: Record<string, { enrolled: number; completed: number }> = {}
  ;(enrollments ?? []).forEach((e: any) => {
    if (!byStudent[e.student_id]) byStudent[e.student_id] = { enrolled: 0, completed: 0 }
    byStudent[e.student_id].enrolled += 1
    if (e.status === "completed" || e.completed_at) byStudent[e.student_id].completed += 1
  })

  // Progress across all their courses (if permission)
  const progressByStudent: Record<string, number> = {}
  if (p.progress && studentIds.length > 0) {
    const { data: progressRows } = await db
      .from("lms_progress")
      .select("student_id, status")
      .in("student_id", studentIds)

    const counts: Record<string, { done: number; total: number }> = {}
    ;(progressRows ?? []).forEach((pr: any) => {
      if (!counts[pr.student_id]) counts[pr.student_id] = { done: 0, total: 0 }
      counts[pr.student_id].total += 1
      if (pr.status === "completed") counts[pr.student_id].done += 1
    })
    Object.entries(counts).forEach(([sid, { done, total }]) => {
      progressByStudent[sid] = total > 0 ? Math.round((done / total) * 100) : 0
    })
  }

  // Certificates
  const certCountByStudent: Record<string, number> = {}
  if (p.certificates) {
    const { data: certs } = await db
      .from("lms_certificates")
      .select("student_id")
      .in("student_id", studentIds)
      .not("released_at", "is", null)

    ;(certs ?? []).forEach((c: any) => {
      certCountByStudent[c.student_id] = (certCountByStudent[c.student_id] ?? 0) + 1
    })
  }

  const students = (members ?? []).map((m: any) => {
    const sid = m.student_id
    const agg = byStudent[sid] ?? { enrolled: 0, completed: 0 }

    return {
      id:                m.lms_students?.id ?? sid,
      name:              m.lms_students?.name ?? "Unknown",
      email:             m.lms_students?.email ?? "",
      company:           m.lms_students?.company ?? null,
      job_title:         m.lms_students?.job_title ?? null,
      courses_enrolled:  agg.enrolled,
      courses_completed: agg.completed,
      progress_pct:      p.progress ? (progressByStudent[sid] ?? 0) : null,
      certificates_earned: p.certificates ? (certCountByStudent[sid] ?? 0) : null,
    }
  })

  return {
    access_id:     row.id,
    resource_type: row.resource_type,
    resource_id:   cohortId,
    label:         row.label ?? "",
    permissions:   p,
    students,
  }
}
