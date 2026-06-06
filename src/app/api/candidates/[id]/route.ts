import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"

// DELETE /api/candidates/[id] — delete a candidate and all their answers
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  // Fetch candidate name + exam for audit log
  const { data: candidate } = await db
    .from("candidates")
    .select("full_name, email, exam_id")
    .eq("id", id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Delete answers first (foreign key), then the candidate row
  await db.from("answers").delete().eq("candidate_id", id)
  const { error } = await db.from("candidates").delete().eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditLog(
    session, "candidate.delete", "candidate", id,
    `${candidate.full_name} (${candidate.email})`,
    { exam_id: candidate.exam_id },
  )

  return NextResponse.json({ ok: true })
}
