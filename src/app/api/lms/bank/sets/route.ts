// Step 11 — question sets. A set is what a draw section picks from, and the
// home of every exam question.
//
// GET    → sets with how many questions each holds, by difficulty, and who uses it
// POST   → { name, description?, course_id? }
// PATCH  → { id, name?, description?, archived? }
//
// Sets are archived, never deleted: a paper may still hold their questions.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import { examsUsing } from "@/lib/lms-exam-bank"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null)

export async function GET(req: Request) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const withArchived = new URL(req.url).searchParams.get("archived") === "1"

  let q = db.from("lms_question_sets")
    .select("id, name, description, course_id, source_exam_id, archived_at, created_at, lms_courses(title)")
    .order("name")
  if (!withArchived) q = q.is("archived_at", null)
  const { data: sets, error } = await q
  if (error) return NextResponse.json({ error: "Could not load sets" }, { status: 500 })

  const ids = (sets ?? []).map((s: any) => s.id)
  const { data: qs } = ids.length
    ? await db.from("lms_bank_questions").select("set_id, difficulty, archived_at").in("set_id", ids)
    : { data: [] as any[] }
  const uses = ids.length ? await examsUsing({ setIds: ids }) : []

  return NextResponse.json((sets ?? []).map((s: any) => {
    const mine = (qs ?? []).filter((q: any) => q.set_id === s.id)
    const live = mine.filter((q: any) => !q.archived_at)
    return {
      id: s.id, name: s.name, description: s.description, archived_at: s.archived_at,
      course: s.course_id ? { id: s.course_id, title: s.lms_courses?.title ?? "" } : null,
      from_exam: !!s.source_exam_id,
      counts: {
        total: live.length,
        easy: live.filter((q: any) => q.difficulty === "easy").length,
        medium: live.filter((q: any) => q.difficulty === "medium").length,
        hard: live.filter((q: any) => q.difficulty === "hard").length,
        archived: mine.length - live.length,
      },
      // Distinct exams drawing from this set.
      used_by: new Set(uses.filter(u => u.setId === s.id).map(u => u.moduleId)).size,
    }
  }))
}

export async function POST(req: Request) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const body = await req.json().catch(() => ({}))
  const name = text(body.name, 200)
  if (!name) return NextResponse.json({ error: "Name the set" }, { status: 400 })
  const courseId = typeof body.course_id === "string" && UUID_RE.test(body.course_id) ? body.course_id : null

  const { data, error } = await db.from("lms_question_sets")
    .insert({ name, description: text(body.description, 1000), course_id: courseId, created_by: g.session.id })
    .select("id, name, description, course_id, archived_at").single()
  if (error) return NextResponse.json({ error: "Could not create the set" }, { status: 500 })
  await auditLog({ user: { id: g.session.id, name: g.session.name } } as any, "lms.bank.set.create", "lms_question_set", (data as any).id, name)
  return NextResponse.json(data, { status: 201 })
}

export async function PATCH(req: Request) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const body = await req.json().catch(() => ({}))
  const id = body.id
  if (typeof id !== "string" || !UUID_RE.test(id)) return NextResponse.json({ error: "id required" }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.name !== undefined) {
    const n = text(body.name, 200)
    if (!n) return NextResponse.json({ error: "Name the set" }, { status: 400 })
    updates.name = n
  }
  if (body.description !== undefined) updates.description = text(body.description, 1000)
  if (typeof body.archived === "boolean") {
    if (body.archived) {
      // A live exam drawing from it would be left without questions.
      const drawing = (await examsUsing({ setIds: [id] })).filter(u => u.how === "draw")
      if (drawing.length)
        return NextResponse.json({
          error: `Exams still draw from this set: ${drawing.map(u => `"${u.examTitle}" (${u.courseTitle})`).join(", ")}. Change those first.`,
        }, { status: 409 })
    }
    updates.archived_at = body.archived ? new Date().toISOString() : null
  }

  const { data, error } = await db.from("lms_question_sets").update(updates).eq("id", id)
    .select("id, name, description, course_id, archived_at").single()
  if (error) return NextResponse.json({ error: "Could not save the set" }, { status: 500 })
  await auditLog({ user: { id: g.session.id, name: g.session.name } } as any, "lms.bank.set.update", "lms_question_set", id, (data as any).name,
    { fields: Object.keys(updates) })
  return NextResponse.json(data)
}
