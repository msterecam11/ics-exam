import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

// Bulk lookup of every candidate's active (draft/confirmed) manual score for
// this exam, keyed by candidate_id — powers the results table's Manual
// button state and score badge without an N+1 fetch per row.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: examId } = await params

  const { data: candidateIds } = await db
    .from("candidates")
    .select("id")
    .eq("exam_id", examId)

  const ids = (candidateIds ?? []).map(c => c.id)
  if (ids.length === 0) return NextResponse.json({ manualScores: {} })

  const { data: rows } = await db
    .from("manual_scores")
    .select("*")
    .in("candidate_id", ids)
    .in("status", ["draft", "confirmed"])
    .order("created_at", { ascending: false })

  // In case of a race between supersede-and-insert, keep only the newest
  // active row per candidate (there should only ever be one anyway).
  const byCandidate: Record<string, any> = {}
  for (const row of rows ?? []) {
    if (!byCandidate[row.candidate_id]) byCandidate[row.candidate_id] = row
  }

  return NextResponse.json({ manualScores: byCandidate })
}
