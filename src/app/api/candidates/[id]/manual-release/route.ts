import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { auditLog } from "@/lib/audit"
import { sendResultsEmail } from "@/lib/ms-graph"

// Sends the manual result to the candidate — same email template, subject,
// and recipient as the real Release feature (sendResultsEmail), just with
// the manual score/pass-fail substituted in. Every send inserts one
// manual_score_releases row with a frozen snapshot: this row IS the audit
// record, and is never touched by later edits/deletes of the manual_scores
// row it points to (ON DELETE RESTRICT prevents the manual score from ever
// being hard-deleted out from under a release that already happened).
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: candidateId } = await params

  const { data: candidate } = await db
    .from("candidates")
    .select("id, full_name, email, exam_id, exams(title)")
    .eq("id", candidateId)
    .single()
  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
  if (!candidate.email) return NextResponse.json({ error: "Candidate has no email on file" }, { status: 400 })

  const { data: manualScore } = await db
    .from("manual_scores")
    .select("*")
    .eq("candidate_id", candidateId)
    .in("status", ["draft", "confirmed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!manualScore) return NextResponse.json({ error: "No active manual score" }, { status: 404 })
  if (manualScore.status !== "confirmed") {
    return NextResponse.json({ error: "Manual score must be confirmed before it can be released" }, { status: 400 })
  }

  const { data: cachedNarrative } = await db
    .from("report_cache")
    .select("narrative")
    .eq("type", "candidate_manual")
    .eq("reference_id", manualScore.id)
    .eq("exam_id", candidate.exam_id)
    .maybeSingle()

  const examTitle = (candidate.exams as any)?.title ?? "Exam"
  const passed = manualScore.achieved_score >= ((await db
    .from("exams").select("passing_score").eq("id", candidate.exam_id).single()
  ).data?.passing_score ?? 60)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  const resultsUrl = `${appUrl}/exam/${candidate.exam_id}/results?candidate=${candidateId}`

  try {
    await sendResultsEmail({
      candidateName:  candidate.full_name ?? "Candidate",
      candidateEmail: candidate.email,
      examTitle,
      score:          manualScore.achieved_score,
      passed,
      resultsUrl,
    })
  } catch (err: any) {
    return NextResponse.json({ error: `Failed to send email: ${err?.message ?? "unknown error"}` }, { status: 502 })
  }

  let narrativeParsed = null
  if (cachedNarrative?.narrative) {
    try { narrativeParsed = JSON.parse(cachedNarrative.narrative) } catch { narrativeParsed = null }
  }

  const { data: release, error } = await db
    .from("manual_score_releases")
    .insert({
      manual_score_id: manualScore.id,
      candidate_id: candidateId,
      released_by: session.user.id ?? null,
      email_sent_to: candidate.email,
      snapshot: {
        target_score: manualScore.target_score,
        achieved_score: manualScore.achieved_score,
        is_exact_match: manualScore.is_exact_match,
        passed,
        narrative: narrativeParsed,
      },
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await auditLog(session, "manual_score.release", "candidate", candidateId, candidate.full_name ?? null, {
    manual_score_id: manualScore.id,
    release_id: release.id,
    email_sent_to: candidate.email,
  })

  return NextResponse.json({ success: true, release })
}
