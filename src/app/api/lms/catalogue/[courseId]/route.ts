// SP-15 — one course as a student browsing the catalogue sees it: the blurb,
// what they'll learn, and the module titles. Never the content itself, and
// never anything about other students.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession } from "@/lib/lms-auth"
import { catalogueViewer, visibleTo } from "@/lib/lms-catalogue"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { courseId } = await params
  if (!UUID_RE.test(courseId)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const viewer = await catalogueViewer(student.id)
  const { data: course } = await db
    .from("lms_courses")
    .select(`id, title, description, short_description, overview_html, thumbnail_url, language,
             delivery_mode, level, duration_hours, learning_outcomes, prerequisites, audience,
             certificate_enabled, course_code, status,
             catalogue_visibility, catalogue_companies,
             lms_course_categories(id, name)`)
    .eq("id", courseId).maybeSingle()

  if (!viewer || !course || !visibleTo(course as any, viewer))
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  const c = course as any
  const [{ data: modules }, { data: enrolment }, { data: request }] = await Promise.all([
    // Titles only — the catalogue is a shop window, not the course.
    db.from("lms_modules").select("id, title, module_type, order_index").eq("course_id", courseId).order("order_index"),
    db.from("lms_enrollments").select("id, status").eq("student_id", student.id).eq("course_id", courseId)
      .neq("status", "dropped").maybeSingle(),
    db.from("lms_course_requests").select("id, status, created_at, decision_note").eq("student_id", student.id)
      .eq("course_id", courseId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ])

  return NextResponse.json({
    id: c.id, title: c.title, course_code: c.course_code,
    blurb: c.short_description || c.description || null,
    description: c.description, overview_html: c.overview_html,
    thumbnail_url: c.thumbnail_url, language: c.language, delivery_mode: c.delivery_mode,
    level: c.level, duration_hours: c.duration_hours,
    audience: c.audience ?? null,
    certificate: c.certificate_enabled !== false,
    learning_outcomes: c.learning_outcomes ?? [],
    prerequisites: c.prerequisites ?? [],
    category: c.lms_course_categories ? { id: c.lms_course_categories.id, name: c.lms_course_categories.name } : null,
    modules: (modules ?? []).map((m: any) => ({ id: m.id, title: m.title, type: m.module_type })),
    enrolled: !!enrolment,
    request: request ? { id: (request as any).id, status: (request as any).status, reason: (request as any).decision_note } : null,
  })
}
