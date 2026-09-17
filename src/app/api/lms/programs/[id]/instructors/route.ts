import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/lms/programs/[id]/instructors — staff who can be assigned
export async function GET() {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { data, error } = await db
    .from("admin_users").select("id, name, email, role")
    .in("role", ["admin", "instructor"]).eq("is_active", true).order("name")
  if (error) return NextResponse.json({ error: "Could not load staff" }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PUT /api/lms/programs/[id]/instructors — replace the list (admin only)
// Body: { user_ids: string[] }
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { id } = await params

  const { data: program } = await db.from("lms_programs").select("id, name").eq("id", id).maybeSingle()
  if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const ids = [...new Set((Array.isArray(body.user_ids) ? body.user_ids : []).filter((x: unknown) => typeof x === "string" && UUID_RE.test(x as string)))] as string[]
  if (ids.length) {
    const { data: staff } = await db.from("admin_users").select("id").in("id", ids).in("role", ["admin", "instructor"])
    if ((staff ?? []).length !== ids.length) return NextResponse.json({ error: "Only admins and instructors can be assigned" }, { status: 400 })
  }

  const { error: delErr } = await db.from("lms_program_instructors").delete().eq("program_id", id)
  if (delErr) return NextResponse.json({ error: "Could not update instructors" }, { status: 500 })
  if (ids.length) {
    const { error } = await db.from("lms_program_instructors").insert(ids.map(user_id => ({ program_id: id, user_id })))
    if (error) return NextResponse.json({ error: "Could not update instructors" }, { status: 500 })
  }

  await auditLog(session, "lms.program.instructors", "lms_program", id, (program as any).name, { count: ids.length })
  return NextResponse.json({ ok: true })
}
