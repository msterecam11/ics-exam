import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { PROGRAM_COLUMNS } from "@/lib/lms-programs"

// POST /api/lms/programs/[id]/duplicate — admin only (PM-5)
// Body: { name? }
// Copies structure (tracks, courses/paths), pass-mark/attempt rules, settings
// and instructors into a new DRAFT program — without students or dates.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { id } = await params

  const { data: src } = await db.from("lms_programs").select(PROGRAM_COLUMNS).eq("id", id).maybeSingle()
  if (!src) return NextResponse.json({ error: "Program not found" }, { status: 404 })
  const s = src as any

  const body = await req.json().catch(() => ({}))
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, 200) : `${s.name} (copy)`

  const { data: copy, error } = await db.from("lms_programs").insert({
    name,
    company_id: s.company_id, is_individual: s.is_individual,
    reference: null, description: s.description,
    start_date: null, end_date: null, capacity: s.capacity,
    status: "draft", structure: s.structure, after_end_access: s.after_end_access,
    certificate_enabled: s.certificate_enabled, certificate_auto_release: s.certificate_auto_release, external_ics_certificate: s.external_ics_certificate ?? false,
    feedback_enabled: s.feedback_enabled, feedback_mandatory: s.feedback_mandatory, feedback_anonymous: s.feedback_anonymous,
    progress_enforcement: s.progress_enforcement,
    duplicated_from: id, created_by: session.user.id,
  }).select(PROGRAM_COLUMNS).single()
  if (error || !copy) return NextResponse.json({ error: "Could not duplicate the program" }, { status: 500 })
  const newId = (copy as any).id as string

  const undo = async (msg: string) => {
    await db.from("lms_programs").delete().eq("id", newId)   // tracks/items/rules/instructors cascade
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const [{ data: tracks }, { data: items }, { data: rules }, { data: instructors }] = await Promise.all([
    db.from("lms_program_tracks").select("id, name, order_index").eq("program_id", id),
    db.from("lms_program_items").select("track_id, course_id, path_id, order_index").eq("program_id", id),
    db.from("lms_program_course_rules").select("course_id, pass_mark, max_attempts").eq("program_id", id),
    db.from("lms_program_instructors").select("user_id").eq("program_id", id),
  ])

  const trackMap = new Map<string, string>()
  for (const t of (tracks ?? []) as any[]) {
    const { data: nt, error: tErr } = await db.from("lms_program_tracks")
      .insert({ program_id: newId, name: t.name, order_index: t.order_index }).select("id").single()
    if (tErr || !nt) return undo("Could not copy tracks")
    trackMap.set(t.id, (nt as any).id)
  }

  const itemRows = ((items ?? []) as any[]).map(i => ({
    program_id: newId, track_id: i.track_id ? trackMap.get(i.track_id) ?? null : null,
    course_id: i.course_id, path_id: i.path_id, order_index: i.order_index,
  }))
  if (itemRows.length) {
    const { error: iErr } = await db.from("lms_program_items").insert(itemRows)
    if (iErr) return undo("Could not copy courses")
  }
  const ruleRows = ((rules ?? []) as any[]).map(r => ({ program_id: newId, ...r }))
  if (ruleRows.length) {
    const { error: rErr } = await db.from("lms_program_course_rules").insert(ruleRows)
    if (rErr) return undo("Could not copy pass marks")
  }
  const instRows = ((instructors ?? []) as any[]).map(i => ({ program_id: newId, user_id: i.user_id }))
  if (instRows.length) await db.from("lms_program_instructors").insert(instRows)

  await auditLog(session, "lms.program.duplicate", "lms_program", newId, name, { from: id })
  return NextResponse.json(copy, { status: 201 })
}
