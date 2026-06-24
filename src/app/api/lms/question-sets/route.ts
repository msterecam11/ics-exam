import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const SetSchema = z.object({
  name:        z.string().trim().min(1).max(200),
  description: z.string().max(1000).optional(),
  topic:       z.string().max(100).optional(),
})

// ── GET — list all sets with question count ────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search")?.trim() ?? ""
  const topic  = searchParams.get("topic")?.trim() ?? ""

  // Fetch sets
  let query = db
    .from("lms_question_sets")
    .select("id, name, description, topic, created_at, created_by")
    .order("created_at", { ascending: false })

  if (search) query = query.ilike("name", `%${search}%`)
  if (topic)  query = query.eq("topic", topic)

  const { data: sets, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (!sets?.length) return NextResponse.json([])

  // Fetch question counts + difficulty breakdown per set
  const setIds = sets.map(s => s.id)
  const { data: qRows } = await db
    .from("lms_questions")
    .select("set_id, difficulty")
    .in("set_id", setIds)

  const countMap: Record<string, { total: number; easy: number; medium: number; hard: number }> = {}
  for (const q of (qRows ?? [])) {
    if (!q.set_id) continue
    if (!countMap[q.set_id]) countMap[q.set_id] = { total: 0, easy: 0, medium: 0, hard: 0 }
    countMap[q.set_id].total++
    countMap[q.set_id][q.difficulty as "easy" | "medium" | "hard"]++
  }

  const result = sets.map(s => ({
    ...s,
    question_count: countMap[s.id]?.total  ?? 0,
    easy_count:     countMap[s.id]?.easy   ?? 0,
    medium_count:   countMap[s.id]?.medium ?? 0,
    hard_count:     countMap[s.id]?.hard   ?? 0,
  }))

  return NextResponse.json(result)
}

// ── POST — create set ──────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = SetSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })

  const { data, error } = await db
    .from("lms_question_sets")
    .insert({ ...parsed.data, created_by: session.user.id })
    .select("id, name, description, topic, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, question_count: 0, easy_count: 0, medium_count: 0, hard_count: 0 }, { status: 201 })
}

// ── PATCH — update set ─────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { id, ...rest } = body as Record<string, unknown>
  if (!id || typeof id !== "string")
    return NextResponse.json({ error: "id required" }, { status: 400 })

  const parsed = SetSchema.partial().safeParse(rest)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })

  const { data, error } = await db
    .from("lms_question_sets")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, name, description, topic, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── DELETE — delete set (only if empty) ───────────────────────────────────
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Check if any questions are still linked
  const { count } = await db
    .from("lms_questions")
    .select("id", { count: "exact", head: true })
    .eq("set_id", id)

  if ((count ?? 0) > 0)
    return NextResponse.json({ error: "Remove all questions from this set before deleting it" }, { status: 409 })

  const { error } = await db.from("lms_question_sets").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
