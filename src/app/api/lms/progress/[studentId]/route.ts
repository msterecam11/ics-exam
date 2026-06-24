import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// GET /api/lms/progress/[studentId]
// Returns student info + enrolled courses (with progress) + learning paths + cohorts
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { studentId } = await params

  const { data: student, error: sErr } = await db
    .from("lms_students")
    .select("id, name, email, job_title, company, department, language, last_login, created_at")
    .eq("id", studentId)
    .single()

  if (sErr || !student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // ── Enrollments — progress_pct stored by syncEnrollmentProgress ─────────
  const { data: enrollments, error: enrErr } = await db
    .from("lms_enrollments")
    .select("id, status, enrolled_at, completed_at, progress_pct, lms_courses(id, title, status)")
    .eq("student_id", studentId)
    .order("enrolled_at", { ascending: false })

  if (enrErr) console.error("[progress] enrollments error:", enrErr.message)

  // ── Learning paths ───────────────────────────────────────────────────────
  const { data: pathMembers, error: pathErr } = await db
    .from("lms_learning_path_members")
    .select("added_at, lms_learning_paths(id, title)")
    .eq("student_id", studentId)
    .order("added_at", { ascending: false })

  if (pathErr) console.error("[progress] paths error:", pathErr.message)

  // ── Cohorts ──────────────────────────────────────────────────────────────
  const { data: cohortMembers, error: cohortErr } = await db
    .from("lms_cohort_members")
    .select("added_at, track_id, lms_cohorts(id, name, mode, start_date, end_date)")
    .eq("student_id", studentId)
    .order("added_at", { ascending: false })

  if (cohortErr) console.error("[progress] cohorts error:", cohortErr.message)

  return NextResponse.json({
    student,
    enrollments: (enrollments ?? []).map((e: any) => ({
      id:           e.id,
      status:       e.status,
      enrolled_at:  e.enrolled_at,
      completed_at: e.completed_at,
      progress_pct: e.progress_pct ?? 0,
      course:       e.lms_courses ?? null,
    })),
    learning_paths: (pathMembers ?? [])
      .filter((p: any) => p.lms_learning_paths)
      .map((p: any) => ({
        added_at:    p.added_at,
        id:          p.lms_learning_paths.id,
        title:       p.lms_learning_paths.title,
        description: p.lms_learning_paths.description ?? null,
      })),
    cohorts: (cohortMembers ?? [])
      .filter((c: any) => c.lms_cohorts)
      .map((c: any) => ({
        added_at:   c.added_at,
        track_id:   c.track_id ?? null,
        id:         c.lms_cohorts.id,
        name:       c.lms_cohorts.name,
        description: c.lms_cohorts.description ?? null,
        mode:       c.lms_cohorts.mode ?? "unified",
        start_date: c.lms_cohorts.start_date ?? null,
        end_date:   c.lms_cohorts.end_date ?? null,
      })),
  })
}
