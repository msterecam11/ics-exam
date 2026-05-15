import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))
  const { assessor_id } = body
  if (!assessor_id) return NextResponse.json({ error: "assessor_id required" }, { status: 400 })

  const { error } = await db
    .from("group_assessors")
    .insert({ group_id: groupId, assessor_id })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

export async function DELETE(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const { searchParams } = new URL(req.url)
  const assessor_id = searchParams.get("assessor_id")
  if (!assessor_id) return NextResponse.json({ error: "assessor_id required" }, { status: 400 })

  const { error } = await db
    .from("group_assessors")
    .delete()
    .eq("group_id", groupId)
    .eq("assessor_id", assessor_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// GET all assessors available to assign (role = assessor)
export async function GET(_: Request, { params }: Params) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await params // not used but required to resolve

  const { data, error } = await db
    .from("admin_users")
    .select("id, name, email, role")
    .eq("role", "assessor")
    .order("name")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
