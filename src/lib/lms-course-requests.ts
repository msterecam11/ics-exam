// CV-7 — answering a catalogue request.
//
// Approving always goes through a program, because a program is what gives a
// student a deadline, a pass mark and a report. The admin either picks one that
// already delivers the course, or has one created on the spot.
//
// Joining reuses syncMemberEnrollments — the same path as adding a student by
// hand in Program Manager — so an approved request behaves exactly like any
// other member: enrolments, sequential locks, emails, reports.

import { db } from "@/lib/db"
import { syncMemberEnrollments, ensureProgramRules, activeMemberCount } from "@/lib/lms-programs"
import { sendRuleEmail } from "@/lib/lms-email-settings"
import { baseTemplate, btn, BLUE, APP_BASE_URL } from "@/lib/email"

export interface ProgramOption {
  id: string
  name: string
  status: string
  company: string | null
  isIndividual: boolean
  /** Tracks that deliver the course; empty when it's shared or there are no tracks. */
  tracks: { id: string; name: string }[]
  needsTrack: boolean
  /** The student's own client (or an individual program for an individual). */
  recommended: boolean
  full: boolean
}

interface RequestRow {
  id: string
  student_id: string
  course_id: string
  status: string
  lms_students: { id: string; name: string; email: string | null; company_id: string | null } | null
  lms_courses: { id: string; title: string } | null
}

async function loadRequest(id: string): Promise<RequestRow | null> {
  const { data } = await db
    .from("lms_course_requests")
    .select("id, student_id, course_id, status, lms_students(id, name, email, company_id), lms_courses(id, title)")
    .eq("id", id).maybeSingle()
  return (data as any) ?? null
}

/**
 * Programs this student could be put into for this course: open (draft or
 * running) and delivering the course. Their own client's programs — or
 * individual programs, for an individual — come first and are marked.
 */
export async function programOptions(studentCompanyId: string | null, courseId: string): Promise<ProgramOption[]> {
  const { data: items } = await db
    .from("lms_program_items")
    .select("program_id, track_id, lms_programs!inner(id, name, status, structure, company_id, is_individual, capacity, lms_companies(name))")
    .eq("course_id", courseId)
    .in("lms_programs.status", ["draft", "active"])

  const byProgram = new Map<string, { p: any; trackIds: Set<string | null> }>()
  for (const it of (items ?? []) as any[]) {
    const cur = byProgram.get(it.program_id) ?? { p: it.lms_programs, trackIds: new Set() }
    cur.trackIds.add(it.track_id ?? null)
    byProgram.set(it.program_id, cur)
  }
  if (!byProgram.size) return []

  const ids = [...byProgram.keys()]
  const { data: tracks } = await db.from("lms_program_tracks").select("id, name, program_id").in("program_id", ids).order("order_index")

  const out: ProgramOption[] = []
  for (const [id, { p, trackIds }] of byProgram) {
    const own = (tracks ?? []).filter((t: any) => t.program_id === id)
    const shared = trackIds.has(null)
    // A course shared by the whole program is reachable from any track.
    const reachable = shared ? own : own.filter((t: any) => trackIds.has(t.id))
    const needsTrack = p.structure === "tracks" && reachable.length > 1
    const full = !!p.capacity && (await activeMemberCount(id)) >= p.capacity
    out.push({
      id, name: p.name, status: p.status,
      company: p.lms_companies?.name ?? null, isIndividual: !!p.is_individual,
      tracks: p.structure === "tracks" ? reachable.map((t: any) => ({ id: t.id, name: t.name })) : [],
      needsTrack,
      recommended: studentCompanyId ? p.company_id === studentCompanyId : !!p.is_individual,
      full,
    })
  }
  return out.sort((a, b) => Number(b.recommended) - Number(a.recommended) || a.name.localeCompare(b.name))
}

export type Decision =
  | { ok: true; programId: string; created: boolean; enrollments: number }
  | { ok: false; status: number; error: string }

/** Approve into an existing program, or create one when `createName` is given. */
export async function approveRequest(o: {
  requestId: string
  adminId: string
  programId?: string | null
  trackId?: string | null
  createName?: string | null
}): Promise<Decision> {
  const r = await loadRequest(o.requestId)
  if (!r) return { ok: false, status: 404, error: "Request not found" }
  if (r.status !== "pending") return { ok: false, status: 409, error: "That request has already been answered" }
  if (!r.lms_students) return { ok: false, status: 409, error: "The student no longer exists" }

  let programId = o.programId ?? null
  let trackId = o.trackId ?? null
  let created = false

  if (o.createName) {
    const made = await createProgramFor(o.createName, r.lms_students.company_id, r.course_id, o.adminId)
    if (!made.ok) return made
    programId = made.id
    created = true
  } else {
    if (!programId) return { ok: false, status: 400, error: "Choose a program, or create one" }
    const options = await programOptions(r.lms_students.company_id, r.course_id)
    const chosen = options.find(p => p.id === programId)
    if (!chosen) return { ok: false, status: 400, error: "That program doesn't deliver this course, or is closed" }
    if (chosen.full) return { ok: false, status: 409, error: "That program is full" }
    if (chosen.tracks.length) {
      if (trackId && !chosen.tracks.some(t => t.id === trackId))
        return { ok: false, status: 400, error: "That track doesn't deliver this course" }
      if (!trackId) {
        if (chosen.needsTrack) return { ok: false, status: 400, error: "Choose which track they join" }
        trackId = chosen.tracks[0].id
      }
    } else trackId = null
  }

  // Already in the program — just make sure the enrolment exists.
  const { data: existing } = await db.from("lms_program_members")
    .select("id, status").eq("program_id", programId!).eq("student_id", r.student_id).maybeSingle()
  let memberId = (existing as any)?.id as string | undefined
  if ((existing as any)?.status === "withdrawn")
    return { ok: false, status: 409, error: "They were withdrawn from that program. Reinstate them there instead." }

  if (!memberId) {
    const { data: member, error } = await db.from("lms_program_members")
      .insert({ program_id: programId, student_id: r.student_id, track_id: trackId, added_by: o.adminId })
      .select("id").single()
    if (error || !member) return { ok: false, status: 500, error: "Could not add them to the program" }
    memberId = (member as any).id
  }

  const sync = await syncMemberEnrollments(memberId!, o.adminId, { notify: true })

  await db.from("lms_course_requests").update({
    status: "approved", program_id: programId, decided_by: o.adminId, decided_at: new Date().toISOString(),
  }).eq("id", r.id).eq("status", "pending")

  return { ok: true, programId: programId!, created, enrollments: sync.created + sync.reactivated }
}

export async function rejectRequest(o: { requestId: string; adminId: string; reason: string }): Promise<Decision> {
  const r = await loadRequest(o.requestId)
  if (!r) return { ok: false, status: 404, error: "Request not found" }
  if (r.status !== "pending") return { ok: false, status: 409, error: "That request has already been answered" }
  const reason = o.reason.trim().slice(0, 1000)
  if (!reason) return { ok: false, status: 400, error: "Give the student a reason" }

  await db.from("lms_course_requests").update({
    status: "rejected", decision_note: reason, decided_by: o.adminId, decided_at: new Date().toISOString(),
  }).eq("id", r.id).eq("status", "pending")

  // Tell them, under the catalogue email switch.
  if (r.lms_students) {
    const body = `
      <h2 style="margin:0 0 6px;color:#1e293b;font-size:22px;">About your course request</h2>
      <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6;">
        Hi ${r.lms_students.name}, thank you for your interest in <strong>${r.lms_courses?.title ?? "the course"}</strong>.
        We aren't able to enrol you this time.
      </p>
      <p style="margin:0;color:#334155;font-size:14px;line-height:1.6;border-left:3px solid ${BLUE};padding-left:12px;">${reason}</p>
      <p style="text-align:center;">${btn("Browse Other Courses →", `${APP_BASE_URL}/lms/catalogue`)}</p>`
    await sendRuleEmail({
      rule: "catalogue_ack", to: r.lms_students.email, studentId: r.student_id, courseId: r.course_id,
      subject: `Your request for "${r.lms_courses?.title ?? "a course"}" — ICS Aviation`, html: baseTemplate(body),
    }).catch(() => {})
  }
  return { ok: true, programId: "", created: false, enrollments: 0 }
}

/**
 * A one-course program for this student's client (or for individuals), running
 * from today. Created as a draft, given its course, then made active — the same
 * steps an admin would take in Program Manager.
 */
async function createProgramFor(name: string, companyId: string | null, courseId: string, adminId: string):
  Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  const clean = name.trim().slice(0, 200)
  if (!clean) return { ok: false, status: 400, error: "Give the new program a name" }

  if (companyId) {
    const { data: company } = await db.from("lms_companies").select("status").eq("id", companyId).maybeSingle()
    if ((company as any)?.status !== "active")
      return { ok: false, status: 409, error: "Their company is inactive, so a program can't be created for it" }
  }

  const { data: program, error } = await db.from("lms_programs").insert({
    name: clean,
    company_id: companyId, is_individual: !companyId,
    structure: "course", status: "draft",
    start_date: new Date().toISOString().slice(0, 10),
    created_by: adminId,
  }).select("id").single()
  if (error || !program) return { ok: false, status: 500, error: "Could not create the program" }
  const id = (program as any).id

  const { error: itemErr } = await db.from("lms_program_items").insert({ program_id: id, track_id: null, course_id: courseId, order_index: 0 })
  if (itemErr) {
    await db.from("lms_programs").delete().eq("id", id)
    return { ok: false, status: 500, error: "Could not add the course to the new program" }
  }
  await ensureProgramRules(id)
  await db.from("lms_programs").update({ status: "active" }).eq("id", id)
  return { ok: true, id }
}
