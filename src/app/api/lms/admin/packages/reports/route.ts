import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) {
  return role === "admin" || role === "instructor"
}

// GET /api/lms/admin/packages/reports?course_id=xxx
// Returns all packages in a course with per-student progress rows
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get("course_id")
  if (!courseId)
    return NextResponse.json({ error: "course_id required" }, { status: 400 })

  // 1. Fetch all packages for this course with their block count
  const { data: packages, error: pkgErr } = await db
    .from("lms_packages")
    .select(`
      id, module_id, title, pass_mark,
      lms_package_blocks(id)
    `)
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })

  if (pkgErr) return NextResponse.json({ error: pkgErr.message }, { status: 500 })
  if (!packages?.length) return NextResponse.json([])

  const packageIds = packages.map(p => p.id)

  // 2. Fetch all progress rows for these packages with student details
  const { data: progressRows, error: progErr } = await db
    .from("lms_package_progress")
    .select(`
      id, package_id, student_id, status, score,
      completed_blocks, block_scores, time_spent,
      started_at, completed_at, updated_at,
      lms_students(id, name, email, company)
    `)
    .in("package_id", packageIds)
    .order("updated_at", { ascending: false })

  if (progErr) return NextResponse.json({ error: progErr.message }, { status: 500 })

  // 3. Group progress rows by package_id
  const progressByPackage: Record<string, typeof progressRows> = {}
  for (const row of progressRows ?? []) {
    if (!progressByPackage[row.package_id]) progressByPackage[row.package_id] = []
    progressByPackage[row.package_id].push(row)
  }

  // 4. Assemble response
  const result = packages.map(pkg => ({
    id:          pkg.id,
    module_id:   pkg.module_id,
    title:       pkg.title,
    pass_mark:   pkg.pass_mark,
    block_count: (pkg.lms_package_blocks ?? []).length,
    students:    (progressByPackage[pkg.id] ?? []).map(row => ({
      student_id:       row.student_id,
      name:             (row.lms_students as any)?.name ?? "Unknown",
      email:            (row.lms_students as any)?.email ?? "",
      company:          (row.lms_students as any)?.company ?? null,
      status:           row.status,
      score:            row.score,
      blocks_completed: (row.completed_blocks ?? []).length,
      time_spent:       row.time_spent ?? 0,
      started_at:       row.started_at,
      completed_at:     row.completed_at,
      updated_at:       row.updated_at,
    })),
  }))

  return NextResponse.json(result)
}
