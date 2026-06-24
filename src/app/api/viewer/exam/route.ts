import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Returns resolved exam data for the current viewer.
// Handles all 3 scope types: group → course → exam → candidates
// Each item includes permissions so the UI knows what to show.
export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const role = session.user.role
  if (role !== "viewer" && role !== "admin")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  // Load the viewer's exam access rows
  const { data: accessRows, error: accessErr } = await db
    .from("viewer_access")
    .select("id, resource_type, resource_id, label, permissions")
    .eq("user_id", session.user.id)
    .eq("system", "exam")

  if (accessErr) return NextResponse.json({ error: accessErr.message }, { status: 500 })
  if (!accessRows || accessRows.length === 0) return NextResponse.json([])

  const items: any[] = []

  for (const row of accessRows) {
    let examIds: string[] = []
    let resolvedLabel = row.label ?? ""

    if (row.resource_type === "exam") {
      examIds = [row.resource_id]

    } else if (row.resource_type === "course") {
      const { data: exams } = await db
        .from("exams")
        .select("id")
        .eq("course_id", row.resource_id)
      examIds = (exams ?? []).map((e: any) => e.id)

    } else if (row.resource_type === "group") {
      // group → courses → exams
      const { data: courses } = await db
        .from("courses")
        .select("id")
        .eq("group_id", row.resource_id)
      const courseIds = (courses ?? []).map((c: any) => c.id)
      if (courseIds.length > 0) {
        const { data: exams } = await db
          .from("exams")
          .select("id")
          .in("course_id", courseIds)
        examIds = (exams ?? []).map((e: any) => e.id)
      }
    }

    if (examIds.length === 0) {
      items.push({ access_id: row.id, resource_type: row.resource_type, resource_id: row.resource_id, label: resolvedLabel, permissions: row.permissions, candidates: [] })
      continue
    }

    // Fetch candidates for all resolved exams
    const { data: candidates } = await db
      .from("candidates")
      .select("id, full_name, email, job_title, company, total_score, passed, submitted_at, exam_id, exams(title)")
      .in("exam_id", examIds)
      .order("submitted_at", { ascending: false })

    items.push({
      access_id:     row.id,
      resource_type: row.resource_type,
      resource_id:   row.resource_id,
      label:         resolvedLabel,
      permissions:   row.permissions ?? {},
      candidates:    (candidates ?? []).map((c: any) => ({
        id:          c.id,
        full_name:   c.full_name,
        email:       c.email,
        job_title:   c.job_title,
        company:     c.company,
        total_score: c.total_score,
        passed:      c.passed,
        submitted_at: c.submitted_at,
        exam_id:     c.exam_id,
        exam_title:  c.exams?.title ?? "",
      })),
    })
  }

  return NextResponse.json(items)
}
