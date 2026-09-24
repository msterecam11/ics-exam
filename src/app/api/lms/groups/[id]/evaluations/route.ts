// GET /api/lms/groups/[id]/evaluations — what the group's participants said:
// average ratings per module and per instructor with their comments, and the
// impact questionnaire (average impact score, examples, barriers).
//
// Admins only: it includes the ratings of the instructors themselves. Names
// are left out when the course's feedback is anonymous.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"
import { loadGroup } from "@/lib/lms-groups"
import { MODULE_CRITERIA, INSTRUCTOR_CRITERIA } from "@/lib/lms-evaluation-questions"

export const dynamic = "force-dynamic"

const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null)

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const { id } = await params
  const group = await loadGroup(id)
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const [{ data: course }, { data: evals }, { data: impact }, { data: mods }, { data: staff }] = await Promise.all([
    db.from("lms_courses").select("feedback_anonymous, evaluate_modules, evaluate_instructors, impact_enabled").eq("id", group.course_id).maybeSingle(),
    db.from("lms_evaluations").select("subject_type, subject_id, ratings, comment, submitted_at, lms_students(name)").eq("group_id", id),
    db.from("lms_impact_responses").select("impact_score, answers, submitted_at, lms_students(name)").eq("group_id", id),
    db.from("lms_modules").select("id, title, order_index").eq("course_id", group.course_id).order("order_index"),
    db.from("lms_group_staff").select("user_id, admin_users(name)").eq("group_id", id).eq("role", "instructor"),
  ])
  const anon = !!(course as any)?.feedback_anonymous
  const who = (r: any) => (anon ? null : r.lms_students?.name ?? null)
  const rows = (evals ?? []) as any[]

  const summarise = (type: "module" | "instructor", subjectId: string, title: string) => {
    const mine = rows.filter(r => r.subject_type === type && r.subject_id === subjectId)
    const crit = type === "module" ? MODULE_CRITERIA : INSTRUCTOR_CRITERIA
    const criteria = crit.map(c => ({ key: c.key, label: c.label, avg: avg(mine.map(r => Number(r.ratings?.[c.key])).filter(n => n >= 1 && n <= 5)) }))
    const all = mine.flatMap(r => crit.map(c => Number(r.ratings?.[c.key])).filter(n => n >= 1 && n <= 5))
    return {
      id: subjectId, title, responses: mine.length, overall: avg(all), criteria,
      comments: mine.filter(r => r.comment).map(r => ({ text: r.comment, by: who(r), at: r.submitted_at })),
    }
  }

  const modTitle = new Map(((mods ?? []) as any[]).map(m => [m.id, m.title]))
  const moduleIds = [...new Set(rows.filter(r => r.subject_type === "module").map(r => r.subject_id))]
    .sort((a, b) => ((mods ?? []) as any[]).findIndex(m => m.id === a) - ((mods ?? []) as any[]).findIndex(m => m.id === b))
  const staffName = new Map(((staff ?? []) as any[]).map(s => [s.user_id, s.admin_users?.name ?? "Instructor"]))
  const instructorIds = [...new Set([...staffName.keys(), ...rows.filter(r => r.subject_type === "instructor").map(r => r.subject_id)])]
  const { data: formerStaff } = instructorIds.some(i => !staffName.has(i))
    ? await db.from("admin_users").select("id, name").in("id", instructorIds.filter(i => !staffName.has(i)))
    : { data: [] as any[] }
  for (const u of (formerStaff ?? []) as any[]) staffName.set(u.id, u.name)

  const imp = (impact ?? []) as any[]
  return NextResponse.json({
    settings: course ?? null,
    anonymous: anon,
    modules: moduleIds.map(mid => summarise("module", mid, modTitle.get(mid) ?? "Module (removed)")),
    instructors: instructorIds.map(uid => summarise("instructor", uid, staffName.get(uid) ?? "Instructor")),
    impact: {
      responses: imp.length,
      avg_score: imp.length ? Math.round(imp.reduce((a, r) => a + Number(r.impact_score ?? 0), 0) / imp.length) : null,
      answers: imp.map(r => ({ score: r.impact_score, example: r.answers?.example ?? null, barriers: r.answers?.barriers ?? null, by: who(r), at: r.submitted_at })),
    },
  })
}
