import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

type Params = { params: Promise<{ groupId: string }> }

// POST — advance status: active → complete → published, and lock when complete
export async function POST(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId } = await params
  const body = await req.json().catch(() => ({}))
  const { action } = body // "complete" | "publish" | "reopen"

  const { data: group } = await db
    .from("assessment_groups")
    .select("status, locked")
    .eq("id", groupId)
    .single()

  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  let updates: Record<string, unknown> = {}

  if (action === "complete") {
    if (group.status !== "active")
      return NextResponse.json({ error: "Group must be active to complete" }, { status: 409 })
    updates = { status: "complete", locked: true }
  } else if (action === "publish") {
    if (group.status !== "complete")
      return NextResponse.json({ error: "Group must be complete to publish" }, { status: 409 })
    updates = { status: "published", locked: true }
  } else if (action === "reopen") {
    if (!["admin"].includes(session.user.role ?? ""))
      return NextResponse.json({ error: "Only admins can reopen groups" }, { status: 403 })
    if (group.status === "draft")
      return NextResponse.json({ error: "Group is already in draft" }, { status: 409 })
    updates = { status: "active", locked: false }
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }

  const { data, error } = await db
    .from("assessment_groups")
    .update(updates)
    .eq("id", groupId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
