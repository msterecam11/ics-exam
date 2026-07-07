import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// GET — list all question banks with question count + exam usage count
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: banks, error } = await db
    .from("question_banks")
    .select("id, name, description, created_at, questions(id), exams(id)")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const enriched = (banks ?? []).map((b: any) => ({
    id: b.id, name: b.name, description: b.description, created_at: b.created_at,
    question_count: (b.questions ?? []).length,
    exam_count: (b.exams ?? []).length,
  }))

  return NextResponse.json(enriched)
}

// POST — create a new bank
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { name, description } = body
  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 })

  const { data, error } = await db
    .from("question_banks")
    .insert({ name: name.trim(), description: description?.trim() || null, created_by: session.user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
