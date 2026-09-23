import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sessionIsFor, sessionToday } from "@/lib/lms-sessions"
import { loadProgramReport, loadClientReport } from "@/lib/lms-report-scope"
import { viewerProgramIds } from "@/lib/viewer-access"
import { loadEnrollmentFacts } from "@/lib/lms-program-report"

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
      items.push(await resolveCourse(row.resource_id, row, p, session.user.id))
    } else if (row.resource_type === "program") {
      const item = await resolveProgram(row.resource_id, row, p)
      if (item) items.push(item)
    } else if (row.resource_type === "company") {
      const item = await resolveCompany(row.resource_id, row, p)
      if (item) items.push(item)
    }
  }

  return NextResponse.json(items)
}

// ── Program scope (RL-9) ──────────────────────────────────────────────────────
// The same numbers as the program report, filtered by the granted permissions.
// Withdrawn students and e-mail addresses are never included.
async function resolveProgram(programId: string, row: any, p: Record<string, boolean>) {
  const cached = await loadProgramReport(programId, null)
  if (!cached) return null
  const r = cached.data
  return {
    ...(await courseBreakdown(programId, p)),
    access_id: row.id, resource_type: "program", resource_id: programId,
    label: row.label || r.program.name, permissions: p,
    program: {
      name: r.program.name,
      company: r.program.company?.name ?? null,
      company_id: r.program.company?.id ?? null,
      status: r.program.status,
      start_date: r.program.start_date, end_date: r.program.end_date,
      students: r.stats.members - r.stats.withdrawn,
      completion_rate: r.stats.completionRate,
      pass_rate: r.stats.passRate,
      certificates: r.stats.certificates,
    },
    students: r.roster.filter(x => x.status !== "withdrawn").map(x => ({
      id: x.student_id, name: x.name, email: "", company: r.program.company?.name ?? null, job_title: x.job_title,
      track: x.track,
      courses_enrolled: x.coursesTotal, courses_completed: x.coursesDone,
      progress_pct: p.progress ? x.progress : null,
      quiz_avg_score: p.scores ? x.avgScore : null,
      attendance_pct: p.attendance ? x.attendancePct : null,
      assignments: null,
      certificate: null,
      certificates_earned: p.certificates ? x.certificates : null,
      last_login: null,
    })),
  }
}

// ── The same program, course by course ────────────────────────────────────────
// "How is the Safety course going?" rather than "how is Ahmed doing?". Each
// course carries its own participants, under the track it belongs to — a course
// every track takes is filed under "All tracks" once, not repeated per track.
async function courseBreakdown(programId: string, p: Record<string, boolean>) {
  const [facts, { data: memberRows }, { data: trackRows }] = await Promise.all([
    loadEnrollmentFacts({ programId }),
    db.from("lms_program_members")
      .select("id, student_id, track_id, status, lms_students(id, name, job_title, last_login)")
      .eq("program_id", programId),
    db.from("lms_program_tracks").select("id, name, order_index").eq("program_id", programId).order("order_index"),
  ])

  const tracks = (trackRows ?? []) as any[]
  const trackOrder = new Map(tracks.map((t, i) => [t.id as string, i]))
  const members = new Map(((memberRows ?? []) as any[])
    .filter(m => m.status !== "withdrawn")
    .map(m => [m.id as string, m]))

  const live = facts.filter(f => f.status !== "dropped" && f.member_id && members.has(f.member_id))
  const courseIds = [...new Set(live.map(f => f.course_id))]
  if (!courseIds.length) return { courseGroups: [] }

  const { data: courseRows } = await db.from("lms_courses").select("id, title").in("id", courseIds)
  const titles = new Map(((courseRows ?? []) as any[]).map(c => [c.id as string, c.title as string]))

  const groups = courseIds.map(courseId => {
    const mine = live.filter(f => f.course_id === courseId)
    const trackIds = new Set(mine.map(f => members.get(f.member_id!)?.track_id ?? null))

    const students = mine.map(f => {
      const m = members.get(f.member_id!)
      const att = f.attendance
      return {
        id: f.student_id,
        // The report link opens THIS run of the course, not the whole program.
        enrollment_id: f.enrollment_id,
        name: m?.lms_students?.name ?? "Unknown",
        job_title: m?.lms_students?.job_title ?? null,
        track: m?.track_id ? tracks.find(t => t.id === m.track_id)?.name ?? null : null,
        status: f.status,
        completed_at: f.completedAt,
        progress_pct: p.progress ? Math.round(f.progress) : null,
        quiz_avg_score: p.scores ? f.exam.bestPct : null,
        attendance_pct: p.attendance && att.counted > 0 ? Math.round((att.present / att.counted) * 100) : null,
        certificate: p.certificates ? (f.certificate ? { issued: true, released: f.certificate.status === "released" } : { issued: false, released: false }) : null,
        last_login: p.last_login ? (m?.lms_students?.last_login ?? null) : null,
      }
    }).sort((a, b) => a.name.localeCompare(b.name))

    const done = mine.filter(f => f.status === "completed").length
    const scored = mine.map(f => f.exam.bestPct).filter((n): n is number => typeof n === "number")
    return {
      course_id: courseId,
      title: titles.get(courseId) ?? "Untitled course",
      // Shared by every track (or by members with no track at all) reads as one group.
      track: trackIds.size === 1 ? [...trackIds][0] : null,
      track_name: trackIds.size === 1 && [...trackIds][0]
        ? tracks.find(t => t.id === [...trackIds][0])?.name ?? null
        : null,
      order: trackIds.size === 1 && [...trackIds][0] ? (trackOrder.get([...trackIds][0] as string) ?? 99) : -1,
      students_count: mine.length,
      completion_rate: mine.length ? Math.round((done / mine.length) * 100) : null,
      certificates: p.certificates ? mine.filter(f => f.certificate).length : null,
      avg_score: p.scores && scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
      students,
    }
  }).sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))

  return { courseGroups: groups }
}

// ── Client (company) scope ────────────────────────────────────────────────────
async function resolveCompany(companyId: string, row: any, p: Record<string, boolean>) {
  const cached = await loadClientReport(companyId)
  if (!cached) return null
  const r = cached.data
  return {
    access_id: row.id, resource_type: "company", resource_id: companyId,
    label: row.label || r.company.name, permissions: p,
    company: {
      name: r.company.name,
      programs: r.totals.programs, trained: r.totals.trained,
      completion_rate: r.totals.completionRate, pass_rate: r.totals.passRate, certificates: r.totals.certificates,
    },
    programs: r.programs.map(x => ({
      id: x.id, name: x.name, status: x.status, students: x.students,
      completion_rate: x.completionRate, pass_rate: x.passRate,
    })),
    students: [],
  }
}

// ── Course scope ──────────────────────────────────────────────────────────────
async function resolveCourse(courseId: string, row: any, p: Record<string, boolean>, userId: string) {
  // A course is shared: the same course runs for several clients at once, so a
  // course grant on its own must never list every learner on it. Only learners
  // inside a program this viewer is granted (directly, or through their
  // company) are shown, plus individual learners who sit in no program at all.
  // A client whose grant is course-only therefore sees nothing until a program
  // or company grant is added — deliberately fail-closed.
  const allowedPrograms = new Set(await viewerProgramIds(userId))

  // Enrollments with student data — progress_pct and last_login are the same
  // source-of-truth columns the admin dashboard/reports read (kept in sync by
  // syncEnrollmentProgress), so the viewer sees identical numbers.
  const { data: enrollmentRows } = await db
    .from("lms_enrollments")
    .select("id, student_id, status, enrolled_at, completed_at, progress_pct, program_id, group_id, lms_program_members(track_id), lms_students(id, name, email, company, job_title, last_login)")
    .eq("course_id", courseId)
    .neq("status", "dropped")

  // Each learner's current enrollment only (a course retaken later counts once).
  const rankStatus = (s: string) => (s === "active" ? 0 : 1)
  const seen = new Set<string>()
  const enrollments = [...((enrollmentRows ?? []) as any[])]
    .filter(e => !e.program_id || allowedPrograms.has(e.program_id))
    .sort((a, b) => rankStatus(a.status) - rankStatus(b.status) || String(b.enrolled_at).localeCompare(String(a.enrolled_at)))
    .filter(e => (seen.has(e.student_id) ? false : (seen.add(e.student_id), true)))
  const enrollmentIds = enrollments.map((e: any) => e.id)

  const studentIds = enrollments.map((e: any) => e.student_id)
  if (studentIds.length === 0) {
    return { access_id: row.id, resource_type: row.resource_type, resource_id: courseId, label: row.label, permissions: p, students: [] }
  }

  // Score = the BEST final-exam attempt per student (matches the admin course
  // report's "bestExam" — not an average across every attempt/retake).
  const quizScoreByStudent: Record<string, number> = {}
  if (p.scores) {
    const { data: modAttempts } = await db
      .from("lms_module_attempts")
      .select("student_id, score, max_score")
      .in("enrollment_id", enrollmentIds)

    const best: Record<string, number> = {}
    ;(modAttempts ?? []).forEach((a: any) => {
      if (a.score == null) return
      const pct = a.max_score && a.max_score > 0 ? Math.round((a.score / a.max_score) * 100) : Math.round(a.score)
      if (best[a.student_id] === undefined || pct > best[a.student_id]) best[a.student_id] = pct
    })
    Object.assign(quizScoreByStudent, best)
  }

  // Attendance % per student
  const attendanceByStudent: Record<string, { present: number; total: number }> = {}
  if (p.attendance) {
    // Each learner is measured against the sessions of THEIR program/track for
    // this course; excused sessions don't count against them.
    const { data: sessions } = await db
      .from("lms_sessions")
      .select("id, course_id, program_id, track_id, group_id")
      .eq("course_id", courseId)
      .lte("session_date", sessionToday())   // future sessions aren't absences

    const sessionIds = (sessions ?? []).map((s: any) => s.id)
    if (sessionIds.length > 0) {
      const { data: attendance } = await db
        .from("lms_attendance")
        .select("session_id, student_id, status")
        .in("session_id", sessionIds)
        .in("student_id", studentIds)
      const statusOf = new Map(((attendance ?? []) as any[]).map(a => [`${a.session_id}|${a.student_id}`, a.status as string]))

      for (const e of enrollments as any[]) {
        const viewer = { course_id: courseId, program_id: e.program_id ?? null, track_id: e.lms_program_members?.track_id ?? null, group_id: e.group_id ?? null }
        const mine = ((sessions ?? []) as any[]).filter(s => sessionIsFor(s, viewer))
        if (!mine.length) continue
        let present = 0, excused = 0
        for (const s of mine) {
          const st = statusOf.get(`${s.id}|${e.student_id}`)
          if (st === "present" || st === "late") present++
          else if (st === "excused") excused++
        }
        attendanceByStudent[e.student_id] = { present, total: mine.length - excused }
      }
    }
  }

  // Assignment submissions per student — count directly from submissions table
  const assignmentsByStudent: Record<string, { submitted: number; graded: number }> = {}
  if (p.assignments) {
    const { data: subs } = await db
      .from("lms_assignment_submissions")
      .select("student_id, status")
      .in("enrollment_id", enrollmentIds)

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
      .in("enrollment_id", enrollmentIds)
      // A client sees the certificates their people hold — not our internal
      // records (a partner certificate kept on file, a hidden ICS copy).
      .eq("visible_to_student", true)
      .is("revoked_at", null)

    ;(certs ?? []).forEach((c: any) => {
      certByStudent[c.student_id] = {
        issued:   !!c.issued_at,
        released: !!c.released_at,
      }
    })
  }

  const students = (enrollments ?? []).map((e: any) => {
    const sid = e.student_id
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
      progress_pct:      p.progress ? Math.round(e.progress_pct ?? 0) : null,
      quiz_avg_score:    p.scores ? (quizScoreByStudent[sid] ?? null) : null,
      attendance_pct:    p.attendance && att
                           ? Math.round((att.present / att.total) * 100)
                           : null,
      assignments:       p.assignments ? (assignmentsByStudent[sid] ?? { submitted: 0, graded: 0 }) : null,
      certificate:       p.certificates ? (certByStudent[sid] ?? { issued: false, released: false }) : null,
      last_login:        p.last_login ? (e.lms_students?.last_login ?? null) : null,
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
