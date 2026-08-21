import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// Public — the token itself is the credential, no exam password needed.
// Returns exam info (same shape the password flow returns) plus this
// invite's prefill data. Marks the invite "opened" on first successful view.
export async function GET(_: Request, { params }: { params: Promise<{ id: string; token: string }> }) {
  const { id, token } = await params

  const { data: invite } = await db
    .from("exam_invites")
    .select("*")
    .eq("exam_id", id)
    .eq("token", token)
    .single()

  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 })
  if (invite.status === "revoked")
    return NextResponse.json({ error: "This invite is no longer valid" }, { status: 410 })

  const { data: exam } = await db
    .from("exams")
    .select("id, title, description, status, duration_minutes, language, shuffle_questions, shuffle_options, courses(name, groups(name)), exam_custom_fields(*)")
    .eq("id", id)
    .single()

  if (!exam) return NextResponse.json({ error: "Exam not found" }, { status: 404 })
  if (exam.status !== "active")
    return NextResponse.json({ error: "This exam is not currently active." }, { status: 403 })

  if (invite.status === "completed") {
    // A "completed" invite means registration was submitted, not that the
    // exam itself was finished — a candidate whose tab froze/closed mid-exam
    // otherwise had no way back in except an admin issuing a fresh invite.
    // Reopenable while they're still genuinely mid-sitting: not yet
    // submitted, and still within their original time window (the same
    // clock that already drives auto-submit) — never resurrects a stale or
    // already-finished attempt.
    if (!invite.candidate_id) {
      return NextResponse.json({ error: "This invite has already been used" }, { status: 410 })
    }
    const { data: candidate } = await db.from("candidates").select("*").eq("id", invite.candidate_id).single()
    if (!candidate) {
      return NextResponse.json({ error: "This invite has already been used" }, { status: 410 })
    }
    if (candidate.submitted_at) {
      return NextResponse.json({ error: "This invite has already been used" }, { status: 410 })
    }
    const startedAt = new Date(candidate.started_at).getTime()
    const stillWithinTime = Date.now() < startedAt + exam.duration_minutes * 60 * 1000
    if (!stillWithinTime) {
      return NextResponse.json({ error: "This invite has already been used" }, { status: 410 })
    }
    return NextResponse.json({ exam, invite, resume: candidate })
  }

  if (invite.status === "pending") {
    await db.from("exam_invites").update({ status: "opened", opened_at: new Date().toISOString() }).eq("id", invite.id)
  }

  return NextResponse.json({ exam, invite })
}
