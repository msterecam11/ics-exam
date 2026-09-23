import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { applyProgramEmailSettings } from "@/lib/lms-email-program"
import { PROGRAM_COLUMNS, syncMemberEnrollments, coursesForTrack } from "@/lib/lms-programs"
import { parseProgramInput } from "@/lib/lms-program-input"
import { guardStaff, canSeeProgram } from "@/lib/staff-access"

// Allowed status changes (PM-6).
const TRANSITIONS: Record<string, string[]> = {
  draft:     ["active"],
  // No way back to draft once live: draft hides the program from students
  // who may already have progress in it.
  active:    ["completed"],
  completed: ["active", "archived"],
  archived:  ["completed"],
}

// GET /api/lms/programs/[id] — everything the program page needs
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  // IR-1 / IR-4 — one program, and only if it is one of theirs.
  const g = await guardStaff()
  if (!g.ok) return g.res
  const { id } = await params
  // Same answer whether it doesn't exist or isn't theirs, so the response can't
  // be used to find out which programs the LMS holds.
  if (!canSeeProgram(g.scope, id)) return NextResponse.json({ error: "Program not found" }, { status: 404 })

  const { data: program } = await db
    .from("lms_programs")
    .select(`${PROGRAM_COLUMNS}, lms_companies(id, name, code, logo_url)`)
    .eq("id", id)
    .maybeSingle()
  if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 })

  const [tracks, items, rules, instructors, members, enrollments] = await Promise.all([
    db.from("lms_program_tracks").select("id, name, order_index").eq("program_id", id).order("order_index"),
    db.from("lms_program_items")
      .select("id, track_id, course_id, path_id, order_index, lms_courses(id, title, status), lms_learning_paths(id, title)")
      .eq("program_id", id).order("order_index"),
    db.from("lms_program_course_rules").select("course_id, pass_mark, max_attempts, lms_courses(id, title)").eq("program_id", id),
    db.from("lms_program_instructors").select("user_id, track_ids, admin_users(id, name, email, role)").eq("program_id", id),
    db.from("lms_program_members")
      .select("id, student_id, track_id, status, end_date_override, added_at, withdrawn_at, lms_students(id, name, email, company, job_title, employee_number)")
      .eq("program_id", id).order("added_at", { ascending: true }),
    db.from("lms_enrollments")
      .select("id, member_id, course_id, status, progress_pct, completed_at")
      .eq("program_id", id),
  ])
  if ([tracks, items, rules, instructors, members, enrollments].some(r => r.error))
    return NextResponse.json({ error: "Could not load the program" }, { status: 500 })

  // What each course's own settings say, so the Rules tab can show the default
  // beside the program's number — these rules are copied on add, then
  // independent, and without the default nobody can tell what was changed.
  const ruleCourseIds = ((rules.data ?? []) as any[]).map(r => r.course_id)
  const courseDefaults = new Map<string, { pass_mark: number; max_attempts: number }>()
  if (ruleCourseIds.length) {
    const [{ data: ruleCourses }, { data: ruleExams }] = await Promise.all([
      db.from("lms_courses").select("id, final_exam_pass_mark").in("id", ruleCourseIds),
      db.from("lms_modules").select("course_id, activity_settings").in("course_id", ruleCourseIds).eq("module_type", "final_exam"),
    ])
    const examOf = new Map(((ruleExams ?? []) as any[]).map(m => [m.course_id, m.activity_settings]))
    for (const c of (ruleCourses ?? []) as any[]) {
      const st = examOf.get(c.id) as any
      // Same fallbacks ensureProgramRules() seeds with, so the two agree.
      courseDefaults.set(c.id, {
        pass_mark: Math.min(100, Math.max(0, Math.round(Number(c.final_exam_pass_mark ?? st?.pass_mark ?? 70)))),
        max_attempts: Math.min(20, Math.max(1, Math.round(Number(st?.max_attempts ?? 3)))),
      })
    }
  }

  // Path contents, so the page can show which courses each path brings.
  const pathIds = [...new Set(((items.data ?? []) as any[]).filter(i => i.path_id).map(i => i.path_id))]
  const { data: pathCourses } = pathIds.length
    ? await db.from("lms_learning_path_courses").select("path_id, order_index, lms_courses(id, title)").in("path_id", pathIds).order("order_index")
    : { data: [] }

  // Best final-exam result per enrollment, so the progress matrix can show the
  // outcome next to the progress bar rather than progress alone.
  const enrIds = ((enrollments.data ?? []) as any[]).map(e => e.id)
  const bestExam = new Map<string, { pct: number; passed: boolean; attempts: number }>()
  if (enrIds.length) {
    const { data: attempts } = await db.from("lms_module_attempts")
      .select("enrollment_id, score, max_score, passed, lms_modules!inner(module_type)")
      .in("enrollment_id", enrIds).eq("lms_modules.module_type", "final_exam")
    for (const a of (attempts ?? []) as any[]) {
      if (a.score == null || !a.max_score) continue
      const pct = Math.round((a.score / a.max_score) * 100)
      const prev = bestExam.get(a.enrollment_id)
      bestExam.set(a.enrollment_id, {
        pct: Math.max(pct, prev?.pct ?? 0),
        passed: !!a.passed || !!prev?.passed,
        attempts: (prev?.attempts ?? 0) + 1,
      })
    }
  }

  const enrByMember = new Map<string, any[]>()
  for (const e of (enrollments.data ?? []) as any[]) {
    if (!enrByMember.has(e.member_id)) enrByMember.set(e.member_id, [])
    enrByMember.get(e.member_id)!.push({ ...e, exam: bestExam.get(e.id) ?? null })
  }

  return NextResponse.json({
    program,
    tracks: tracks.data ?? [],
    items: items.data ?? [],
    path_courses: pathCourses ?? [],
    rules: ((rules.data ?? []) as any[]).map(r => ({ ...r, course_default: courseDefaults.get(r.course_id) ?? null })),
    // track_ids travels with each instructor so the settings screen can show
    // whether they cover the whole program or only some tracks (IR-2).
    instructors: ((instructors.data ?? []) as any[])
      .filter(i => i.admin_users)
      .map(i => ({ ...i.admin_users, track_ids: Array.isArray(i.track_ids) ? i.track_ids : [] })),
    members: ((members.data ?? []) as any[]).map(m => {
      const enr = (enrByMember.get(m.id) ?? []).filter((e: any) => e.status !== "dropped")
      return {
        ...m,
        enrollments: enrByMember.get(m.id) ?? [],
        course_count: enr.length,
        completed_count: enr.filter((e: any) => e.status === "completed").length,
        progress_pct: enr.length ? Math.round(enr.reduce((s: number, e: any) => s + Number(e.progress_pct ?? 0), 0) / enr.length) : 0,
      }
    }),
  })
}

// PATCH /api/lms/programs/[id] — details, settings, status (admin only)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { id } = await params

  const { data: current } = await db.from("lms_programs").select("id, name, status, structure, capacity").eq("id", id).maybeSingle()
  if (!current) return NextResponse.json({ error: "Program not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const parsed = await parseProgramInput(body, true)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const updates: Record<string, unknown> = { ...parsed.values }

  // Structure can change only while nobody has been added.
  if (body.structure !== undefined && body.structure !== (current as any).structure) {
    if (!["course", "tracks"].includes(body.structure)) return NextResponse.json({ error: "Invalid structure" }, { status: 400 })
    const { count } = await db.from("lms_program_members").select("*", { count: "exact", head: true }).eq("program_id", id)
    if ((count ?? 0) > 0) return NextResponse.json({ error: "The structure can't change once students are added" }, { status: 409 })
    updates.structure = body.structure
  }

  let activated = false
  if (body.status !== undefined && body.status !== (current as any).status) {
    const from = (current as any).status as string
    if (!(TRANSITIONS[from] ?? []).includes(body.status))
      return NextResponse.json({ error: `A ${from} program can't be set to ${body.status}` }, { status: 400 })
    if (body.status === "active") {
      // Something to deliver first.
      const courses = await coursesForTrack(id, null)
      const { count: trackItems } = await db.from("lms_program_items").select("*", { count: "exact", head: true }).eq("program_id", id).not("track_id", "is", null)
      if (!courses.length && !(trackItems ?? 0))
        return NextResponse.json({ error: "Add at least one course or learning path before activating" }, { status: 409 })
      activated = from === "draft"
    }
    updates.status = body.status
  }

  // EM-16 — per-program email overrides. { "<code>": null } clears an override
  // and puts that email back to whatever LMS Settings says.
  if (body.email_settings !== undefined) {
    const { data: row } = await db.from("lms_programs").select("email_settings").eq("id", id).single()
    const merged = applyProgramEmailSettings((row as any)?.email_settings ?? {}, body.email_settings)
    if ("error" in merged) return NextResponse.json({ error: merged.error }, { status: 400 })
    updates.email_settings = merged.value
  }

  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  if (updates.capacity != null) {
    const { count } = await db.from("lms_program_members").select("*", { count: "exact", head: true }).eq("program_id", id).eq("status", "active")
    if ((count ?? 0) > Number(updates.capacity))
      return NextResponse.json({ error: `The program already has ${count} active students` }, { status: 409 })
  }

  const { data, error } = await db.from("lms_programs").update(updates).eq("id", id).select(PROGRAM_COLUMNS).single()
  if (error) return NextResponse.json({ error: "Could not update program" }, { status: 500 })

  // Going live: make sure every member has their enrollments, and tell them.
  let sync: { created: number; issues: number } | undefined
  if (activated) {
    const { data: members } = await db.from("lms_program_members").select("id").eq("program_id", id).eq("status", "active")
    sync = { created: 0, issues: 0 }
    for (const m of (members ?? []) as any[]) {
      const r = await syncMemberEnrollments(m.id, session.user.id, { notify: true })
      sync.created += r.created; sync.issues += r.issues.length
    }
  }

  await auditLog(session, "lms.program.update", "lms_program", id, (data as any).name, { fields: Object.keys(updates) })
  return NextResponse.json({ ...data, ...(sync ? { sync } : {}) })
}

// DELETE /api/lms/programs/[id] — only an empty draft (admin only)
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { id } = await params

  const { data: program } = await db.from("lms_programs").select("id, name, status").eq("id", id).maybeSingle()
  if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 })

  const [{ count: members }, { count: enrollments }] = await Promise.all([
    db.from("lms_program_members").select("*", { count: "exact", head: true }).eq("program_id", id),
    db.from("lms_enrollments").select("*", { count: "exact", head: true }).eq("program_id", id),
  ])
  if ((members ?? 0) > 0 || (enrollments ?? 0) > 0)
    return NextResponse.json({ error: "This program has students. Archive it instead — its history is kept." }, { status: 409 })

  const { error } = await db.from("lms_programs").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Could not delete program" }, { status: 500 })

  await auditLog(session, "lms.program.delete", "lms_program", id, (program as any).name)
  return NextResponse.json({ ok: true })
}
