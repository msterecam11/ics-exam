import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { guardStaff, canSeeStudent, canSeeProgram, forbidden } from "@/lib/staff-access"

// GET /api/lms/progress/[studentId]
// Returns student info + enrolled courses (with progress)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const g = await guardStaff()
  if (!g.ok) return g.res

  const { studentId } = await params
  if (!(await canSeeStudent(g.scope, studentId))) return forbidden()

  const { data: student, error: sErr } = await db
    .from("lms_students")
    .select("id, name, email, job_title, company, department, language, last_login, created_at")
    .eq("id", studentId)
    .single()

  if (sErr || !student) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // ── Enrollments — progress_pct stored by syncEnrollmentProgress ─────────
  const { data: enrollments, error: enrErr } = await db
    .from("lms_enrollments")
    .select("id, status, enrolled_at, completed_at, progress_pct, program_id, lms_courses(id, title, status), lms_programs(id, name)")
    .eq("student_id", studentId)
    .order("enrolled_at", { ascending: false })

  if (enrErr) console.error("[progress] enrollments error:", enrErr.message)

  return NextResponse.json({
    student,
    // An instructor sees this student's courses in their own programs only.
    enrollments: (enrollments ?? []).filter((e: any) => g.scope.isAdmin || canSeeProgram(g.scope, e.program_id)).map((e: any) => ({
      id:           e.id,
      status:       e.status,
      enrolled_at:  e.enrolled_at,
      completed_at: e.completed_at,
      program:      e.lms_programs ?? null,
      progress_pct: e.progress_pct ?? 0,
      course:       e.lms_courses ?? null,
    })),
  })
}
