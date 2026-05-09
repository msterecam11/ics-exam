import { db } from "@/lib/db"
import { auth } from "@/lib/auth"
import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronRight } from "lucide-react"
import InvitationView from "@/components/admin/InvitationView"

async function getExam(id: string) {
  const { data } = await db
    .from("exams")
    .select("*, courses(name, groups(name))")
    .eq("id", id)
    .single()
  return data
}

export default async function InvitationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await auth()
  const exam = await getExam(id)
  if (!exam) notFound()

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const examUrl = `${appUrl}/exam/${id}`

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/exams" className="hover:text-foreground">Exams</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <Link href={`/exams/${id}`} className="hover:text-foreground">{exam.title}</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="text-foreground font-medium">Invitation</span>
      </div>
      <InvitationView exam={exam} examUrl={examUrl} />
    </div>
  )
}
