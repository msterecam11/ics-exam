// Attach the certificate document to a record — a partner's PDF that arrived by
// email, or a scan of a paper certificate. Private bucket; the student reaches
// it only through the signed link the file route hands out.

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
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
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: cert } = await db.from("lms_certificates")
    .select("id, verification_code, pdf_url").eq("id", id).maybeSingle()
  if (!cert) return NextResponse.json({ error: "Certificate not found" }, { status: 404 })

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
  await db.from("lms_certificates").update({ pdf_url: path }).eq("id", id)
  if (previous) await db.storage.from(BUCKET).remove([previous]).catch(() => {})

  await db.from("lms_certificate_events").insert({
    certificate_id: id, action: previous ? "file replaced" : "file uploaded",
    actor_id: session.user.id, actor_name: session.user.name ?? null,
    detail: { name: file.name, bytes: file.size },
  })
  await auditLog(session, "lms.certificate.file", "lms_certificate", id, (cert as any).verification_code, { name: file.name })
  return NextResponse.json({ ok: true })
}
