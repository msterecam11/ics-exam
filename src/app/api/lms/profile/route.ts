import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession, PREVIEW_READ_ONLY } from "@/lib/lms-auth"

// GET /api/lms/profile
export async function GET() {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data } = await db
    .from("lms_students")
    .select("id, name, email, job_title, company, language")
    .eq("id", student.id)
    .single()

  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(data)
}

// PATCH /api/lms/profile
export async function PATCH(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (student.preview) return NextResponse.json(PREVIEW_READ_ONLY, { status: 403 })

  // `name` is deliberately NOT accepted. It is the name printed on the student's
  // certificates, so students cannot change it themselves; an admin corrects it.
  // Any name sent is ignored rather than rejected, so an older page that still
  // posts it keeps saving the other fields.
  // company is set by an admin (it links the student to a client and decides
  // which reports they appear in), so it is ignored here like name.
  const { job_title, language } = await req.json().catch(() => ({}))

  // No type or length checks existed: a non-string name threw inside .trim()
  // and returned an unhandled 500, and any length was stored. Strings only,
  // bounded, empty optional fields cleared to null.
  const str = (v: unknown, max: number) =>
    v === undefined ? undefined
    : v === null    ? null
    : typeof v === "string" ? (v.trim().slice(0, max) || null)
    : "INVALID"

  const titleV = str(job_title, 120)
  if ([titleV].includes("INVALID") || (language !== undefined && typeof language !== "string"))
    return NextResponse.json({ error: "Invalid profile fields" }, { status: 400 })

  const { error } = await db
    .from("lms_students")
    .update({
      job_title: titleV,
      language,
    })
    .eq("id", student.id)

  // An unknown language value fails the lms_language enum (22P02). That's bad
  // input, not a server fault, and the raw database message shouldn't reach
  // the browser.
  if (error?.code === "22P02") return NextResponse.json({ error: "Invalid language" }, { status: 400 })
  if (error) return NextResponse.json({ error: "Could not update profile" }, { status: 500 })
  return NextResponse.json({ ok: true })
}
