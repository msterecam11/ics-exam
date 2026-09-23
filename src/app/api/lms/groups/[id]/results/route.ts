// GET /api/lms/groups/[id]/results — each participant against the course's
// pass rule: every component, the weighted score, and passed / in progress /
// not passed with the reasons.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff, forbidden } from "@/lib/staff-access"
import { loadGroup, SEAT_STATUSES } from "@/lib/lms-groups"
import { evaluatePassRule } from "@/lib/lms-pass-rule"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardStaff()
  if (!g.ok) return g.res
  const { id } = await params
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })
  // Admins, and the instructors of this group.
  if (!g.scope.isAdmin && !g.scope.instructorGroupIds.includes(id)) return forbidden()

  const { data } = await db.from("lms_enrollments")
    .select("id, status, completed_at, lms_students(id, name, email)")
    .eq("group_id", id).in("status", SEAT_STATUSES)
  // Evaluated side by side — each is a handful of small reads.
  const rows = await Promise.all(((data ?? []) as any[]).map(async e => ({
    enrollment_id: e.id, status: e.status, completed_at: e.completed_at, student: e.lms_students,
    result: await evaluatePassRule(e.id).catch(() => null),
  })))
  rows.sort((a, b) => (a.student?.name ?? "").localeCompare(b.student?.name ?? ""))
  return NextResponse.json({ rows })
}
