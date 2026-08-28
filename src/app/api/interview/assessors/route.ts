import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { sendAssessorCredentialsEmail } from "@/lib/ms-graph"
import { auditLog } from "@/lib/audit"

// Only admin + instructor can manage assessors
function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// Brought up to the same validation bar as /api/lms/settings/users — this
// route is a second, independent write path into admin_users and previously
// had no email-format check and no password max-length cap.
const CreateSchema = z.object({
  name:     z.string().trim().min(1).max(100),
  email:    z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  sendEmail: z.boolean().optional(),
})
const UpdateSchema = z.object({
  id:        z.string().uuid(),
  name:      z.string().trim().min(1).max(100).optional(),
  email:     z.string().trim().email().max(255).optional(),
  password:  z.string().min(8).max(128).optional(),
  sendEmail: z.boolean().optional(),
})

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

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = CreateSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  const { name, email, password, sendEmail } = parsed.data

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

  await auditLog(session, "assessor.create", "admin_user", data.id, data.name)

  // Send credential email — await it so we can report success/failure to the UI
  let emailSent = false
  let emailError: string | null = null
  if (sendEmail) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    try {
      await sendAssessorCredentialsEmail({
        assessorName:  name.trim(),
        assessorEmail: email.trim().toLowerCase(),
        password,
        loginUrl:      `${appUrl}/auth/login`,
      })
      emailSent = true
    } catch (err: any) {
      emailError = err?.message ?? "Unknown email error"
      console.error("[Assessor email] failed:", emailError)
    }
  }

  return NextResponse.json({ ...data, group_count: 0, emailSent, emailError }, { status: 201 })
}

// PATCH — update name / email, or reset password
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: unknown
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const parsed = UpdateSchema.safeParse(body)
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 })
  const { id, name, email, password, sendEmail } = parsed.data

  const updates: Record<string, unknown> = {}
  if (name)  updates.name  = name
  if (email) updates.email = email
  if (password) {
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

  await auditLog(session, "assessor.update", "admin_user", data.id, data.name, {
    changed: Object.keys(updates).filter((k) => k !== "password_hash"),
    ...(password ? { password_reset: true } : {}),
  })

  // Send credential email for password resets
  let emailSent = false
  let emailError: string | null = null
  if (sendEmail && password && data) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    try {
      await sendAssessorCredentialsEmail({
        assessorName:  data.name,
        assessorEmail: data.email,
        password,
        loginUrl:      `${appUrl}/auth/login`,
        isReset:       true,
      })
      emailSent = true
    } catch (err: any) {
      emailError = err?.message ?? "Unknown email error"
      console.error("[Assessor reset email] failed:", emailError)
    }
  }

  return NextResponse.json({ ...data, emailSent, emailError })
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

  const { data: target } = await db.from("admin_users").select("name, email").eq("id", id).single()

  const { error } = await db
    .from("admin_users")
    .delete()
    .eq("id", id)
    .eq("role", "assessor")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await auditLog(session, "assessor.delete", "admin_user", id, target?.name ?? target?.email ?? null)
  return NextResponse.json({ ok: true })
}
