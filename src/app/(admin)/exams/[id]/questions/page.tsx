import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import ExamQuestionSource from "@/components/admin/ExamQuestionSource"

async function getExam(id: string) {
  const { data } = await db
    .from("exams")
    .select("id, title, question_bank_id, bank_draw_config, courses(name, groups(name)), questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("id", id)
    .single()
  return data
}

export default async function QuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await auth()
  const exam = await getExam(id)
  if (!exam) notFound()

  const questions = ((exam.questions as any[]) ?? []).sort(
    (a, b) => a.order_index - b.order_index
  )

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/exams" className="hover:text-foreground">Exams</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/exams/${id}`} className="hover:text-foreground truncate max-w-[160px]">
          {exam.title}
        </Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Questions</span>
      </div>

      <div>
        <h2 className="text-xl font-bold">Question Builder</h2>
        <p className="text-muted-foreground text-sm">
          Build and arrange questions. Total scores should sum to 100.
        </p>
      </div>

      <ExamQuestionSource
        examId={id}
        initialQuestionBankId={(exam as any).question_bank_id ?? null}
        initialBankDrawConfig={(exam as any).bank_draw_config ?? null}
        initialQuestions={questions}
      />
    </div>
  )
}
