import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const FolderSchema = z.object({
  name:      z.string().trim().min(1).max(200),
  parent_id: z.string().uuid().nullable().optional(),
  color:     z.string().max(20).optional(),
})

// GET — list all folders (flat, client builds tree)
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await db
    .from("lms_library_folders")
    .select("id, name, parent_id, color, created_at")
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — create folder
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = FolderSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })

  const { data, error } = await db
    .from("lms_library_folders")
    .insert({ ...parsed.data, created_by: session.user.id })
    .select("id, name, parent_id, color, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// PATCH — rename / recolor folder
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { id, ...rest } = body as Record<string, unknown>
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const parsed = FolderSchema.partial().safeParse(rest)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })

  const { data, error } = await db
    .from("lms_library_folders")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id as string)
    .select("id, name, parent_id, color, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — delete folder (cascades to children via FK)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Check files still inside (direct children — user should move them first)
  const { count } = await db
    .from("lms_library_files")
    .select("id", { count: "exact", head: true })
    .eq("folder_id", id)

  if ((count ?? 0) > 0)
    return NextResponse.json({ error: "Move or delete all files in this folder first" }, { status: 409 })

  const { error } = await db.from("lms_library_folders").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
