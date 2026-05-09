import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

// Returns JSON data for PDF generation (client-side rendering with @react-pdf/renderer)
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(title, passing_score, duration_minutes, courses(name, groups(name)))")
    .eq("id", id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: answers } = await db
    .from("candidate_answers")
    .select("*, questions(id, text, type, score, order_index, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("candidate_id", id)

  const sorted = (answers ?? []).sort(
    (a: any, b: any) => (a.questions?.order_index ?? 0) - (b.questions?.order_index ?? 0)
  )

  return NextResponse.json({ candidate, answers: sorted })
}
