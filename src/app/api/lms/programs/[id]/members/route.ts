import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { syncMemberEnrollments, activeMemberCount } from "@/lib/lms-programs"
import { guardStaff, canSeeProgram, forbidden } from "@/lib/staff-access"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

async function loadProgram(id: string) {
  const { data } = await db.from("lms_programs").select("id, name, status, structure, capacity, company_id, is_individual").eq("id", id).maybeSingle()
  return data as any
}

async function validTrack(programId: string, structure: string, trackId: unknown): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (structure !== "tracks") return { ok: true, id: null }
  if (typeof trackId !== "string" || !UUID_RE.test(trackId)) return { ok: false, error: "Choose a track" }
  const { data } = await db.from("lms_program_tracks").select("id").eq("id", trackId).eq("program_id", programId).maybeSingle()
  return data ? { ok: true, id: trackId } : { ok: false, error: "Track not found" }
}

// POST /api/lms/programs/[id]/members — add students (admin only)
// Body: { student_ids: string[], track_id? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // IR-10 — an instructor with "Manage students" may add people to a program
  // they teach. Moving someone between programs stays with admins (IR-15) and
  // lives in PATCH below.
  const g = await guardStaff({ permission: "manage_students" })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  const { id } = await params
  if (!canSeeProgram(g.scope, id)) return forbidden()

  const program = await loadProgram(id)
  if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 })
  if (program.status === "completed" || program.status === "archived")
    return NextResponse.json({ error: `Students can't be added to a ${program.status} program` }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const studentIds = [...new Set((Array.isArray(body.student_ids) ? body.student_ids : []).filter((s: unknown) => typeof s === "string" && UUID_RE.test(s as string)))] as string[]
  if (!studentIds.length) return NextResponse.json({ error: "Choose at least one student" }, { status: 400 })

  const track = await validTrack(id, program.structure, body.track_id)
  if (!track.ok) return NextResponse.json({ error: track.error }, { status: 400 })

  const [{ data: students }, { data: existingMembers }] = await Promise.all([
    db.from("lms_students").select("id, name, company_id").in("id", studentIds),
    db.from("lms_program_members").select("id, student_id, status").eq("program_id", id).in("student_id", studentIds),
  ])
  const found = new Map(((students ?? []) as any[]).map(s => [s.id, s]))
  const memberByStudent = new Map(((existingMembers ?? []) as any[]).map(m => [m.student_id, m]))

  const results: { student_id: string; name?: string; status: "added" | "already" | "error"; message?: string }[] = []
  const toAdd = studentIds.filter(sid => {
    if (!found.has(sid)) { results.push({ student_id: sid, status: "error", message: "Student not found" }); return false }
    if (memberByStudent.has(sid)) { results.push({ student_id: sid, name: found.get(sid).name, status: "already", message: "Already in this program" }); return false }
    return true
  })

  if (program.capacity && toAdd.length) {
    const active = await activeMemberCount(id)
    if (active + toAdd.length > program.capacity)
      return NextResponse.json({ error: `Program capacity (${program.capacity}) would be exceeded — ${program.capacity - active} place(s) left` }, { status: 409 })
  }

  // CO-12: a company program can take students from elsewhere, but say so.
  const otherCompany = program.company_id
    ? toAdd.filter(sid => found.get(sid).company_id !== program.company_id).length
    : 0

  let created = 0
  const issues: string[] = []
  for (const sid of toAdd) {
    const { data: member, error } = await db
      .from("lms_program_members")
      .insert({ program_id: id, student_id: sid, track_id: track.id, added_by: session.user.id })
      .select("id")
      .single()
    if (error || !member) { results.push({ student_id: sid, name: found.get(sid).name, status: "error", message: "Could not add" }); continue }
    const r = await syncMemberEnrollments((member as any).id, session.user.id, { notify: true })
    created += r.created + r.reactivated
    issues.push(...r.issues.map(i => `${found.get(sid).name}: ${i.reason}`))
    results.push({ student_id: sid, name: found.get(sid).name, status: "added" })
  }

  await auditLog(session, "lms.program.members.add", "lms_program", id, program.name, { added: results.filter(r => r.status === "added").length })
  return NextResponse.json({ results, enrollments_created: created, issues, other_company: otherCompany }, { status: 201 })
}

// PATCH /api/lms/programs/[id]/members — change one member (admin only)
// Body: { member_id, action, ... }
//   move_track { track_id }          PM-10: shared courses keep progress
//   withdraw                         PM-12: hidden, history kept, reversible
//   reinstate
//   extend     { end_date | null }   PM-8: personal end date
//   transfer   { to_program_id, to_track_id? }   PM-11: progress moves with the student
//   retake     { to_program_id, to_track_id? }   PM-11: fresh start; old record kept
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { id } = await params

  const program = await loadProgram(id)
  if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const memberId = body?.member_id
  if (typeof memberId !== "string" || !UUID_RE.test(memberId)) return NextResponse.json({ error: "member_id required" }, { status: 400 })
  const { data: memberRow } = await db
    .from("lms_program_members").select("id, student_id, track_id, status, withdrawn_at, lms_students(name)")
    .eq("id", memberId).eq("program_id", id).maybeSingle()
  if (!memberRow) return NextResponse.json({ error: "Student is not in this program" }, { status: 404 })
  const member = memberRow as any
  const who = member.lms_students?.name ?? null

  switch (body.action) {
    case "move_track": {
      if (program.structure !== "tracks") return NextResponse.json({ error: "This program doesn't use tracks" }, { status: 400 })
      const track = await validTrack(id, program.structure, body.track_id)
      if (!track.ok) return NextResponse.json({ error: track.error }, { status: 400 })
      if (track.id === member.track_id) return NextResponse.json({ ok: true })
      await db.from("lms_program_members").update({ track_id: track.id }).eq("id", memberId)
      const sync = await syncMemberEnrollments(memberId, session.user.id, { notify: true })
      await auditLog(session, "lms.program.members.move_track", "lms_program", id, who, { member_id: memberId, track_id: track.id })
      return NextResponse.json({ ok: true, sync })
    }

    case "withdraw": {
      if (member.status === "withdrawn") return NextResponse.json({ ok: true })
      await db.from("lms_program_members").update({ status: "withdrawn", withdrawn_at: new Date().toISOString() }).eq("id", memberId)
      // Active course enrollments are withdrawn; completed ones stay completed.
      await db.from("lms_enrollments").update({ status: "dropped" }).eq("member_id", memberId).eq("status", "active")
      await auditLog(session, "lms.program.members.withdraw", "lms_program", id, who, { member_id: memberId })
      return NextResponse.json({ ok: true })
    }

    case "reinstate": {
      if (member.status !== "withdrawn") return NextResponse.json({ ok: true })
      if (program.capacity && (await activeMemberCount(id)) >= program.capacity)
        return NextResponse.json({ error: "The program is full" }, { status: 409 })
      await db.from("lms_program_members").update({ status: "active", withdrawn_at: null }).eq("id", memberId)
      const sync = await syncMemberEnrollments(memberId, session.user.id)
      await auditLog(session, "lms.program.members.reinstate", "lms_program", id, who, { member_id: memberId })
      return NextResponse.json({ ok: true, sync })
    }

    case "extend": {
      const d = body.end_date
      if (d !== null && (typeof d !== "string" || !DATE_RE.test(d))) return NextResponse.json({ error: "Invalid date" }, { status: 400 })
      await db.from("lms_program_members").update({ end_date_override: d }).eq("id", memberId)
      await auditLog(session, "lms.program.members.extend", "lms_program", id, who, { member_id: memberId, end_date: d })
      return NextResponse.json({ ok: true })
    }

    // More time for one course (its due date in the program), for this person only.
    case "extend_course": {
      const d = body.due_date
      if (d !== null && (typeof d !== "string" || !DATE_RE.test(d))) return NextResponse.json({ error: "Invalid date" }, { status: 400 })
      if (typeof body.enrollment_id !== "string" || !UUID_RE.test(body.enrollment_id)) return NextResponse.json({ error: "Choose a course" }, { status: 400 })
      const { data: row } = await db.from("lms_enrollments").update({ due_override: d }).eq("id", body.enrollment_id).eq("member_id", memberId).select("id, course_id").maybeSingle()
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 })
      await auditLog(session, "lms.program.members.extend_course", "lms_program", id, who, { member_id: memberId, enrollment_id: body.enrollment_id, due_date: d })
      return NextResponse.json({ ok: true })
    }

    case "transfer":
    case "retake": {
      const toId = body.to_program_id
      if (typeof toId !== "string" || !UUID_RE.test(toId) || toId === id) return NextResponse.json({ error: "Choose another program" }, { status: 400 })
      const target = await loadProgram(toId)
      if (!target) return NextResponse.json({ error: "Target program not found" }, { status: 404 })
      if (target.status === "completed" || target.status === "archived")
        return NextResponse.json({ error: `Can't move a student into a ${target.status} program` }, { status: 409 })
      const track = await validTrack(toId, target.structure, body.to_track_id)
      if (!track.ok) return NextResponse.json({ error: track.error }, { status: 400 })
      const { data: already } = await db.from("lms_program_members").select("id").eq("program_id", toId).eq("student_id", member.student_id).maybeSingle()
      if (already) return NextResponse.json({ error: "The student is already in that program" }, { status: 409 })
      if (target.capacity && (await activeMemberCount(toId)) >= target.capacity)
        return NextResponse.json({ error: "The target program is full" }, { status: 409 })

      const { data: newMember, error } = await db.from("lms_program_members")
        .insert({ program_id: toId, student_id: member.student_id, track_id: track.id, added_by: session.user.id })
        .select("id").single()
      if (error || !newMember) return NextResponse.json({ error: "Could not add to the target program" }, { status: 500 })
      const newMemberId = (newMember as any).id as string

      // Remembered so a move that can't enroll the student anywhere is undone.
      const { data: movedRows } = await db.from("lms_enrollments").select("id, status").eq("member_id", memberId)
      const moved = (movedRows ?? []) as { id: string; status: string }[]
      const droppedIds = moved.filter(e => e.status === "active").map(e => e.id)

      if (body.action === "transfer") {
        // The enrollments themselves move, so their progress, attempts and
        // certificates move with them.
        await db.from("lms_enrollments").update({ program_id: toId, member_id: newMemberId }).eq("member_id", memberId)
        await db.from("lms_program_members").update({ status: "withdrawn", withdrawn_at: new Date().toISOString() }).eq("id", memberId)
      } else {
        // Retake: the old program keeps its record; the student starts fresh.
        if (droppedIds.length) await db.from("lms_enrollments").update({ status: "dropped" }).in("id", droppedIds)
        await db.from("lms_program_members").update({ status: "withdrawn", withdrawn_at: new Date().toISOString() }).eq("id", memberId)
      }
      const sync = await syncMemberEnrollments(newMemberId, session.user.id, { notify: true })

      // Nothing could be enrolled in the target (e.g. the course is still active
      // elsewhere): put everything back, so the student isn't left out of both
      // programs with their finished courses hidden.
      // (A transfer that moved enrollments has succeeded — they carry the record.)
      if (sync.issues.length && sync.created === 0 && sync.reactivated === 0 && (body.action === "retake" || moved.length === 0)) {
        if (body.action === "retake" && droppedIds.length)
          await db.from("lms_enrollments").update({ status: "active" }).in("id", droppedIds)
        await db.from("lms_program_members").update({ status: member.status, withdrawn_at: member.withdrawn_at ?? null }).eq("id", memberId)
        await db.from("lms_program_members").delete().eq("id", newMemberId)
        return NextResponse.json({
          error: `Nothing was changed: ${sync.issues.map(i => i.reason).filter((r, i, a) => a.indexOf(r) === i).join("; ")}`,
          issues: sync.issues,
        }, { status: 409 })
      }
      await auditLog(session, `lms.program.members.${body.action}`, "lms_program", id, who, { member_id: memberId, to_program_id: toId })
      return NextResponse.json({ ok: true, sync })
    }

    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }
}
