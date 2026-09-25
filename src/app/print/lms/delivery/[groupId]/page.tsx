import { redirect, notFound } from "next/navigation"
import { auth } from "@/lib/auth"
import DeliveryReportView from "@/components/lms/reports/DeliveryReportView"
import { buildDeliveryReport } from "@/lib/lms-delivery-report"
import { isUuid } from "@/lib/lms-groups"
import { pageScope } from "@/lib/staff-access"

export const dynamic = "force-dynamic"

// Print surface for one group's report (staff with access to the group, or the PDF renderer).
export default async function PrintDeliveryReport({ params, searchParams }: {
  params: Promise<{ groupId: string }>
  searchParams: Promise<{ pdf_secret?: string; audience?: string }>
}) {
  const sp = await searchParams
  const { groupId } = await params
  if (!isUuid(groupId)) notFound()
  const validSecret = !!process.env.PDF_INTERNAL_SECRET && sp.pdf_secret === process.env.PDF_INTERNAL_SECRET
  if (!validSecret) {
    const session = await auth()
    if (!session) redirect("/auth/login")
    const scope = await pageScope()
    if (!scope || (!scope.isAdmin && !scope.instructorGroupIds.includes(groupId))) notFound()
  }
  const data = await buildDeliveryReport(groupId, sp.audience === "client" ? "client" : "internal")
  if (!data) notFound()
  return <DeliveryReportView data={data} forPrint />
}
