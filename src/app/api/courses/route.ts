import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody, res400, res413, BodyTooLargeError } from "@/lib/apiUtils"
import { z } from "zod"

const CourseSchema = z.object({
  name       : z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  group_id   : z.string().uuid(),
})

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const groupId = searchParams.get("group_id")

  let query = db
    .from("courses")
    .select("*, groups(id, name), exams(id)")
    .order("created_at", { ascending: false })

  if (groupId) query = query.eq("group_id", groupId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await parseBody(req) } catch (e) {
    return e instanceof BodyTooLargeError ? res413() : res400("Invalid request body")
  }
  const parsed = CourseSchema.safeParse(body)
  if (!parsed.success) return res400(parsed.error.issues[0]?.message ?? "Invalid input")
  const { name, description, group_id } = parsed.data

  const { data, error } = await db
    .from("courses")
    .insert({ name: name.trim(), description: description?.trim() || null, group_id, created_by: session.user.id })
    .select("*, groups(id, name)")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
