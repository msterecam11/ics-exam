import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import { buildGroupReport } from "@/lib/lms-group-report"
import GroupReportView from "@/components/lms/GroupReportView"

interface Props {
  params: Promise<{ courseId: string }>
  searchParams: Promise<{ pdf_secret?: string }>
}

export const dynamic = "force-dynamic"

// Print surface for the cohort PDF — renders the exact on-screen report so the
// downloaded PDF matches the screen. Puppeteer splits it by [data-report-page].
export default async function PrintGroupReport({ params, searchParams }: Props) {
  const { pdf_secret } = await searchParams
  const validSecret = !!process.env.PDF_INTERNAL_SECRET && pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
  }

  const { courseId } = await params
  const data = await buildGroupReport(courseId)
  if (!data) notFound()

  const { data: stored } = await db
    .from("lms_course_assessments")
    .select("assessment, generated_at")
    .eq("course_id", courseId)
    .maybeSingle()

  return <GroupReportView data={data} assessment={(stored?.assessment as any) ?? null} generatedAt={(stored?.generated_at as any) ?? null} />
}
