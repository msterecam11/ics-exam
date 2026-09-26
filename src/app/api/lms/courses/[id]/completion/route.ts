// A course's pass rule (Course builder → Settings → Completion & grading).
//
// GET — the rule (null = "pass the final exam", as before), what the course
//       actually contains (so the screen offers only components that exist),
//       and a suggested starting rule
// PUT { rules } — save it (null to go back to "pass the final exam")

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff, canEditCourse, forbidden } from "@/lib/staff-access"
import { readRules, defaultRules } from "@/lib/lms-pass-rule"

export const dynamic = "force-dynamic"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!(await canEditCourse(g.scope, id))) return forbidden()

  const [{ data: course }, { data: mods }, { count: sessions }] = await Promise.all([
    db.from("lms_courses").select("id, delivery_mode, final_exam_pass_mark, completion_rules").eq("id", id).maybeSingle(),
    db.from("lms_modules").select("module_type").eq("course_id", id),
    db.from("lms_sessions").select("id", { count: "exact", head: true }).eq("course_id", id),
  ])
  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const c = course as any
  const count = (t: string) => ((mods ?? []) as any[]).filter(m => m.module_type === t).length
  return NextResponse.json({
    rules: c.completion_rules ?? null,
    suggested: defaultRules(c.delivery_mode),
    exam_pass_mark: c.final_exam_pass_mark ?? 70,
    contains: {
      exam: count("final_exam"), assignments: count("assignment"), exercises: count("exercise"),
      modules: c.delivery_mode === "onsite" ? 0 : count("package"), attendance: c.delivery_mode !== "online" || (sessions ?? 0) > 0,
    },
  })
}

export async function PUT(req: Request, { params }: Params) {
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res
  const actor = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!(await canEditCourse(g.scope, id))) return forbidden()

  const body = await req.json().catch(() => ({}))
  const r = readRules(body.rules)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  const { error } = await db.from("lms_courses").update({ completion_rules: r.rules }).eq("id", id)
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 })
  await auditLog(actor, "lms.course.completion_rules", "lms_course", id, null, { rules: r.rules })
  return NextResponse.json({ rules: r.rules })
}
