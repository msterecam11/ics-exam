import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const { data, error } = await db
    .from("question_banks")
    .select("*, exams(id, title)")
    .eq("id", id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const body = await req.json()
  const { name, description } = body

  const { data, error } = await db
    .from("question_banks")
    .update({ name, description })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Refuse to delete a bank that's still linked to an exam — force the admin
  // to unlink first so an exam never silently loses its question source.
  // Checks both the legacy single-bank column and the multi-bank join table.
  const [{ count: legacyCount }, { count: multiCount }] = await Promise.all([
    db.from("exams").select("*", { count: "exact", head: true }).eq("question_bank_id", id),
    db.from("exam_question_banks").select("*", { count: "exact", head: true }).eq("question_bank_id", id),
  ])

  if ((legacyCount ?? 0) > 0 || (multiCount ?? 0) > 0) {
    return NextResponse.json({ error: "This bank is linked to one or more exams. Unlink it first." }, { status: 409 })
  }

  const { error } = await db.from("question_banks").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
