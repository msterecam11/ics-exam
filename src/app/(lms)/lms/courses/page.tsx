import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import CoursesTabs from "./CoursesTabs"

export default async function MyCoursesPage() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // ── 1. Enrollments ───────────────────────────────────────────
  const { data: rawEnrollments } = await db
    .from("lms_enrollments")
    .select(`
      id, status, enrolled_at, completed_at, progress_pct,
      lms_courses(id, title, delivery_mode, thumbnail_url, start_date, end_date)
    `)
    .eq("student_id", student.id)
    .in("status", ["active", "completed"])
    .order("enrolled_at", { ascending: false })

  const allCourseIds = (rawEnrollments ?? [])
    .map((e: any) => e.lms_courses?.id)
    .filter(Boolean)

  // ── 2. Parallel fetches ──────────────────────────────────────
  const [
    modulesResult,
    progResult,
    pkgProgResult,
    inProgressResult,
    cohortMembersResult,
  ] = await Promise.all([
    // All modules for these courses
    allCourseIds.length
      ? db.from("lms_modules")
          .select("id, course_id, estimated_duration, module_type")
          .in("course_id", allCourseIds)
      : Promise.resolve({ data: [] }),

    // Standard content-item progress
    allCourseIds.length
      ? db.from("lms_progress")
          .select("course_id, status, content_item_id, updated_at")
          .eq("student_id", student.id)
          .in("course_id", allCourseIds)
      : Promise.resolve({ data: [] }),

    // Package progress (one row per package module)
    allCourseIds.length
      ? db.from("lms_package_progress")
          .select("course_id, module_id, status, completed_items, updated_at")
          .eq("student_id", student.id)
          .in("course_id", allCourseIds)
      : Promise.resolve({ data: [] }),

    // Last in-progress content item per course (for Continue button)
    allCourseIds.length
      ? db.from("lms_progress")
          .select("course_id, content_item_id, updated_at")
          .eq("student_id", student.id)
          .eq("status", "in_progress")
          .in("course_id", allCourseIds)
          .order("updated_at", { ascending: false })
      : Promise.resolve({ data: [] }),

    // Cohort memberships
    db.from("lms_cohort_members")
      .select("id, track_id, cohort_id, lms_cohorts(id, name, mode, start_date, end_date, learning_path_id)")
      .eq("student_id", student.id)
      .eq("is_active", true),
  ])

  // ── 3. Last accessed + module count ─────────────────────────
  const lastAccessedByCourse: Record<string, string> = {}
  for (const row of (pkgProgResult.data ?? []) as any[]) {
    if (!lastAccessedByCourse[row.course_id] || row.updated_at > lastAccessedByCourse[row.course_id])
      lastAccessedByCourse[row.course_id] = row.updated_at
  }
  for (const row of (progResult.data ?? []) as any[]) {
    if (!lastAccessedByCourse[row.course_id] || row.updated_at > lastAccessedByCourse[row.course_id])
      lastAccessedByCourse[row.course_id] = row.updated_at
  }

  // Last in-progress item per course
  const nextItemByCourse: Record<string, string> = {}
  for (const row of (inProgressResult.data ?? []) as any[]) {
    if (!nextItemByCourse[row.course_id])
      nextItemByCourse[row.course_id] = row.content_item_id
  }

  // Module count + total minutes per course
  const moduleCountByCourse:  Record<string, number> = {}
  const totalMinutesByCourse: Record<string, number> = {}
  for (const m of (modulesResult.data ?? []) as any[]) {
    moduleCountByCourse[m.course_id]  = (moduleCountByCourse[m.course_id]  ?? 0) + 1
    totalMinutesByCourse[m.course_id] = (totalMinutesByCourse[m.course_id] ?? 0) + (m.estimated_duration ?? 0)
  }

  // ── 4. Shape enrollments ─────────────────────────────────────
  // progress_pct is stored by syncEnrollmentProgress — use it directly
  const enrollments = (rawEnrollments ?? []).map((e: any) => {
    const cid = e.lms_courses?.id
    const totalMins  = totalMinutesByCourse[cid] ?? 0
    const pct        = e.progress_pct ?? 0
    const remainMins = Math.round(totalMins * (1 - pct / 100))

    return {
      id:            e.id,
      status:        e.status,
      enrolled_at:   e.enrolled_at,
      completed_at:  e.completed_at,
      course: {
        id:            cid,
        title:         e.lms_courses?.title        ?? "Untitled",
        delivery_mode: e.lms_courses?.delivery_mode ?? "online",
        thumbnail_url: e.lms_courses?.thumbnail_url ?? null,
        start_date:    e.lms_courses?.start_date    ?? null,
        end_date:      e.lms_courses?.end_date      ?? null,
      },
      progress:      pct,
      lastAccessed:  lastAccessedByCourse[cid] ?? null,
      nextContentId: nextItemByCourse[cid]     ?? null,
      moduleCount:   moduleCountByCourse[cid]  ?? 0,
      totalMinutes:  totalMins,
      remainMinutes: remainMins,
    }
  })

  // ── 5. Cohorts ───────────────────────────────────────────────
  const memberRows = (cohortMembersResult.data ?? []) as any[]
  const cohortIds  = memberRows.map((m: any) => m.cohort_id).filter(Boolean)

  const [unifiedResult, tracksResult, ownTrackResult] = await Promise.all([
    cohortIds.length
      ? db.from("lms_cohort_courses")
          .select("cohort_id, order_index, lms_courses(id, title, delivery_mode, start_date, end_date)")
          .in("cohort_id", cohortIds).order("order_index", { ascending: true })
      : Promise.resolve({ data: [] }),

    cohortIds.length
      ? db.from("lms_cohort_tracks")
          .select("id, name, cohort_id")
          .in("cohort_id", cohortIds).order("order_index", { ascending: true })
      : Promise.resolve({ data: [] }),

    memberRows.map((m: any) => m.track_id).filter(Boolean).length
      ? db.from("lms_cohort_track_courses")
          .select("track_id, order_index, lms_courses(id, title, delivery_mode, start_date, end_date)")
          .in("track_id", memberRows.map((m: any) => m.track_id).filter(Boolean))
          .order("order_index", { ascending: true })
      : Promise.resolve({ data: [] }),
  ])

  const unifiedByCohort: Record<string, any[]> = {}
  for (const r of (unifiedResult.data ?? []) as any[]) {
    if (!unifiedByCohort[r.cohort_id]) unifiedByCohort[r.cohort_id] = []
    unifiedByCohort[r.cohort_id].push(r)
  }
  const tracksByCohort: Record<string, { id: string; name: string }[]> = {}
  for (const t of (tracksResult.data ?? []) as any[]) {
    if (!tracksByCohort[t.cohort_id]) tracksByCohort[t.cohort_id] = []
    tracksByCohort[t.cohort_id].push({ id: t.id, name: t.name })
  }
  const coursesByTrack: Record<string, any[]> = {}
  for (const r of (ownTrackResult.data ?? []) as any[]) {
    if (!coursesByTrack[r.track_id]) coursesByTrack[r.track_id] = []
    coursesByTrack[r.track_id].push(r)
  }

  const progressByCourse: Record<string, number> = {}
  for (const e of (rawEnrollments ?? []) as any[]) {
    if (e.lms_courses?.id) progressByCourse[e.lms_courses.id] = e.progress_pct ?? 0
  }

  function shapeCourse(row: any, idx: number) {
    const c = row.lms_courses
    return {
      id: c?.id ?? "", title: c?.title ?? "Untitled",
      delivery_mode: c?.delivery_mode ?? "online",
      start_date: c?.start_date ?? null, end_date: c?.end_date ?? null,
      progress: progressByCourse[c?.id] ?? 0,
      order_index: row.order_index ?? idx,
    }
  }

  const cohorts = memberRows.map((m: any) => {
    const cohort    = m.lms_cohorts as any
    const isUnified = cohort?.mode === "unified"
    const trackId   = m.track_id ?? null
    return {
      memberId: m.id,
      cohort: {
        id: cohort?.id ?? m.cohort_id, name: cohort?.name ?? "Cohort",
        mode: cohort?.mode ?? "unified",
        start_date: cohort?.start_date ?? null, end_date: cohort?.end_date ?? null,
        courses: isUnified ? (unifiedByCohort[cohort?.id] ?? []).map(shapeCourse) : [],
        learning_path_id: cohort?.learning_path_id ?? null,
      },
      trackId,
      track: trackId ? {
        id: trackId,
        name: (tracksByCohort[cohort?.id] ?? []).find((t: any) => t.id === trackId)?.name ?? "My Track",
        courses: (coursesByTrack[trackId] ?? []).map(shapeCourse),
      } : null,
      allTracks: tracksByCohort[cohort?.id] ?? [],
    }
  })

  // ── 6. Learning paths ────────────────────────────────────────
  const lpIds = [...new Set(
    memberRows.map((m: any) => (m.lms_cohorts as any)?.learning_path_id).filter(Boolean)
  )] as string[]

  let learningPaths: any[] = []
  if (lpIds.length) {
    const [lpRows, lpCourseRows] = await Promise.all([
      db.from("lms_learning_paths").select("id, title, description").in("id", lpIds),
      db.from("lms_learning_path_courses")
        .select("learning_path_id, order_index, lms_courses(id, title, delivery_mode, start_date, end_date)")
        .in("learning_path_id", lpIds).order("order_index", { ascending: true }),
    ])
    learningPaths = (lpRows.data ?? []).map((lp: any) => {
      const courses = (lpCourseRows.data ?? [])
        .filter((r: any) => r.learning_path_id === lp.id)
        .map((r: any, idx: number) => shapeCourse(r, idx))
      const lpCohort = memberRows.find((m: any) => (m.lms_cohorts as any)?.learning_path_id === lp.id)
      const lpCohortData = lpCohort ? (lpCohort.lms_cohorts as any) : null
      return {
        id: lp.id, title: lp.title, description: lp.description ?? null,
        start_date: lpCohortData?.start_date ?? null,
        end_date:   lpCohortData?.end_date   ?? null,
        courses,
      }
    })
  }

  return (
    <CoursesTabs
      enrollments={enrollments}
      learningPaths={learningPaths}
      cohorts={cohorts}
    />
  )
}
