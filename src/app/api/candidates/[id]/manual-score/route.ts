import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { auditLog } from "@/lib/audit"
import { computeManualScore, type AnswerForManualScore } from "@/lib/manualScore"

// Returns the candidate's current active (draft or confirmed) manual score
// version, with its overrides — or manualScore: null if none exists/all
// versions have been deleted. Used by the results table badge and the
// candidate detail page's Original/Manual toggle.
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: candidateId } = await params

  const { data: manualScore } = await db
    .from("manual_scores")
    .select("*")
    .eq("candidate_id", candidateId)
    .in("status", ["draft", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!manualScore) return NextResponse.json({ manualScore: null, overrides: [] })

  const { data: overrides } = await db
    .from("manual_score_answer_overrides")
    .select("*")
    .eq("manual_score_id", manualScore.id)

  return NextResponse.json({ manualScore, overrides: overrides ?? [] })
}

// Computes and stores a new draft manual score version for this candidate.
// Any prior draft/confirmed version is marked 'superseded' — never deleted.
// Returns the preview (target, achieved, is_exact_match) immediately; the
// admin must call PATCH .../confirm before it's usable elsewhere.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: candidateId } = await params
  const { target_score } = await req.json().catch(() => ({}))

  if (typeof target_score !== "number" || !Number.isFinite(target_score) || target_score < 0 || target_score > 100) {
    return NextResponse.json({ error: "target_score must be a number between 0 and 100" }, { status: 400 })
  }

  const { data: candidate } = await db
    .from("candidates")
    .select("id, full_name")
    .eq("id", candidateId)
    .single()
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })

  const { data: rawAnswers } = await db
    .from("candidate_answers")
    .select("id, score_achieved, questions(type, score, topic)")
    .eq("candidate_id", candidateId)

  const answers: AnswerForManualScore[] = (rawAnswers ?? []).map((a: any) => ({
    candidate_answer_id: a.id,
    type: a.questions?.type,
    max_score: a.questions?.score ?? 0,
    achieved_score: a.score_achieved ?? 0,
    topic: a.questions?.topic ?? "General",
  }))

  if (answers.length === 0) {
    return NextResponse.json({ error: "Candidate has no answers to score" }, { status: 400 })
  }

  const result = computeManualScore(answers, target_score)

  // Supersede any prior draft/confirmed version for this candidate — never
  // deleted, just marked so the new one becomes the sole active version.
  await db
    .from("manual_scores")
    .update({ status: "superseded", superseded_at: new Date().toISOString() })
    .eq("candidate_id", candidateId)
    .in("status", ["draft", "confirmed"])

  const { data: inserted, error } = await db
    .from("manual_scores")
    .insert({
      candidate_id: candidateId,
      target_score: result.target_score,
      achieved_score: result.achieved_score,
      is_exact_match: result.is_exact_match,
      is_identical_to_original: result.is_identical_to_original,
      status: "draft",
      created_by: session.user.id ?? null,
    })
    .select()
    .single()

  if (error || !inserted) return NextResponse.json({ error: error?.message ?? "Failed to create manual score" }, { status: 500 })

  if (result.overrides.length > 0) {
    await db.from("manual_score_answer_overrides").insert(
      result.overrides.map(o => ({
        manual_score_id: inserted.id,
        candidate_answer_id: o.candidate_answer_id,
        original_score_achieved: o.original_score_achieved,
        manual_score_achieved: o.manual_score_achieved,
      }))
    )
  }

  return NextResponse.json({ manualScore: inserted, overrides: result.overrides })
}

// Marks the current active manual score version 'deleted'. Never a hard SQL
// delete — this preserves the audit trail if it was ever released. Disables
// all manual buttons on the candidate until a new one is created.
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: candidateId } = await params

  const { data: active } = await db
    .from("manual_scores")
    .select("id")
    .eq("candidate_id", candidateId)
    .in("status", ["draft", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!active) return NextResponse.json({ error: "No active manual score" }, { status: 404 })

  await db
    .from("manual_scores")
    .update({ status: "deleted", deleted_at: new Date().toISOString() })
    .eq("id", active.id)

  await auditLog(session, "manual_score.delete", "candidate", candidateId, null, { manual_score_id: active.id })

  return NextResponse.json({ success: true })
}
