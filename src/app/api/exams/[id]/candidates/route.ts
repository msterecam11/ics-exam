import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { getIp, res429 } from "@/lib/apiUtils"

// Public — no auth needed (candidate registration)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // 10 registrations per IP per 15 minutes — prevents fake candidate spam
  const ip = getIp(req)
  const { allowed, retryAfterSeconds } = await rateLimit(`candidate-reg:${ip}`, 10, 900)
  if (!allowed) return res429(retryAfterSeconds)

  const { id: exam_id } = await params
  const body = await req.json()
  const { full_name, email, job_title, years_of_experience, company, custom_field_values } = body

  // Input validation
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!full_name || typeof full_name !== "string" || full_name.trim().length === 0 || full_name.length > 200)
    return NextResponse.json({ error: "full_name is required (max 200 chars)" }, { status: 400 })
  if (!email || !emailRe.test(email))
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 })
  if (!job_title || typeof job_title !== "string" || job_title.length > 200)
    return NextResponse.json({ error: "job_title is required (max 200 chars)" }, { status: 400 })
  if (!company || typeof company !== "string" || company.length > 200)
    return NextResponse.json({ error: "company is required (max 200 chars)" }, { status: 400 })
  if (years_of_experience !== undefined) {
    const y = Number(years_of_experience)
    if (isNaN(y) || y < 0 || y > 80)
      return NextResponse.json({ error: "years_of_experience must be between 0 and 80" }, { status: 400 })
  }

  // Verify exam exists and is active
  const { data: exam } = await db
    .from("exams")
    .select("id, status, question_bank_id, bank_draw_config")
    .eq("id", exam_id)
    .single()

  if (!exam || exam.status !== "active") {
    return NextResponse.json({ error: "Exam is not available" }, { status: 400 })
  }

  const { data, error } = await db
    .from("candidates")
    .insert({
      exam_id,
      full_name:           full_name.trim(),
      email:               email.trim().toLowerCase(),
      job_title:           job_title.trim(),
      years_of_experience: years_of_experience ?? null,
      company:             company.trim(),
      custom_field_values: custom_field_values ?? {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Multi-bank exam (exam_question_banks has rows) — draw from each linked
  // bank per its own config, combine into one frozen snapshot. Takes
  // priority over the legacy single-bank column so an exam edited through
  // the new multi-bank UI (which always writes here) behaves consistently.
  const { data: linkedBanks } = await db
    .from("exam_question_banks")
    .select("question_bank_id, draw_config")
    .eq("exam_id", exam_id)

  if (linkedBanks?.length) {
    await drawFromMultipleBanks(linkedBanks, data.id)
  } else if (exam.question_bank_id) {
    // Legacy single-bank exam — unchanged from before multi-bank support.
    await drawCandidateQuestions(exam.question_bank_id, exam.bank_draw_config, data.id)
  }

  return NextResponse.json(data, { status: 201 })
}

// Fisher-Yates partial shuffle — returns up to n random elements from arr.
function pickRandom<T>(arr: T[], n: number): T[] {
  const a = [...arr]
  const take = Math.min(n, a.length)
  for (let i = a.length - 1; i > a.length - 1 - take; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(a.length - take)
}

// Selects questions from one bank's question pool per its own draw config.
// Stratified by topic when draw_config.by_topic is set; otherwise a flat
// random count from draw_config.total. Shared by both the legacy single-bank
// path and the multi-bank orchestration below.
function selectFromBankPool(
  bankQuestions: { id: string; topic: string | null }[],
  drawConfig: { total?: number; by_topic?: Record<string, number> } | null,
  bankId: string
): { id: string }[] {
  let selected: { id: string }[] = []

  if (drawConfig?.by_topic && Object.keys(drawConfig.by_topic).length > 0) {
    for (const [topic, count] of Object.entries(drawConfig.by_topic)) {
      if (!count || count <= 0) continue
      const pool = bankQuestions.filter(q => (q.topic ?? "Untagged") === topic)
      selected.push(...pickRandom(pool, count))
    }
  } else if (drawConfig?.total && drawConfig.total > 0) {
    selected = pickRandom(bankQuestions, drawConfig.total)
  } else {
    // No valid draw config saved — safety net so registration never produces
    // a silently empty exam; log for the admin to fix the bank's draw config.
    console.error(`[candidate draw] Bank ${bankId} has no valid draw config — falling back to 20 random questions`)
    selected = pickRandom(bankQuestions, 20)
  }

  return selected
}

// Draw this candidate's frozen question set from a single bank and snapshot
// it into candidate_exam_questions. Legacy single-bank path — unchanged.
async function drawCandidateQuestions(
  bankId: string,
  drawConfig: { total?: number; by_topic?: Record<string, number> } | null,
  candidateId: string
) {
  const { data: bankQuestions } = await db
    .from("questions")
    .select("id, topic")
    .eq("question_bank_id", bankId)

  if (!bankQuestions?.length) return

  let selected = selectFromBankPool(bankQuestions, drawConfig, bankId)

  // Final shuffle across the combined (possibly topic-grouped) selection.
  selected = pickRandom(selected, selected.length)

  if (selected.length === 0) return

  await db.from("candidate_exam_questions").insert(
    selected.map((q, i) => ({ candidate_id: candidateId, question_id: q.id, order_index: i }))
  )
}

// Draw this candidate's frozen question set across multiple linked banks,
// each per its own draw_config, into one combined candidate_exam_questions
// snapshot. Downstream consumers (question fetch, scoring, reports) don't
// need to know how many banks contributed — they only ever read this table.
async function drawFromMultipleBanks(
  linkedBanks: { question_bank_id: string; draw_config: { total?: number; by_topic?: Record<string, number> } | null }[],
  candidateId: string
) {
  let combined: { id: string }[] = []

  for (const link of linkedBanks) {
    const { data: bankQuestions } = await db
      .from("questions")
      .select("id, topic")
      .eq("question_bank_id", link.question_bank_id)

    if (!bankQuestions?.length) continue
    combined.push(...selectFromBankPool(bankQuestions, link.draw_config, link.question_bank_id))
  }

  // Final shuffle across all banks' selections combined, so order isn't
  // grouped by which bank a question came from.
  combined = pickRandom(combined, combined.length)

  if (combined.length === 0) return

  await db.from("candidate_exam_questions").insert(
    combined.map((q, i) => ({ candidate_id: candidateId, question_id: q.id, order_index: i }))
  )
}

// Admin: get all candidates for an exam
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: exam_id } = await params

  const { data, error } = await db
    .from("candidates")
    .select("*")
    .eq("exam_id", exam_id)
    .order("submitted_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
