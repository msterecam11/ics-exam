import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { parseCSV } from "@/lib/csv-parser"
import { insertParsedQuestions } from "@/lib/importQuestions"
import { parseBody, res400, res413, BodyTooLargeError, IMPORT_BODY_BYTES } from "@/lib/apiUtils"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: examId } = await params

  let body: any
  try { body = await parseBody(req, IMPORT_BODY_BYTES) } catch (e) {
    return e instanceof BodyTooLargeError ? res413() : res400("Invalid request body")
  }
  const { csv_text, start_index = 0 } = body

  if (!csv_text?.trim()) return NextResponse.json({ error: "No CSV content provided" }, { status: 400 })

  const { questions, errors } = parseCSV(csv_text)

  if (questions.length === 0) {
    return NextResponse.json(
      { error: "No valid questions found", errors },
      { status: 400 }
    )
  }

  const created = await insertParsedQuestions({ exam_id: examId }, questions, start_index)

  return NextResponse.json({ created, total: questions.length, errors })
}
