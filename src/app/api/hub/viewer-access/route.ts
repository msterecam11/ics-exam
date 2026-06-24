import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { z } from "zod"

function isAdmin(role?: string) { return role === "admin" }
function isViewer(role?: string) { return role === "viewer" }

const EXAM_PERMISSIONS      = ["scores", "results", "reports"] as const
const INTERVIEW_PERMISSIONS = ["progress", "scores", "verdicts", "reports"] as const

const AssignSchema = z.object({
  user_id:       z.string().uuid(),
  system:        z.string().min(1).max(50),
  resource_type: z.string().min(1).max(50),
  resource_id:   z.string().uuid(),
  label:         z.string().max(255).optional(),
  permissions:   z.record(z.boolean()).default({}),
})

const UpdatePermSchema = z.object({
  id:          z.string().uuid(),
  permissions: z.record(z.boolean()),
})

// ── GET — list access rows ──────────────────────────────────────────────────
// Admin: ?user_id=<uuid>   → all rows for that user
// Viewer: no params        → their own rows
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const user_id = searchParams.get("user_id")

  if (user_id && user_id !== session.user.id && !isAdmin(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Viewers can only read their own access
  if (isViewer(session.user.role) && user_id && user_id !== session.user.id)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const targetId = user_id ?? session.user.id

  const { data, error } = await db
    .from("viewer_access")
    .select("id, system, resource_type, resource_id, label, permissions, created_at")
    .eq("user_id", targetId)
    .order("system")
    .order("created_at")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST — assign a resource to a viewer ───────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isAdmin(session.user.role))
    return NextResponse.json({ error: "Only admins can assign viewer access" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = AssignSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })

  const { user_id, system, resource_type, resource_id, label, permissions } = parsed.data

  // Verify target is a viewer
  const { data: targetUser } = await db
    .from("admin_users").select("role").eq("id", user_id).single()
  if (!targetUser || targetUser.role !== "viewer")
    return NextResponse.json({ error: "Target user must be a viewer" }, { status: 400 })

  // Validate permissions keys make sense for the system
  const allowedKeys = system === "exam" ? EXAM_PERMISSIONS : INTERVIEW_PERMISSIONS
  const cleanPerms = Object.fromEntries(
    allowedKeys.map(k => [k, permissions[k] === true])
  )

  const { data, error } = await db
    .from("viewer_access")
    .upsert({
      user_id, system, resource_type, resource_id,
      label: label ?? null,
      permissions: cleanPerms,
      created_by: session.user.id,
    }, { onConflict: "user_id,system,resource_id" })
    .select("id, system, resource_type, resource_id, label, permissions, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// ── PATCH — update permissions on an existing row ──────────────────────────
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isAdmin(session.user.role))
    return NextResponse.json({ error: "Only admins can update viewer access" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = UpdatePermSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })

  const { id, permissions } = parsed.data

  const { data, error } = await db
    .from("viewer_access")
    .update({ permissions })
    .eq("id", id)
    .select("id, system, resource_type, resource_id, label, permissions, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── DELETE — revoke a specific access row ──────────────────────────────────
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || !isAdmin(session.user.role))
    return NextResponse.json({ error: "Only admins can revoke viewer access" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const { error } = await db.from("viewer_access").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
