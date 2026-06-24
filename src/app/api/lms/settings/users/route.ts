import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"

function isAdmin(role?: string) { return role === "admin" }
function isMgr(role?: string)   { return role === "admin" || role === "instructor" }

const CreateSchema = z.object({
  name:       z.string().trim().min(1).max(100),
  email:      z.string().trim().email().max(255),
  role:       z.enum(["admin", "instructor", "assessor", "viewer"]),
  password:   z.string().min(8).max(128),
  department: z.string().max(100).optional(),
  phone:      z.string().max(50).optional(),
})

const UpdateSchema = z.object({
  id:         z.string().uuid(),
  name:       z.string().trim().min(1).max(100).optional(),
  email:      z.string().trim().email().max(255).optional(),
  role:       z.enum(["admin", "instructor", "assessor", "viewer"]).optional(),
  is_active:  z.boolean().optional(),
  department: z.string().max(100).optional(),
  phone:      z.string().max(50).optional(),
  password:   z.string().min(8).max(128).optional(),
})

// ── GET — list all users ───────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get("search")?.trim() ?? ""
  const role   = searchParams.get("role") ?? "all"

  let query = db
    .from("admin_users")
    .select("id, name, email, role, is_active, department, phone, created_at, last_login_at, locked_until, failed_attempts")
    .order("created_at", { ascending: false })

  if (search) {
    query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%`)
  }
  if (role !== "all") {
    query = query.eq("role", role)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// ── POST — create new user ─────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isAdmin(session.user.role))
    return NextResponse.json({ error: "Only admins can create users" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })

  const { name, email, role, password, department, phone } = parsed.data

  // Check email uniqueness
  const { data: existing } = await db.from("admin_users").select("id").eq("email", email).single()
  if (existing) return NextResponse.json({ error: "Email already in use" }, { status: 409 })

  const password_hash = await bcrypt.hash(password, 12)

  const { data, error } = await db.from("admin_users").insert({
    name, email, role, password_hash,
    department: department ?? null,
    phone: phone ?? null,
    is_active: true,
    failed_attempts: 0,
  }).select("id, name, email, role, is_active, department, phone, created_at").single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}

// ── PATCH — update user ────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isAdmin(session.user.role))
    return NextResponse.json({ error: "Only admins can update users" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })

  const { id, password, ...rest } = parsed.data

  // Prevent self-deactivation / self-role-change to non-admin
  if (id === session.user.id) {
    if (rest.is_active === false)
      return NextResponse.json({ error: "You cannot deactivate your own account" }, { status: 400 })
    if (rest.role && rest.role !== "admin")
      return NextResponse.json({ error: "You cannot change your own role" }, { status: 400 })
  }

  const updates: Record<string, unknown> = { ...rest }
  if (password) {
    updates.password_hash = await bcrypt.hash(password, 12)
    // reset lockout on forced password reset
    updates.failed_attempts = 0
    updates.locked_until = null
  }

  const { data, error } = await db
    .from("admin_users")
    .update(updates)
    .eq("id", id)
    .select("id, name, email, role, is_active, department, phone, created_at, last_login_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// ── DELETE — hard delete (only for non-admin users with no activity) ───────
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || !isAdmin(session.user.role))
    return NextResponse.json({ error: "Only admins can delete users" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  if (id === session.user.id)
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 })

  const { error } = await db.from("admin_users").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
