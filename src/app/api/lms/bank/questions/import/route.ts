import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import { DIFFICULTIES, validateQuestion } from "@/lib/lms-exam-bank"

export const dynamic = "force-dynamic"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ROWS = 500

// POST /api/lms/bank/questions/import — many questions into one set (from a CSV
// read in the browser). Body: { set_id, rows: [{ row, question, difficulty?, tags?, topic? }] }
// Every row is checked exactly like a single new question; nothing is saved
// unless every row is valid, so a file never lands half-imported.
export async function POST(req: Request) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const body = await req.json().catch(() => ({}))
  if (typeof body.set_id !== "string" || !UUID_RE.test(body.set_id)) return NextResponse.json({ error: "Choose a set" }, { status: 400 })
  const rows = Array.isArray(body.rows) ? body.rows : []
  if (!rows.length) return NextResponse.json({ error: "The file has no questions" }, { status: 400 })
  if (rows.length > MAX_ROWS) return NextResponse.json({ error: `At most ${MAX_ROWS} questions per file` }, { status: 400 })

  const { data: set } = await db.from("lms_question_sets").select("id, name, archived_at").eq("id", body.set_id).maybeSingle()
  if (!set) return NextResponse.json({ error: "That set doesn't exist" }, { status: 404 })
  if ((set as any).archived_at) return NextResponse.json({ error: "That set is archived" }, { status: 409 })

  const errors: { row: number; error: string }[] = []
  const inserts: any[] = []
  for (const r of rows) {
    const rowNo = Number(r?.row) || 0
    const v = validateQuestion(r?.question)
    if (!v.ok) { errors.push({ row: rowNo, error: v.error }); continue }
    inserts.push({
      set_id: body.set_id, type: v.payload.type,
      difficulty: DIFFICULTIES.includes(r.difficulty) ? r.difficulty : "medium",
      tags: [...new Set((Array.isArray(r.tags) ? r.tags : []).map((t: unknown) => String(t ?? "").trim()).filter(Boolean))].slice(0, 20),
      topic: typeof r.topic === "string" && r.topic.trim() ? r.topic.trim().slice(0, 120) : null,
      version: 1, payload: v.payload, created_by: g.session.id, updated_by: g.session.id,
    })
  }
  if (errors.length) return NextResponse.json({ error: "Some rows need fixing — nothing was imported", errors }, { status: 400 })

  const { data, error } = await db.from("lms_bank_questions").insert(inserts).select("id, payload")
  if (error) return NextResponse.json({ error: "Could not save the questions" }, { status: 500 })
  await db.from("lms_bank_question_history").insert(((data ?? []) as any[]).map(q => ({
    question_id: q.id, version: 1, change: "create", payload: q.payload, note: "CSV import", created_by: g.session.id,
  })))
  await auditLog({ user: { id: g.session.id, name: g.session.name } } as any, "lms.bank.import", "lms_question_set", body.set_id, (set as any).name, { count: inserts.length })
  return NextResponse.json({ imported: inserts.length }, { status: 201 })
}
