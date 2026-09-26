import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import CoursesTabs, { type CourseRow } from "./CoursesTabs"
import { ENROLLMENT_ACCESS_COLUMNS, currentVisible, getCourseLocks } from "@/lib/lms-enrollment"
import { daysUntil, deadlineLevel } from "@/lib/lms-student-portal"

export default async function MyCoursesPage() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // ── 1. Enrollments ───────────────────────────────────────────
  const { data: enrollmentRows } = await db
    .from("lms_enrollments")
    .select(`
      id, course_id, status, enrolled_at, completed_at, progress_pct, ${ENROLLMENT_ACCESS_COLUMNS},
      lms_courses(id, title, delivery_mode, thumbnail_url, start_date, end_date)
    `)
    .eq("student_id", student.id)
    .in("status", ["active", "completed"])
    .order("enrolled_at", { ascending: false })

  // One current, accessible enrollment per course (a course retaken in a new
  // program shows once; draft or withdrawn programs don't show).
  const rawEnrollments = currentVisible(enrollmentRows as any[])
  const allCourseIds = rawEnrollments.map((e: any) => e.lms_courses?.id).filter(Boolean)
  const enrollmentIds = rawEnrollments.map((e: any) => e.id)

  // ── 2. Parallel fetches ──────────────────────────────────────
  const [modulesResult, pkgProgResult, locks] = await Promise.all([
    allCourseIds.length
      ? db.from("lms_modules").select("id, course_id, estimated_duration, module_type").in("course_id", allCourseIds)
      : Promise.resolve({ data: [] }),

    // Package progress (one row per package module)
    allCourseIds.length
      ? db.from("lms_package_progress").select("course_id, module_id, status, updated_at").in("enrollment_id", enrollmentIds)
      : Promise.resolve({ data: [] }),

    // Program start date / sequential-course locks.
    getCourseLocks(rawEnrollments.map((e: any) => ({
      course_id: e.course_id, status: e.status, program_id: e.program_id ?? null, member_id: e.member_id ?? null,
      program: e.lms_programs ?? null, member: e.lms_program_members ?? null, access: e.access,
      opens_on: e.opens_on ?? null, group_id: e.group_id ?? null,
    }))),
  ])

  // ── 3. Last accessed + module count ─────────────────────────
  const lastAccessedByCourse: Record<string, string> = {}
  for (const row of (pkgProgResult.data ?? []) as any[]) {
    if (!lastAccessedByCourse[row.course_id] || row.updated_at > lastAccessedByCourse[row.course_id])
      lastAccessedByCourse[row.course_id] = row.updated_at
  }

  const moduleCountByCourse:  Record<string, number> = {}
  const totalMinutesByCourse: Record<string, number> = {}
  for (const m of (modulesResult.data ?? []) as any[]) {
    moduleCountByCourse[m.course_id]  = (moduleCountByCourse[m.course_id]  ?? 0) + 1
    totalMinutesByCourse[m.course_id] = (totalMinutesByCourse[m.course_id] ?? 0) + (m.estimated_duration ?? 0)
  }

  // ── 4. Shape ─────────────────────────────────────────────────
  // progress_pct is stored by syncEnrollmentProgress — use it directly.
  const courses: CourseRow[] = rawEnrollments.map((e: any) => {
    const cid        = e.lms_courses?.id
    const totalMins  = totalMinutesByCourse[cid] ?? 0
    const pct        = Math.min(100, Math.round(e.progress_pct ?? 0))

    // Inside a program its dates apply (the student's extension wins); outside
    // one, the course's own dates.
    const prog      = e.program_id ? e.lms_programs : null
    const startDate = prog ? (prog.start_date ?? null) : (e.lms_courses?.start_date ? String(e.lms_courses.start_date).slice(0, 10) : null)
    const endDate   = prog
      ? (e.lms_program_members?.end_date_override ?? prog.end_date ?? null)
      : (e.lms_courses?.end_date ? String(e.lms_courses.end_date).slice(0, 10) : null)
    const daysLeft  = e.status === "active" && e.access === "full" && endDate ? daysUntil(endDate) : null
    const lock      = locks.get(cid)

    return {
      id:            e.id,
      status:        e.status,
      course: {
        id:            cid,
        title:         e.lms_courses?.title        ?? "Untitled",
        delivery_mode: e.lms_courses?.delivery_mode ?? "online",
        thumbnail_url: e.lms_courses?.thumbnail_url ?? null,
      },
      program:       prog && !prog.is_individual ? { id: prog.id, name: prog.name } : null,
      startDate,
      endDate,
      daysLeft:      daysLeft !== null && daysLeft >= 0 ? daysLeft : null,
      deadline:      deadlineLevel(daysLeft),
      extended:      !!prog && !!e.lms_program_members?.end_date_override && e.lms_program_members.end_date_override !== prog.end_date,
      readOnly:      e.access === "read_only",
      accessNote:    e.accessNote ?? null,
      lockReason:    lock?.locked ? lock.reason : null,
      progress:      pct,
      lastAccessed:  lastAccessedByCourse[cid] ?? null,
      moduleCount:   moduleCountByCourse[cid]  ?? 0,
      totalMinutes:  totalMins,
      remainMinutes: Math.round(totalMins * (1 - pct / 100)),
    }
  })

  return <CoursesTabs courses={courses} />
}
