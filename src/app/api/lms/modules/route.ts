import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"
import { moveExamIntoBank } from "@/lib/lms-exam-bank"

// GET /api/lms/modules?course_id=xxx
export async function GET(req: Request) {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get("course_id")
  if (!courseId) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_modules")
    .select(`
      id, course_id, title, description, delivery_type, order_index,
      estimated_duration, prerequisite_module_id, min_attendance_pct, created_at,
      module_type, content_body, web_url, library_file_id, downloadable,
      questions, activity_settings,
      assignment_brief_html, assignment_rubric, assignment_submission_types,
      assignment_due_date, assignment_max_attempts,
      completion_method, completion_time_minutes, completion_check,
      is_mandatory, lock_until_previous, available_from, available_until, show_in_progress,
      library_file:lms_library_files(id, name, original_name, mime_type, file_type, size_bytes, public_url)
    `)
    .eq("course_id", courseId)
    .order("order_index", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — create module
export async function POST(req: Request) {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const body = await req.json().catch(() => ({}))
  const {
    course_id, title, description, delivery_type, order_index,
    estimated_duration, prerequisite_module_id, min_attendance_pct,
    module_type,
  } = body

  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })
  if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 })

  // Only one final_exam allowed per course
  if (module_type === "final_exam") {
    const { count } = await db
      .from("lms_modules")
      .select("*", { count: "exact", head: true })
      .eq("course_id", course_id)
      .eq("module_type", "final_exam")
    if ((count ?? 0) > 0)
      return NextResponse.json({ error: "A Final Exam already exists for this course" }, { status: 409 })
  }

  // Auto-assign order_index if not provided
  let idx = order_index
  if (idx === undefined || idx === null) {
    const { count } = await db
      .from("lms_modules")
      .select("*", { count: "exact", head: true })
      .eq("course_id", course_id)
    idx = (count ?? 0) + 1
  }

  const { data, error } = await db
    .from("lms_modules")
    .insert({
      course_id,
      title:                 title.trim(),
      description:           description?.trim() || null,
      delivery_type:         delivery_type ?? "online",
      order_index:           idx,
      estimated_duration:    estimated_duration || null,
      prerequisite_module_id: prerequisite_module_id || null,
      min_attendance_pct:    min_attendance_pct || null,
      module_type:           module_type ?? "content",
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Step 11 — a new final exam starts in the question bank: its own set, and
  // an empty fixed section to fill. There is nothing inline to carry over.
  if ((data as any).module_type === "final_exam") {
    const moved = await moveExamIntoBank((data as any).id, g.session.id)
    if (moved.ok) (data as any).exam_sections = (await db.from("lms_modules").select("exam_sections").eq("id", (data as any).id).single()).data?.exam_sections
  }
  return NextResponse.json(data, { status: 201 })
}

// PATCH — update module
export async function PATCH(req: Request) {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const body = await req.json().catch(() => ({}))
  const { id, ...fields } = body
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Step 11 — once an exam's questions live in the bank, the bank is the only
  // place they change. A direct write here would let the exam and the bank
  // disagree, so it is refused (settings like the time limit still save).
  if (fields.questions !== undefined) {
    const { data: cur } = await db.from("lms_modules").select("exam_sections").eq("id", id).maybeSingle()
    if (cur && Array.isArray((cur as any).exam_sections))
      return NextResponse.json({
        error: "This exam's questions are in the question bank now — edit them in the exam builder.",
      }, { status: 409 })
  }
  // exam_sections has its own route, with its own checks.
  delete (fields as any).exam_sections

  // Changing the TYPE of a module students have already worked on would strand
  // that data — e.g. a Final Exam with attempts turned into a package keeps its
  // attempts but no longer grades, reports or completes as an exam.
  if (fields.module_type !== undefined) {
    const { data: cur } = await db.from("lms_modules").select("module_type").eq("id", id).maybeSingle()
    if (cur && cur.module_type !== fields.module_type) {
      const { data: pk } = await db.from("lms_packages").select("id").eq("module_id", id)
      const pkIds = (pk ?? []).map((p: any) => p.id)
      const [att, pp] = await Promise.all([
        db.from("lms_module_attempts").select("*", { count: "exact", head: true }).eq("module_id", id),
        pkIds.length
          ? db.from("lms_package_progress").select("*", { count: "exact", head: true }).in("package_id", pkIds)
          : Promise.resolve({ count: 0 } as any),
      ])
      if ((att.count ?? 0) > 0 || (pp.count ?? 0) > 0)
        return NextResponse.json(
          { error: "Cannot change the type of a module that students have already started." },
          { status: 409 }
        )
    }
  }

  // "One Final Exam per course" was enforced on create only; changing an
  // existing module's type to final_exam bypassed it.
  if (fields.module_type === "final_exam") {
    const { data: self } = await db.from("lms_modules").select("course_id, module_type").eq("id", id).maybeSingle()
    if (self && self.module_type !== "final_exam") {
      const { count } = await db
        .from("lms_modules")
        .select("*", { count: "exact", head: true })
        .eq("course_id", self.course_id)
        .eq("module_type", "final_exam")
      if ((count ?? 0) > 0)
        return NextResponse.json({ error: "A Final Exam already exists for this course" }, { status: 409 })
    }
  }

  const allowed = [
    // Basic
    "title", "description", "delivery_type", "order_index",
    "estimated_duration", "prerequisite_module_id", "min_attendance_pct",
    "module_type",
    // Content
    "content_body", "web_url", "library_file_id", "downloadable",
    // Activities
    "questions", "activity_settings",
    // Assignment
    "assignment_brief_html", "assignment_rubric", "assignment_submission_types",
    "assignment_due_date", "assignment_max_attempts",
    // Completion
    "completion_method", "completion_time_minutes", "completion_check",
    // Access
    "is_mandatory", "lock_until_previous", "available_from", "available_until",
    // Display
    "show_in_progress",
  ]
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowed) {
    if (key in fields) updates[key] = fields[key]
  }

  const { data, error } = await db
    .from("lms_modules")
    .update(updates)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — remove module (only if no student progress)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Refuse if ANY student data depends on this module.
  //
  // This guard only counted lms_progress — the legacy content-item table, which
  // is empty — so it never blocked anything. Deleting a module cascades
  // (ON DELETE CASCADE) to lms_module_attempts, lms_exam_sessions,
  // lms_assignment_submissions and lms_sessions (and through sessions, their
  // attendance), and orphans its package (SET NULL), hiding every student's
  // package progress. In practice: deleting a course's Final Exam module would
  // have permanently erased every attempt — the evidence behind issued
  // certificates — with no warning.
  const { data: pkgs } = await db.from("lms_packages").select("id").eq("module_id", id)
  const pkgIds = (pkgs ?? []).map((p: any) => p.id)

  const counts = await Promise.all([
    db.from("lms_progress").select("*", { count: "exact", head: true }).eq("module_id", id),
    db.from("lms_module_attempts").select("*", { count: "exact", head: true }).eq("module_id", id),
    db.from("lms_assignment_submissions").select("*", { count: "exact", head: true }).eq("module_id", id),
    db.from("lms_exam_sessions").select("*", { count: "exact", head: true }).eq("module_id", id),
    db.from("lms_sessions").select("*", { count: "exact", head: true }).eq("module_id", id),
    pkgIds.length
      ? db.from("lms_package_progress").select("*", { count: "exact", head: true }).in("package_id", pkgIds)
      : Promise.resolve({ count: 0, error: null } as any),
  ])
  if (counts.some((c: any) => c.error))
    return NextResponse.json({ error: "Could not verify this module is safe to delete" }, { status: 500 })

  const [progress, attempts, submissions, examSessions, liveSessions, pkgProgress] = counts.map((c: any) => c.count ?? 0)
  const blockers: string[] = []
  if (attempts)      blockers.push(`${attempts} exam/assignment attempt${attempts === 1 ? "" : "s"}`)
  if (pkgProgress)   blockers.push(`${pkgProgress} student${pkgProgress === 1 ? "" : "s"} with package progress`)
  if (submissions)   blockers.push(`${submissions} submission${submissions === 1 ? "" : "s"}`)
  if (examSessions)  blockers.push(`${examSessions} exam session${examSessions === 1 ? "" : "s"}`)
  if (liveSessions)  blockers.push(`${liveSessions} live session${liveSessions === 1 ? "" : "s"}`)
  if (progress)      blockers.push(`${progress} content progress record${progress === 1 ? "" : "s"}`)

  if (blockers.length)
    return NextResponse.json(
      { error: `Cannot delete — students have data on this module: ${blockers.join(", ")}.` },
      { status: 409 }
    )

  // Nothing depends on it: remove its package too, rather than leaving an
  // orphan (module_id SET NULL) behind.
  if (pkgIds.length) await db.from("lms_packages").delete().in("id", pkgIds)

  const { error } = await db.from("lms_modules").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
