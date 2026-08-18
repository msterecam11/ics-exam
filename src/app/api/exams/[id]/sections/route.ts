import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id } = await params
  const { data } = await db
    .from("exam_sections")
    .select("*")
    .eq("exam_id", exam_id)
    .order("order_index")

  return NextResponse.json(data ?? [])
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id } = await params
  const body = await req.json()
  const { title, description, order_index } = body

  if (!title || typeof title !== "string" || !title.trim())
    return NextResponse.json({ error: "Section title is required" }, { status: 400 })

  const { data, error } = await db
    .from("exam_sections")
    .insert({
      exam_id,
      title: title.trim(),
      description: description?.trim() || null,
      order_index: order_index ?? 0,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// Reorder sections (same pattern as the questions reorder endpoint)
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id } = await params
  const body = await req.json()
  const { sections } = body

  const updates = sections.map((s: { id: string; order_index: number }) =>
    db.from("exam_sections").update({ order_index: s.order_index }).eq("id", s.id).eq("exam_id", exam_id)
  )

  await Promise.all(updates)
  return NextResponse.json({ success: true })
}
