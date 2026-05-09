import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody, res400, res413, BodyTooLargeError } from "@/lib/apiUtils"
import { z } from "zod"

const GroupSchema = z.object({
  name       : z.string().trim().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
})

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await db
    .from("groups")
    .select("*, courses(id, name)")
    .order("created_at", { ascending: false })

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
  const parsed = GroupSchema.safeParse(body)
  if (!parsed.success) return res400(parsed.error.issues[0]?.message ?? "Invalid input")
  const { name, description } = parsed.data

  const { data, error } = await db
    .from("groups")
    .insert({ name: name.trim(), description: description?.trim() || null, created_by: session.user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
