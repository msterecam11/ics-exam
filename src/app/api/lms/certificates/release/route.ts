import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// POST /api/lms/certificates/release
// Body: { course_id, student_id? } — releases pending (unreleased) certificates.
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { course_id, student_id } = await req.json().catch(() => ({}))
  if (!course_id) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  let q = db.from("lms_certificates")
    .update({ released_at: new Date().toISOString(), released_by: session.user.id })
    .eq("course_id", course_id)
    .is("released_at", null)
  if (student_id) q = q.eq("student_id", student_id)

  const { data, error } = await q.select("id")
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ released: data?.length ?? 0 })
}
