// Attach the certificate document to a record — a partner's PDF that arrived by
// email, or a scan of a paper certificate. Private bucket; the student reaches
// it only through the signed link the file route hands out.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"
import { notifyProviderCertificate } from "@/lib/lms-completion"
import { auditLog } from "@/lib/audit"

export const dynamic = "force-dynamic"

const BUCKET = "lms-submissions"
const MAX_BYTES = 15 * 1024 * 1024
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TYPES: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await guardStaff()
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: cert } = await db.from("lms_certificates")
    .select("id, verification_code, pdf_url, issuer, lms_enrollments(group_id), lms_courses(delivery_mode)").eq("id", id).maybeSingle()
  if (!cert) return NextResponse.json({ error: "Certificate not found" }, { status: 404 })
  // Admins; an instructor only for a participant in a group they teach.
  const groupId = (cert as any).lms_enrollments?.group_id ?? null
  if (!g.scope.isAdmin && !(groupId && g.scope.instructorGroupIds.includes(groupId)))
    return NextResponse.json({ error: "Not allowed" }, { status: 403 })

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file" }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is larger than 15 MB" }, { status: 400 })

  const ext = TYPES[file.type]
  if (!ext) return NextResponse.json({ error: "Upload a PDF, PNG or JPG" }, { status: 400 })

  const path = `certificates/${id}/${crypto.randomUUID()}.${ext}`
  const { error } = await db.storage.from(BUCKET)
    .upload(path, new Uint8Array(await file.arrayBuffer()), { contentType: file.type, upsert: false })
  if (error) return NextResponse.json({ error: "Could not store the file" }, { status: 500 })

  // Replacing one leaves no orphan behind.
  const previous = (cert as any).pdf_url
  // An external course's provider certificate shows to the participant once
  // we hold the document.
  const showNow = (cert as any).issuer === "provider" && (cert as any).lms_courses?.delivery_mode === "external"
  await db.from("lms_certificates").update({ pdf_url: path, ...(showNow ? { visible_to_student: true } : {}) }).eq("id", id)
  if (previous) await db.storage.from(BUCKET).remove([previous]).catch(() => {})

  await db.from("lms_certificate_events").insert({
    certificate_id: id, action: previous ? "file replaced" : "file uploaded",
    actor_id: session.user.id, actor_name: session.user.name ?? null,
    detail: { name: file.name, bytes: file.size },
  })
  await auditLog(session, "lms.certificate.file", "lms_certificate", id, (cert as any).verification_code, { name: file.name })
  // First upload of an external course's provider certificate: tell them it's ready.
  if (showNow && !previous) await notifyProviderCertificate(id)
  return NextResponse.json({ ok: true })
}
