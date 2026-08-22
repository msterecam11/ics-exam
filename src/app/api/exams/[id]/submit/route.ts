import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { getIp, res429 } from "@/lib/apiUtils"
import { finalizeCandidateSubmission } from "@/lib/examSubmission"

// Public — candidate submits their exam
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // Rate limit by IP — 10 submissions per hour per IP
  const ip = getIp(req)
  const { allowed, retryAfterSeconds } = await rateLimit(`submit:${ip}`, 10, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { id: exam_id } = await params
  const { candidate_id, answers } = await req.json()
  // answers: { [question_id]: answer_text | answer_json }

  // Verify candidate belongs to this exam
  const { data: candidate } = await db
    .from("candidates")
    .select("id, submitted_at")
    .eq("id", candidate_id)
    .eq("exam_id", exam_id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Candidate not found" }, { status: 404 })
  if (candidate.submitted_at) return NextResponse.json({ error: "Already submitted" }, { status: 400 })

  try {
    const result = await finalizeCandidateSubmission(exam_id, candidate_id, answers ?? {})
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Submission failed" }, { status: 400 })
  }
}
