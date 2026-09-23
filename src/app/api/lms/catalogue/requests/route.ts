// CV-6 / SP-16 — a student asking to join a course, and the list of what they
// have asked for.
//
// GET    → their own requests
// POST   → ask for one course ({ course_id, note? })
// DELETE → withdraw a request they haven't had an answer to yet

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession, PREVIEW_READ_ONLY } from "@/lib/lms-auth"
import { openGroups } from "@/lib/lms-groups"
import { todayISO } from "@/lib/lms-enrollment"
import { catalogueViewer, visibleTo } from "@/lib/lms-catalogue"
import { loadEmailSettings, effectiveRule, sendRuleEmail } from "@/lib/lms-email-settings"
import { buildCatalogueAckEmail, buildCatalogueAdminEmail } from "@/lib/lms-email-templates"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await db
    .from("lms_course_requests")
    .select("id, course_id, note, status, decision_note, created_at, decided_at, lms_courses(id, title, thumbnail_url)")
    .eq("student_id", student.id)
    .order("created_at", { ascending: false })

  return NextResponse.json((data ?? []).map((r: any) => ({
    id: r.id, status: r.status, note: r.note, reason: r.decision_note,
    created_at: r.created_at, decided_at: r.decided_at,
    course: { id: r.course_id, title: r.lms_courses?.title ?? "A course", thumbnail_url: r.lms_courses?.thumbnail_url ?? null },
  })))
}

export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (student.preview) return NextResponse.json(PREVIEW_READ_ONLY, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const courseId = body?.course_id
  if (typeof courseId !== "string" || !UUID_RE.test(courseId))
    return NextResponse.json({ error: "Which course?" }, { status: 400 })
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, 1000) : null
  // An onsite date they'd like (optional): an open group of this course with a seat.
  let groupId: string | null = null
  if (body.group_id) {
    if (typeof body.group_id !== "string" || !UUID_RE.test(body.group_id)) return NextResponse.json({ error: "Which date?" }, { status: 400 })
    const open = (await openGroups(courseId, todayISO())).find(g => g.id === body.group_id)
    if (!open) return NextResponse.json({ error: "Those dates aren't available any more" }, { status: 409 })
    if (open.full) return NextResponse.json({ error: "Those dates are full — please choose another" }, { status: 409 })
    groupId = open.id
  }

  // They may only ask for a course they can actually see.
  const viewer = await catalogueViewer(student.id)
  const { data: course } = await db
    .from("lms_courses")
    .select("id, title, status, catalogue_visibility, catalogue_companies")
    .eq("id", courseId).maybeSingle()
  if (!viewer || !course || !visibleTo(course as any, viewer))
    return NextResponse.json({ error: "That course isn't available" }, { status: 404 })

  // CV-5 — already on it, nothing to ask for.
  const { data: already } = await db
    .from("lms_enrollments").select("id").eq("student_id", student.id).eq("course_id", courseId)
    .neq("status", "dropped").maybeSingle()
  if (already) return NextResponse.json({ error: "You're already enrolled in this course" }, { status: 409 })

  const { data, error } = await db
    .from("lms_course_requests")
    .insert({ student_id: student.id, course_id: courseId, note, group_id: groupId })
    .select("id, course_id, status, note, created_at")
    .single()

  if (error) {
    // CV-6 — one pending request per course, enforced by a unique index.
    if (error.code === "23505")
      return NextResponse.json({ error: "You've already asked for this course. We'll come back to you." }, { status: 409 })
    return NextResponse.json({ error: "Could not send your request" }, { status: 500 })
  }

  // EM-11 / EM-14 — confirm to the student, tell the admins. Never fatal: a
  // mail problem must not lose the request.
  notifyRequest(student.id, (course as any).title, note).catch(err =>
    console.error("[catalogue] request emails failed", err))

  return NextResponse.json(data, { status: 201 })
}

export async function DELETE(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (student.preview) return NextResponse.json(PREVIEW_READ_ONLY, { status: 403 })

  const id = new URL(req.url).searchParams.get("id")
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { data, error } = await db
    .from("lms_course_requests")
    .update({ status: "cancelled", decided_at: new Date().toISOString() })
    .eq("id", id).eq("student_id", student.id).eq("status", "pending")
    .select("id").maybeSingle()

  if (error) return NextResponse.json({ error: "Could not withdraw the request" }, { status: 500 })
  if (!data) return NextResponse.json({ error: "That request has already been answered" }, { status: 409 })
  return NextResponse.json({ ok: true })
}

async function notifyRequest(studentId: string, courseTitle: string, note: string | null) {
  const { data: student } = await db
    .from("lms_students").select("name, email, phone, lms_companies(name)").eq("id", studentId).single()
  if (!student) return
  const s = student as any
  const settings = await loadEmailSettings()

  // EM-11 — to the person who asked.
  const ack = buildCatalogueAckEmail({ name: s.name, courseTitle })
  await sendRuleEmail({ settings, rule: "catalogue_ack", to: s.email, studentId, ...ack })

  // EM-14 — to the admins, as it happens.
  if (!effectiveRule(settings, "catalogue_admin").enabled) return
  const { data: admins } = await db
    .from("admin_users").select("email").eq("role", "admin").eq("is_active", true)
  const note2 = buildCatalogueAdminEmail({
    name: s.name, email: s.email, company: s.lms_companies?.name ?? null, phone: s.phone ?? null,
    courseTitle, message: note,
  })
  for (const a of (admins ?? []) as any[])
    await sendRuleEmail({ settings, rule: "catalogue_admin", to: a.email, studentId, ...note2 })
}
