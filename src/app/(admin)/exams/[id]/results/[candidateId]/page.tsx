import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { PDFDownloadButton } from "@/components/pdf/CandidateReportPDF"
import CandidateDetailClient from "./CandidateDetailClient"

async function getData(candidateId: string) {
  const { data: candidate } = await db
    .from("candidates")
    .select("*, exams(id, title, passing_score, show_results, duration_minutes, courses(name, groups(name)))")
    .eq("id", candidateId)
    .single()

  if (!candidate) return null

  const { data: answers } = await db
    .from("candidate_answers")
    .select("*, questions(*, choices(*), matching_pairs(*), ordering_items(*))")
    .eq("candidate_id", candidateId)

  const sorted = (answers ?? []).sort(
    (a, b) => (a.questions?.order_index ?? 0) - (b.questions?.order_index ?? 0)
  )

  return { candidate, answers: sorted }
}

export default async function CandidateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; candidateId: string }>
  searchParams: Promise<{ mode?: string }>
}) {
  const { id, candidateId } = await params
  const { mode } = await searchParams
  await auth()
  const data = await getData(candidateId)
  if (!data) notFound()

  const { candidate, answers } = data
  const exam = candidate.exams as any

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground flex-wrap">
        <Link href="/exams" className="hover:text-foreground">Exams</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/exams/${id}`} className="hover:text-foreground">{exam?.title}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/exams/${id}/results`} className="hover:text-foreground">Results</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">{candidate.full_name}</span>
      </div>

      <CandidateDetailClient
        candidate={candidate}
        answers={answers}
        examId={id}
        candidateId={candidateId}
        initialMode={mode === "manual" ? "manual" : "original"}
      />
    </div>
  )
}
