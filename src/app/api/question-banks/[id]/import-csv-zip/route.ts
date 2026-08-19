import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { importQuestionsFromZip } from "@/lib/importQuestionsZip"
import { insertParsedQuestions } from "@/lib/importQuestions"

const MAX_MB = 40

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: bankId } = await params

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 }) }

  const file = formData.get("file") as File | null
  const startIndex = Number(formData.get("start_index") ?? 0)

  if (!file) return NextResponse.json({ error: "No zip file provided" }, { status: 400 })
  if (!file.name.toLowerCase().endsWith(".zip")) return NextResponse.json({ error: "File must be a .zip" }, { status: 400 })
  if (file.size / (1024 * 1024) > MAX_MB) return NextResponse.json({ error: `File too large (max ${MAX_MB} MB)` }, { status: 413 })

  const { questions, errors } = await importQuestionsFromZip(await file.arrayBuffer())

  if (questions.length === 0) {
    return NextResponse.json({ error: "No valid questions found", errors }, { status: 400 })
  }

  // `section` is ignored here — a bank question is reused across many exams
  // and can't belong to any one exam's section list (see exam_sections.sql).
  const created = await insertParsedQuestions({ question_bank_id: bankId }, questions, startIndex)

  return NextResponse.json({ created, total: questions.length, errors })
}
