import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"

// Only admin + instructor can manage assessors
function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET — list all assessors with group count
export async function GET() {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await db
    .from("admin_users")
    .select("id, name, email, role, created_at")
    .eq("role", "assessor")
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch group counts per assessor
  const ids = (data ?? []).map((u: any) => u.id)
  let groupCounts: Record<string, number> = {}

  if (ids.length > 0) {
    const { data: assignments } = await db
      .from("group_assessors")
      .select("assessor_id")
      .in("assessor_id", ids)

    for (const a of assignments ?? []) {
      groupCounts[a.assessor_id] = (groupCounts[a.assessor_id] ?? 0) + 1
    }
  }

  const enriched = (data ?? []).map((u: any) => ({
    ...u,
    group_count: groupCounts[u.id] ?? 0,
  }))

  return NextResponse.json(enriched)
}

// POST — create new assessor
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { name, email, password } = body

  if (!name?.trim())     return NextResponse.json({ error: "Name is required" },     { status: 400 })
  if (!email?.trim())    return NextResponse.json({ error: "Email is required" },    { status: 400 })
  if (!password || password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })

  const password_hash = await bcrypt.hash(password, 12)

  const { data, error } = await db
    .from("admin_users")
    .insert({
      name:          name.trim(),
      email:         email.trim().toLowerCase(),
      password_hash,
      role:          "assessor",
    })
    .select("id, name, email, role, created_at")
    .single()

  if (error) {
    if (error.code === "23505") // unique violation
      return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ...data, group_count: 0 }, { status: 201 })
}

// PATCH — update name / email, or reset password
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { id, name, email, password } = body

  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (name?.trim())  updates.name  = name.trim()
  if (email?.trim()) updates.email = email.trim().toLowerCase()
  if (password) {
    if (password.length < 8)
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
    updates.password_hash   = await bcrypt.hash(password, 12)
    updates.failed_attempts = 0
    updates.locked_until    = null
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 })

  const { data, error } = await db
    .from("admin_users")
    .update(updates)
    .eq("id", id)
    .eq("role", "assessor") // safety — cannot patch non-assessors via this route
    .select("id, name, email, role, created_at")
    .single()

  if (error) {
    if (error.code === "23505")
      return NextResponse.json({ error: "Email already in use" }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// DELETE — remove assessor (only if not assigned to active/published groups)
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Only admins can delete assessors" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Block if assessor has scored anything (data integrity)
  const { count } = await db
    .from("scores")
    .select("*", { count: "exact", head: true })
    .eq("assessor_id", id)

  if ((count ?? 0) > 0)
    return NextResponse.json({
      error: "Cannot delete — this assessor has submitted scores. Remove them from groups instead.",
    }, { status: 409 })

  const { error } = await db
    .from("admin_users")
    .delete()
    .eq("id", id)
    .eq("role", "assessor")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
