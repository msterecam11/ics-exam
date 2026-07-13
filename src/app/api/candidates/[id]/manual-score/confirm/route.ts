import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { auditLog } from "@/lib/audit"

// Flips the current draft into 'confirmed' — this is what unlocks Manual
// Answers/Report/Release for this candidate. Also the point at which a
// changed target requires re-confirmation before release is possible again,
// since editing (a new POST) always creates a fresh 'draft' version.
export async function PATCH(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: candidateId } = await params

  const { data: draft } = await db
    .from("manual_scores")
    .select("id, status")
    .eq("candidate_id", candidateId)
    .in("status", ["draft", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!draft) return NextResponse.json({ error: "No manual score to confirm" }, { status: 404 })
  if (draft.status === "confirmed") return NextResponse.json({ manualScore: draft })

  const { data: updated, error } = await db
    .from("manual_scores")
    .update({ status: "confirmed", confirmed_at: new Date().toISOString() })
    .eq("id", draft.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditLog(session, "manual_score.confirm", "candidate", candidateId, null, { manual_score_id: draft.id })

  return NextResponse.json({ manualScore: updated })
}
