import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff, visibleCourseIds, visibleStudentIds, canSeeProgram } from "@/lib/staff-access"

// GET /api/lms/reports/search?q= — jump to any report: companies, programs,
// courses and students, limited to what the account may see.
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const g = await guardStaff()
  if (!g.ok) return g.res
  const raw = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 80)
  if (raw.length < 2) return NextResponse.json({ companies: [], programs: [], courses: [], students: [] })
  const like = `%${raw.replace(/[\\%_]/g, m => `\\${m}`)}%`
  const { scope } = g

  const [courseIds, studentIds] = await Promise.all([visibleCourseIds(scope), visibleStudentIds(scope)])

  let cq = db.from("lms_courses").select("id, title, delivery_mode").ilike("title", like).neq("status", "archived").limit(6)
  if (courseIds !== "all") cq = courseIds.length ? cq.in("id", courseIds) : cq.in("id", ["00000000-0000-0000-0000-000000000000"])

  let sq = db.from("lms_students").select("id, name, email, company").or(`name.ilike.${JSON.stringify(like)},email.ilike.${JSON.stringify(like)}`).limit(8)
  if (studentIds !== "all") sq = studentIds.length ? sq.in("id", studentIds.slice(0, 1000)) : sq.in("id", ["00000000-0000-0000-0000-000000000000"])

  const [companies, programs, courses, students] = await Promise.all([
    scope.isAdmin ? db.from("lms_companies").select("id, name, code").ilike("name", like).limit(5) : Promise.resolve({ data: [] as any[] }),
    db.from("lms_programs").select("id, name, reference, status, lms_companies(name)").ilike("name", like).neq("status", "draft").eq("is_individual", false).limit(10),
    cq, sq,
  ])

  // Where a student's report lives: their program, else their first course.
  const found = (students.data ?? []) as any[]
  const { data: enr } = found.length
    ? await db.from("lms_enrollments").select("student_id, course_id, program_id, lms_programs(is_individual, status)").in("student_id", found.map(s => s.id))
    : { data: [] as any[] }
  const hrefFor = (sid: string) => {
    const mine = ((enr ?? []) as any[]).filter(e => e.student_id === sid)
    const inProgram = mine.find(e => e.program_id && !e.lms_programs?.is_individual && e.lms_programs?.status !== "draft" && canSeeProgram(scope, e.program_id))
    if (inProgram) return `/lms-admin/reports/programs/${inProgram.program_id}/students/${sid}`
    return mine[0] ? `/lms-admin/reports/${mine[0].course_id}/${sid}` : null
  }

  return NextResponse.json({
    companies: ((companies.data ?? []) as any[]).map(c => ({ id: c.id, label: c.name, sub: c.code, href: `/lms-admin/reports/clients/${c.id}` })),
    programs: ((programs.data ?? []) as any[]).filter(p => canSeeProgram(scope, p.id)).slice(0, 5)
      .map(p => ({ id: p.id, label: p.name, sub: [p.lms_companies?.name, p.reference].filter(Boolean).join(" · "), href: `/lms-admin/reports/programs/${p.id}` })),
    courses: ((courses.data ?? []) as any[]).map(c => ({ id: c.id, label: c.title, sub: c.delivery_mode, href: `/lms-admin/reports/${c.id}` })),
    students: found.map(s => ({ id: s.id, label: s.name, sub: [s.company, s.email].filter(Boolean).join(" · "), href: hrefFor(s.id) }))
      .filter(s => s.href).slice(0, 6),
  })
}
