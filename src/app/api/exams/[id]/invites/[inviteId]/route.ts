import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Admin: revoke a pending/opened invite (does not touch a candidate that
// already completed it — revoke only blocks the link from being used again).
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string; inviteId: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { inviteId } = await params
  const { error } = await db
    .from("exam_invites")
    .update({ status: "revoked" })
    .eq("id", inviteId)
    .neq("status", "completed")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
