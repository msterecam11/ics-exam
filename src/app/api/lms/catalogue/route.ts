// SP-14 / CV-8 — the student's catalogue: categories, and the courses inside
// them that this student is allowed to see.
//
// Logged-in students only. There is no public catalogue yet; that arrives with
// payments and self sign-up.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession } from "@/lib/lms-auth"
import { catalogueViewer, catalogueFilter, listCategories, UNCATEGORISED } from "@/lib/lms-catalogue"

export const dynamic = "force-dynamic"

const CARD_COLUMNS = `
  id, title, short_description, description, thumbnail_url, language, delivery_mode,
  level, duration_hours, category_id, course_code,
  catalogue_visibility, catalogue_companies, status
`

export async function GET(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const viewer = await catalogueViewer(student.id)
  if (!viewer) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // CV-2 — the client switched the catalogue off for their people.
  if (!viewer.companyAllows)
    return NextResponse.json({ available: false, categories: [], courses: [], enrolled: [], requests: [] })

  const sp = new URL(req.url).searchParams
  let q = db.from("lms_courses").select(CARD_COLUMNS).order("title")
  q = catalogueFilter(q, viewer)

  const mode = sp.get("mode")
  if (mode && ["online", "onsite", "hybrid", "external"].includes(mode)) q = q.eq("delivery_mode", mode)
  const category = sp.get("category")
  if (category === "none") q = q.is("category_id", null)
  else if (category) q = q.eq("category_id", category)
  const search = sp.get("q")?.trim()
  if (search) {
    const safe = search.replace(/[%,()]/g, " ")
    q = q.or(`title.ilike.%${safe}%,short_description.ilike.%${safe}%,course_code.ilike.%${safe}%`)
  }

  const [{ data: courses, error }, categories, { data: enrolments }, { data: requests }] = await Promise.all([
    q,
    listCategories({ activeOnly: true }),
    // CV-5 — what they are already on, so the card can say so.
    db.from("lms_enrollments").select("course_id, status").eq("student_id", student.id),
    db.from("lms_course_requests").select("course_id, status").eq("student_id", student.id),
  ])
  if (error) return NextResponse.json({ error: "Could not load the catalogue" }, { status: 500 })

  const rows = (courses ?? []) as any[]
  const used = new Set(rows.map(c => c.category_id).filter(Boolean))

  return NextResponse.json({
    available: true,
    // Only categories that actually hold something this student may see, so an
    // empty one never appears.
    categories: categories
      .filter(k => used.has(k.id))
      .map(k => ({ id: k.id, name: k.name, description: k.description, image_url: k.image_url, colour: k.colour,
                   count: rows.filter(c => c.category_id === k.id).length })),
    uncategorised: rows.filter(c => !c.category_id).length,
    uncategorisedLabel: UNCATEGORISED,
    courses: rows.map(c => ({
      id: c.id, title: c.title,
      blurb: c.short_description || c.description || null,
      thumbnail_url: c.thumbnail_url, language: c.language, delivery_mode: c.delivery_mode,
      level: c.level, duration_hours: c.duration_hours, category_id: c.category_id, course_code: c.course_code,
    })),
    enrolled: (enrolments ?? []).filter((e: any) => e.status !== "dropped").map((e: any) => e.course_id),
    requests: (requests ?? []).map((r: any) => ({ course_id: r.course_id, status: r.status })),
  })
}
