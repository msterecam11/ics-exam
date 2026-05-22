import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  BookOpen, Clock, Users, QrCode, List, BarChart2, ChevronRight, Lock
} from "lucide-react"
import { formatDuration } from "@/lib/utils"
import ExamStatusToggle from "@/components/admin/ExamStatusToggle"
import AnalyzeExamButton from "@/components/admin/AnalyzeExamButton"
import ExamEditModal from "@/components/admin/ExamEditModal"
import DeleteExamButton from "@/components/admin/DeleteExamButton"

async function getExam(id: string) {
  const { data } = await db
    .from("exams")
    .select(`
      *,
      courses(id, name, groups(id, name)),
      questions(id),
      candidates(id, submitted_at, passed)
    `)
    .eq("id", id)
    .single()
  return data
}

async function getAnalysis(examId: string) {
  const { data } = await db
    .from("exam_analyses")
    .select("sections, generated_at")
    .eq("exam_id", examId)
    .single()
  return data ?? null
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-amber-100 text-amber-700 border-0",
  active: "bg-emerald-100 text-emerald-700 border-0",
  closed: "bg-slate-100 text-slate-600 border-0",
}

export default async function ExamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await auth()
  const [exam, analysis] = await Promise.all([getExam(id), getAnalysis(id)])
  if (!exam) notFound()

  const candidates = exam.candidates ?? []
  const submitted = candidates.filter((c: any) => c.submitted_at)
  const passed = submitted.filter((c: any) => c.passed)
  const passRate = submitted.length > 0 ? Math.round((passed.length / submitted.length) * 100) : null

  const actions = [
    {
      href: `/exams/${id}/questions`,
      icon: List,
      title: "Questions",
      desc: `${exam.questions?.length ?? 0} questions built`,
      color: "text-[#1B4F8A]",
      bg: "bg-blue-50",
    },
    {
      href: `/exams/${id}/results`,
      icon: BarChart2,
      title: "Results",
      desc: `${submitted.length} submissions`,
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      href: `/exams/${id}/invitation`,
      icon: QrCode,
      title: "Invitation",
      desc: "QR code & printable page",
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/exams" className="hover:text-foreground">Exams</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium truncate">{exam.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-xl font-bold">{exam.title}</h2>
            <Badge className={STATUS_STYLES[exam.status]} variant="secondary">
              {exam.status}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            {(exam.courses as any)?.groups?.name} → {(exam.courses as any)?.name}
          </p>
          {exam.description && <p className="text-sm mt-1">{exam.description}</p>}
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <ExamEditModal exam={exam} />
          <AnalyzeExamButton
            examId={id}
            initialAnalysis={analysis}
            questionCount={exam.questions?.length ?? 0}
          />
          <ExamStatusToggle examId={id} currentStatus={exam.status} />
          <DeleteExamButton examId={id} examTitle={exam.title} />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: Clock, label: "Duration", value: formatDuration(exam.duration_minutes) },
          { icon: BookOpen, label: "Pass Score", value: `${exam.passing_score}%` },
          { icon: Users, label: "Candidates", value: candidates.length },
          { icon: BarChart2, label: "Pass Rate", value: passRate !== null ? `${passRate}%` : "—" },
        ].map(({ icon: Icon, label, value }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs">{label}</span>
              </div>
              <p className="text-lg font-bold text-[#1B4F8A]">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Password */}
      <Card className="border-dashed">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Exam password:</span>
          <code className="font-bold text-[#1B4F8A] tracking-widest text-base">{exam.password}</code>
          <span className="text-xs text-muted-foreground ml-2">(give this to candidates)</span>
        </CardContent>
      </Card>

      <Separator />

      {/* Action cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {actions.map(({ href, icon: Icon, title, desc, color, bg }) => (
          <Link key={href} href={href}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardHeader className="pb-2">
                <div className={`${bg} w-10 h-10 rounded-xl flex items-center justify-center mb-2`}>
                  <Icon className={`h-5 w-5 ${color}`} />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{desc}</p>
                <p className={`text-xs font-medium mt-2 ${color}`}>Open →</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
