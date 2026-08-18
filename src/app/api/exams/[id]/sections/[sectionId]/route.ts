import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export async function PUT(req: Request, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id, sectionId } = await params
  const body = await req.json()
  const { title, description } = body

  if (!title || typeof title !== "string" || !title.trim())
    return NextResponse.json({ error: "Section title is required" }, { status: 400 })

  const { data, error } = await db
    .from("exam_sections")
    .update({ title: title.trim(), description: description?.trim() || null })
    .eq("id", sectionId)
    .eq("exam_id", exam_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// Deleting a section un-groups its questions (ON DELETE SET NULL) rather
// than deleting them — a section is just a label, not a container.
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; sectionId: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id, sectionId } = await params
  const { error } = await db.from("exam_sections").delete().eq("id", sectionId).eq("exam_id", exam_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
