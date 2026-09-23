// The certificate document itself. Stored in the PRIVATE bucket, so it is only
// ever reachable through a short-lived signed link handed out here — never by
// guessing a URL.

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getStudentSession } from "@/lib/lms-auth"
import { certificateNeedsFeedback } from "@/lib/lms-feedback"
import { isMgr } from "@/lib/staff-roles"

export const dynamic = "force-dynamic"

const BUCKET = "lms-submissions"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: cert } = await db.from("lms_certificates")
    .select("id, student_id, enrollment_id, pdf_url, released_at, revoked_at, visible_to_student, verification_code")
    .eq("id", id).maybeSingle()
  const c = cert as any
  if (!c?.pdf_url) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (c.revoked_at) return NextResponse.json({ error: "This certificate has been revoked" }, { status: 410 })

  // Staff may always fetch it; a student only their own, and only once it is
  // released, visible, and any mandatory feedback is in.
  const staff = await auth().catch(() => null)
  if (!staff || !isMgr(staff.user.role)) {
    const student = await getStudentSession()
    if (!student || student.id !== c.student_id) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (!c.released_at || c.visible_to_student === false)
      return NextResponse.json({ error: "Not available yet" }, { status: 403 })
    if (c.enrollment_id && await certificateNeedsFeedback(c.enrollment_id))
      return NextResponse.json({ error: "Complete the course feedback first" }, { status: 403 })
  }

  const { data: signed, error } = await db.storage.from(BUCKET).createSignedUrl(c.pdf_url, 120, {
    download: `${c.verification_code}.pdf`,
  })
  if (error || !signed?.signedUrl) return NextResponse.json({ error: "Could not open the file" }, { status: 500 })
  return NextResponse.redirect(signed.signedUrl)
}
