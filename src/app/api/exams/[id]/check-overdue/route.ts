import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { finalizeCandidateSubmission } from "@/lib/examSubmission"

// Admin: manually triggered sweep — finds every in-progress candidate on
// this exam whose time has actually run out (started_at + duration_minutes,
// the same clock that already drives client-side auto-submit) and finalizes
// them using whatever they'd autosaved so far. Exists because auto-submit is
// purely client-side — if a candidate's tab freezes or is closed, nothing
// server-side ever notices their time expired, and they sit as "In
// progress" forever until someone catches it manually.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: examId } = await params

  const { data: exam } = await db.from("exams").select("id, duration_minutes").eq("id", examId).single()
  if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 })

  const { data: candidates } = await db
    .from("candidates")
    .select("id, full_name, started_at, draft_answers")
    .eq("exam_id", examId)
    .is("submitted_at", null)

  const cutoff = exam.duration_minutes * 60 * 1000
  const overdue = (candidates ?? []).filter((c) => {
    if (!c.started_at) return false
    return Date.now() - new Date(c.started_at).getTime() > cutoff
  })

  const finalized: { id: string; full_name: string; total_score: number; passed: boolean }[] = []

  for (const candidate of overdue) {
    try {
      const result = await finalizeCandidateSubmission(examId, candidate.id, candidate.draft_answers ?? {})
      finalized.push({ id: candidate.id, full_name: candidate.full_name, ...result })
    } catch (err) {
      console.error(`[check-overdue] Failed finalizing candidate ${candidate.id}:`, err)
    }
  }

  return NextResponse.json({ checked: candidates?.length ?? 0, finalized })
}
