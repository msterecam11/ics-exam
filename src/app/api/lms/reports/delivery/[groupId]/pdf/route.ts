export const maxDuration = 90

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { renderReportPdf } from "@/lib/lms-report-pdf"
import { isUuid, groupLabel } from "@/lib/lms-groups"
import { guardStaff, forbidden } from "@/lib/staff-access"

// GET /api/lms/reports/delivery/[groupId]/pdf?audience=client|internal
// One onsite group's report. Admins, and the group's own instructors.
export async function GET(req: Request, { params }: { params: Promise<{ groupId: string }> }) {
  const g = await guardStaff()
  if (!g.ok) return g.res
  const { groupId } = await params
  if (!isUuid(groupId)) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  if (!g.scope.isAdmin && !g.scope.instructorGroupIds.includes(groupId)) return forbidden()
  const { data: grp } = await db.from("lms_course_groups").select("name, start_date, end_date, city, lms_courses(title)").eq("id", groupId).maybeSingle()
  if (!grp) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  const client = new URL(req.url).searchParams.get("audience") === "client"
  const name = `${(grp as any).lms_courses?.title ?? "Course"} - ${groupLabel(grp as any)} - Group Report${client ? " (client)" : ""}.pdf`
  return renderReportPdf(`/print/lms/delivery/${groupId}?audience=${client ? "client" : "internal"}`, name)
}
