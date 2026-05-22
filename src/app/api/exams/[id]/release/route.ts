import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { sendResultsEmail } from "@/lib/ms-graph"

// Admin releases results for all (or specific) candidates
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id } = await params
  const { candidate_id } = await req.json()

  // ── 1. Fetch exam title ───────────────────────────────────────────────────
  const { data: exam } = await db
    .from("exams")
    .select("title")
    .eq("id", exam_id)
    .single()

  // ── 2. Fetch candidates to notify (only submitted, not yet released) ──────
  let candidateQuery = db
    .from("candidates")
    .select("id, full_name, email, total_score, passed")
    .eq("exam_id", exam_id)
    .eq("results_released", false)
    .not("submitted_at", "is", null)

  if (candidate_id) candidateQuery = candidateQuery.eq("id", candidate_id)

  const { data: toNotify } = await candidateQuery

  // ── 3. Release results in DB ──────────────────────────────────────────────
  let updateQuery = db
    .from("candidates")
    .update({ results_released: true })
    .eq("exam_id", exam_id)

  if (candidate_id) updateQuery = updateQuery.eq("id", candidate_id)

  const { error } = await updateQuery
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // ── 4. Send emails (fire-and-forget, never blocks the response) ───────────
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ""
  ;(async () => {
    for (const c of toNotify ?? []) {
      if (!c.email) continue
      try {
        await sendResultsEmail({
          candidateName:  c.full_name ?? "Candidate",
          candidateEmail: c.email,
          examTitle:      exam?.title ?? "Exam",
          score:          c.total_score,
          passed:         c.passed,
          resultsUrl:     `${appUrl}/exam/${exam_id}/results?candidate=${c.id}`,
        })
      } catch (err) {
        console.error(`[results-email] failed for ${c.email}:`, err)
      }
    }
  })()

  await auditLog(
    session, "results.release", "exam", exam_id, exam?.title ?? null,
    { candidate_id: candidate_id ?? "all", notified: (toNotify ?? []).length },
  )

  return NextResponse.json({ success: true, notified: (toNotify ?? []).length })
}
