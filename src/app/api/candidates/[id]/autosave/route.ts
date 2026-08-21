import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { getIp, res429 } from "@/lib/apiUtils"

// Public — the exam-taking page saves the candidate's in-progress answers
// here as they go, and reloads them from here on mount (refresh, reopened
// tab, or a resumed invite on a different device). This is a resilience/
// visibility layer only — final scoring always reads the real submitted
// answers from POST /api/exams/[id]/submit, never this column.

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ip = getIp(req)
  // One save per candidate roughly every couple of seconds at most during a
  // real sitting (debounced client-side) — 200/hour gives generous headroom
  // without allowing this to be hammered.
  const { allowed, retryAfterSeconds } = await rateLimit(`autosave:${ip}`, 200, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { answers } = body

  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
    return NextResponse.json({ error: "answers must be an object" }, { status: 400 })
  }

  // Never overwrite a real submission's answers with a stray late autosave —
  // once submitted, this column is frozen (the candidate's session should
  // have moved to the results page by then anyway).
  const { data: candidate } = await db.from("candidates").select("submitted_at").eq("id", id).single()
  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (candidate.submitted_at) return NextResponse.json({ ok: true, skipped: "already submitted" })

  const { error } = await db.from("candidates").update({ draft_answers: answers }).eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}

// Public — fetch back whatever's saved so far, keyed only by candidate id
// (same trust model as the security-event log route: knowing the id is
// the credential, matching how the take page already works).
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: candidate } = await db
    .from("candidates")
    .select("draft_answers, submitted_at")
    .eq("id", id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ draft_answers: candidate.draft_answers ?? {}, submitted: !!candidate.submitted_at })
}
