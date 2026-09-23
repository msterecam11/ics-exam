// GET /api/lms/groups/staff — accounts that can be given a role in a group.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"

export const dynamic = "force-dynamic"

export async function GET() {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const { data, error } = await db.from("admin_users").select("id, name, email, role")
    .in("role", ["admin", "instructor", "facilitator"]).eq("is_active", true).order("name")
  if (error) return NextResponse.json({ error: "Could not load staff" }, { status: 500 })
  return NextResponse.json(data ?? [])
}
