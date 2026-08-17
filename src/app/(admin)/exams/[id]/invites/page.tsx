import { db } from "@/lib/db"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import ExamInvitesManager from "@/components/admin/ExamInvitesManager"

async function getExam(id: string) {
  const { data } = await db
    .from("exams")
    .select("id, title, courses(id, name, groups(id, name)), exam_custom_fields(*)")
    .eq("id", id)
    .single()
  return data
}

async function getInvites(examId: string) {
  const { data } = await db
    .from("exam_invites")
    .select("*")
    .eq("exam_id", examId)
    .order("created_at", { ascending: false })
  return data ?? []
}

export default async function ExamInvitesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [exam, invites] = await Promise.all([getExam(id), getInvites(id)])
  if (!exam) notFound()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/exams" className="hover:text-foreground">Exams</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/exams/${id}`} className="hover:text-foreground truncate">{exam.title}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Invites</span>
      </div>

      <div>
        <h2 className="text-xl font-bold">Personal Invites</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Send a candidate a link with their details already filled in — no shared password needed, and the link only works for them.
        </p>
      </div>

      <ExamInvitesManager examId={id} customFields={(exam.exam_custom_fields as any[]) ?? []} initialInvites={invites} />
    </div>
  )
}
