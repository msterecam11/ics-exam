import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody, res400, res413, BodyTooLargeError } from "@/lib/apiUtils"
import bcrypt from "bcryptjs"
import { z } from "zod"

const ProfileSchema = z.object({
  name            : z.string().trim().min(1).max(100),
  email           : z.string().trim().email().max(255),
  current_password: z.string().max(128).optional(),
  new_password    : z.string().min(8).max(128)
    .regex(/[A-Z]/,         "Password must contain at least one uppercase letter")
    .regex(/[a-z]/,         "Password must contain at least one lowercase letter")
    .regex(/[0-9]/,         "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character")
    .optional(),
})

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let body: unknown
  try { body = await parseBody(req) } catch (e) {
    return e instanceof BodyTooLargeError ? res413() : res400("Invalid request body")
  }
  const parsed = ProfileSchema.safeParse(body)
  if (!parsed.success) return res400(parsed.error.issues[0]?.message ?? "Invalid input")
  const { name, email, current_password, new_password } = parsed.data

  // If changing password, verify current password first
  if (new_password) {
    const { data: user } = await db
      .from("admin_users")
      .select("password_hash")
      .eq("id", session.user.id)
      .single()

    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

    const valid = await bcrypt.compare(current_password ?? "", user.password_hash)
    if (!valid) return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 })

    if (new_password.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 })
    }
  }

  // Check email uniqueness if changed
  const { data: existing } = await db
    .from("admin_users")
    .select("id")
    .eq("email", email.trim())
    .neq("id", session.user.id)
    .single()

  if (existing) {
    return NextResponse.json({ error: "Email is already in use by another account" }, { status: 400 })
  }

  const updates: Record<string, string> = {
    name: name.trim(),
    email: email.trim(),
  }

  if (new_password) {
    updates.password_hash = await bcrypt.hash(new_password, 12)
  }

  const { data, error } = await db
    .from("admin_users")
    .update(updates)
    .eq("id", session.user.id)
    .select("id, name, email, role")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
