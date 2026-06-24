import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { sendEmail, buildEnrollmentEmail } from "@/lib/email"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/enrollments?course_id=xxx  — list students enrolled in a course
// GET /api/lms/enrollments?student_id=xxx — list courses a student is enrolled in
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const courseId  = searchParams.get("course_id")
  const studentId = searchParams.get("student_id")

  if (!courseId && !studentId)
    return NextResponse.json({ error: "course_id or student_id required" }, { status: 400 })

  if (courseId) {
    // All enrollments for a course
    const { data, error } = await db
      .from("lms_enrollments")
      .select(`
        id, status, enrolled_at, completed_at,
        lms_students(id, name, email, company, job_title)
      `)
      .eq("course_id", courseId)
      .order("enrolled_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Compute real-time progress per student for this course
    const studentIds = (data ?? []).map((e: any) => e.lms_students?.id).filter(Boolean)

    // Fetch modules for this course
    const { data: modulesRows } = await db
      .from("lms_modules")
      .select("id, course_id, module_type")
      .eq("course_id", courseId)

    const moduleIds = (modulesRows ?? []).map((m: any) => m.id)

    // Fetch packages per module
    const pkgIdsByModuleId: Record<string, string> = {}
    const allPkgIds: string[] = []
    if (moduleIds.length) {
      const { data: pkgs } = await db.from("lms_packages").select("id, module_id").in("module_id", moduleIds)
      for (const p of pkgs ?? []) { pkgIdsByModuleId[(p as any).module_id] = (p as any).id; allPkgIds.push((p as any).id) }
    }

    // Package item counts
    const pkgItemCountById: Record<string, number> = {}
    if (allPkgIds.length) {
      const { data: pkgItems } = await db.from("lms_package_items").select("package_id").in("package_id", allPkgIds)
      for (const item of pkgItems ?? [])
        pkgItemCountById[(item as any).package_id] = (pkgItemCountById[(item as any).package_id] ?? 0) + 1
    }

    // Content items per module (mandatory only)
    const contentItemsByModule: Record<string, string[]> = {}
    if (moduleIds.length) {
      const { data: cis } = await db.from("lms_content_items").select("id, module_id, is_mandatory").in("module_id", moduleIds)
      for (const ci of cis ?? []) {
        if (!(ci as any).is_mandatory) continue
        const mid = (ci as any).module_id
        if (!contentItemsByModule[mid]) contentItemsByModule[mid] = []
        contentItemsByModule[mid].push((ci as any).id)
      }
    }

    // Exam modules — per student, track who passed
    const examModuleIds = (modulesRows ?? [])
      .filter((m: any) => m.module_type === "final_exam")
      .map((m: any) => m.id)
    const examPassedByStudent: Record<string, Set<string>> = {}
    if (examModuleIds.length && studentIds.length) {
      const { data: passedExams } = await db.from("lms_module_attempts")
        .select("student_id, module_id")
        .in("module_id", examModuleIds)
        .in("student_id", studentIds)
        .eq("passed", true)
      for (const a of passedExams ?? []) {
        const sid = (a as any).student_id
        if (!examPassedByStudent[sid]) examPassedByStudent[sid] = new Set()
        examPassedByStudent[sid].add((a as any).module_id)
      }
    }

    // Per-student progress
    const progressPctMap: Record<string, number> = {}
    if (studentIds.length && moduleIds.length) {
      const [pkgProgRes, contentProgRes] = await Promise.all([
        allPkgIds.length
          ? db.from("lms_package_progress").select("student_id, module_id, completed_items")
              .in("student_id", studentIds).in("package_id", allPkgIds)
          : Promise.resolve({ data: [] }),
        db.from("lms_progress").select("student_id, content_item_id, status")
          .in("student_id", studentIds).in("module_id", moduleIds),
      ])

      // Index by student
      const pkgProgByStudentModule: Record<string, Record<string, any>> = {}
      for (const pp of pkgProgRes.data ?? []) {
        const sid = (pp as any).student_id
        if (!pkgProgByStudentModule[sid]) pkgProgByStudentModule[sid] = {}
        pkgProgByStudentModule[sid][(pp as any).module_id] = pp
      }
      const contentProgByStudent: Record<string, Record<string, string>> = {}
      for (const cp of contentProgRes.data ?? []) {
        const sid = (cp as any).student_id
        if (!contentProgByStudent[sid]) contentProgByStudent[sid] = {}
        contentProgByStudent[sid][(cp as any).content_item_id] = (cp as any).status
      }

      const mods = modulesRows ?? []
      for (const sid of studentIds) {
        if (!mods.length) { progressPctMap[sid] = 0; continue }
        let sumPct = 0
        for (const mod of mods) {
          const pkgId = pkgIdsByModuleId[(mod as any).id]
          if (pkgId) {
            const total     = pkgItemCountById[pkgId] ?? 0
            const pkgProg   = pkgProgByStudentModule[sid]?.[(mod as any).id]
            const completed = pkgProg && Array.isArray(pkgProg.completed_items) ? pkgProg.completed_items.length : 0
            sumPct += total > 0 ? (completed / total) * 100 : 0
          } else if (examModuleIds.includes((mod as any).id)) {
            sumPct += examPassedByStudent[sid]?.has((mod as any).id) ? 100 : 0
          } else {
            const items     = contentItemsByModule[(mod as any).id] ?? []
            const cpMap     = contentProgByStudent[sid] ?? {}
            const completed = items.filter(id => cpMap[id] === "completed").length
            sumPct += items.length > 0 ? (completed / items.length) * 100 : 0
          }
        }
        progressPctMap[sid] = Math.round(sumPct / mods.length)
      }
    }

    const enriched = (data ?? []).map((e: any) => ({
      ...e,
      progress_pct: progressPctMap[e.lms_students?.id] ?? 0,
    }))
    return NextResponse.json(enriched)
  }

  // All enrollments for a student
  const { data, error } = await db
    .from("lms_enrollments")
    .select(`
      id, status, enrolled_at, completed_at,
      lms_courses(id, title, description, delivery_mode, thumbnail_url, end_date, status)
    `)
    .eq("student_id", studentId!)
    .order("enrolled_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — enroll one or more students in a course
// Body: { course_id, student_ids: string[] }
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { course_id, student_ids } = body

  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })
  if (!Array.isArray(student_ids) || !student_ids.length)
    return NextResponse.json({ error: "student_ids (array) required" }, { status: 400 })

  // Check course capacity
  const { data: course } = await db
    .from("lms_courses")
    .select("capacity")
    .eq("id", course_id)
    .single()

  if (course?.capacity) {
    const { count: current } = await db
      .from("lms_enrollments")
      .select("*", { count: "exact", head: true })
      .eq("course_id", course_id)
      .eq("status", "active")

    if ((current ?? 0) + student_ids.length > course.capacity)
      return NextResponse.json(
        { error: `Course capacity (${course.capacity}) would be exceeded` },
        { status: 409 }
      )
  }

  // Upsert enrollments (skip duplicates)
  const rows = student_ids.map((sid: string) => ({
    student_id:  sid,
    course_id,
    enrolled_by: session.user.id,
    status:      "active",
  }))

  const { data, error } = await db
    .from("lms_enrollments")
    .upsert(rows, { onConflict: "student_id,course_id", ignoreDuplicates: true })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Send enrollment emails (fire & forget — don't block response)
  const sendEmails = body.send_email !== false  // default true
  if (sendEmails && (data?.length ?? 0) > 0) {
    const { data: courseRow } = await db
      .from("lms_courses")
      .select("title")
      .eq("id", course_id)
      .single()

    const { data: students } = await db
      .from("lms_students")
      .select("id, name, email")
      .in("id", student_ids)

    const courseTitle = courseRow?.title ?? "your course"
    for (const student of students ?? []) {
      if (!student.email) continue
      const { subject, html } = buildEnrollmentEmail({
        studentName: student.name,
        courseTitle,
        courseId:    course_id,
      })
      sendEmail({ type: "enrollment", to: student.email, subject, html,
        studentId: student.id, courseId: course_id }).catch(() => {})
    }
  }

  return NextResponse.json({ enrolled: data?.length ?? 0 }, { status: 201 })
}

// PATCH — update enrollment status (active / completed / dropped)
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, status } = body
  if (!id || !status) return NextResponse.json({ error: "id and status required" }, { status: 400 })

  const validStatuses = ["active", "completed", "dropped"]
  if (!validStatuses.includes(status))
    return NextResponse.json({ error: "Invalid status" }, { status: 400 })

  const updates: any = { status }
  if (status === "completed") updates.completed_at = new Date().toISOString()

  const { data, error } = await db
    .from("lms_enrollments")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — unenroll (hard delete, only if no progress)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Get enrollment to find student_id + course_id
  const { data: enr } = await db
    .from("lms_enrollments")
    .select("student_id, course_id")
    .eq("id", id)
    .single()

  if (enr) {
    const { count } = await db
      .from("lms_progress")
      .select("*", { count: "exact", head: true })
      .eq("student_id", enr.student_id)
      .eq("course_id", enr.course_id)

    if ((count ?? 0) > 0)
      return NextResponse.json(
        { error: "Cannot unenroll — student has progress. Drop them instead." },
        { status: 409 }
      )
  }

  const { error } = await db.from("lms_enrollments").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
