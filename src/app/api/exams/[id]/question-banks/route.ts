import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

interface BankLink { question_bank_id: string; draw_config: { total?: number; by_topic?: Record<string, number> } | null }

// Admin — list the bank(s) linked to an exam. Reads the multi-bank join
// table first; if an exam has never been saved through the multi-bank UI it
// falls back to translating the legacy single-bank column into a one-item
// list, so opening an existing single-bank exam here just shows "1 bank."
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: examId } = await params

  const { data: links } = await db
    .from("exam_question_banks")
    .select("question_bank_id, draw_config, question_banks(name)")
    .eq("exam_id", examId)

  if (links?.length) {
    return NextResponse.json(
      links.map((l: any) => ({
        question_bank_id: l.question_bank_id,
        name: l.question_banks?.name ?? "Untitled bank",
        draw_config: l.draw_config,
      }))
    )
  }

  const { data: exam } = await db
    .from("exams")
    .select("question_bank_id, bank_draw_config, question_banks(name)")
    .eq("id", examId)
    .single()

  if (exam?.question_bank_id) {
    return NextResponse.json([
      {
        question_bank_id: exam.question_bank_id,
        name: (exam.question_banks as any)?.name ?? "Untitled bank",
        draw_config: exam.bank_draw_config,
      },
    ])
  }

  return NextResponse.json([])
}

// Admin — replace the full set of linked banks for an exam in one call.
// Always writes to the multi-bank join table (even for a single bank), and
// clears the legacy single-bank columns so there's one source of truth going
// forward — downstream consumers don't care which table sourced a draw.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: examId } = await params
  const body = await req.json()
  const banks: BankLink[] = Array.isArray(body.banks) ? body.banks : []

  await db.from("exam_question_banks").delete().eq("exam_id", examId)

  if (banks.length > 0) {
    const { error } = await db.from("exam_question_banks").insert(
      banks.map(b => ({ exam_id: examId, question_bank_id: b.question_bank_id, draw_config: b.draw_config }))
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await db.from("exams").update({ question_bank_id: null, bank_draw_config: null }).eq("id", examId)

  return NextResponse.json({ success: true })
}
