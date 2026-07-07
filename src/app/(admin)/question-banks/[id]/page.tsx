import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import QuestionBuilder from "@/components/admin/QuestionBuilder"
import BankAnalyzePanel from "@/components/admin/BankAnalyzePanel"

async function getBank(id: string) {
  const { data } = await db
    .from("question_banks")
    .select("id, name, description, questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("id", id)
    .single()
  return data
}

export default async function QuestionBankDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await auth()
  const bank = await getBank(id)
  if (!bank) notFound()

  const questions = ((bank.questions as any[]) ?? []).sort(
    (a, b) => a.order_index - b.order_index
  )

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/question-banks" className="hover:text-foreground">Question Banks</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate max-w-[240px]">{bank.name}</span>
      </div>

      <div>
        <h2 className="text-xl font-bold">{bank.name}</h2>
        {bank.description && <p className="text-muted-foreground text-sm">{bank.description}</p>}
      </div>

      <BankAnalyzePanel bankId={id} questionCount={questions.length} />

      <QuestionBuilder questionBankId={id} initialQuestions={questions} requireTotal100={false} />
    </div>
  )
}
