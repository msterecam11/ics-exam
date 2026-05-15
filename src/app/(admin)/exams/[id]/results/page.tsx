import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import AdminResultsView from "@/components/admin/AdminResultsView"

async function getData(id: string) {
  const [{ data: exam }, { data: candidates }] = await Promise.all([
    db.from("exams").select("*, courses(name, groups(name))").eq("id", id).single(),
    db.from("candidates").select("*, tab_switches, fullscreen_exits, right_click_attempts, copy_paste_attempts").eq("exam_id", id).order("submitted_at", { ascending: false }),
  ])
  return { exam, candidates }
}

export default async function AdminResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await auth()
  const { exam, candidates } = await getData(id)
  if (!exam) notFound()

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/exams" className="hover:text-foreground">Exams</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/exams/${id}`} className="hover:text-foreground">{exam.title}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Results</span>
      </div>
      <AdminResultsView exam={exam} candidates={candidates ?? []} />
    </div>
  )
}
