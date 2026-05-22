import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"

// Admin releases results for all (or specific) candidates
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id } = await params
  const { candidate_id } = await req.json()

  let query = db
    .from("candidates")
    .update({ results_released: true })
    .eq("exam_id", exam_id)

  if (candidate_id) query = query.eq("id", candidate_id)

  const { error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditLog(
    session, "results.release", "exam", exam_id, null,
    { candidate_id: candidate_id ?? "all" },
  )

  return NextResponse.json({ success: true })
}
