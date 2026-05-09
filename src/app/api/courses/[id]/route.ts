import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody, res400, res413, BodyTooLargeError } from "@/lib/apiUtils"
import { z } from "zod"

const CourseUpdateSchema = z.object({
  name       : z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  group_id   : z.string().uuid(),
})

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  let body: unknown
  try { body = await parseBody(req) } catch (e) {
    return e instanceof BodyTooLargeError ? res413() : res400("Invalid request body")
  }
  const parsed = CourseUpdateSchema.safeParse(body)
  if (!parsed.success) return res400(parsed.error.issues[0]?.message ?? "Invalid input")
  const { name, description, group_id } = parsed.data

  const { data, error } = await db
    .from("courses")
    .update({ name: name.trim(), description: description?.trim() || null, group_id })
    .eq("id", id)
    .select("*, groups(id, name)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  const { error } = await db.from("courses").delete().eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
