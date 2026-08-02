import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const BUCKET = "lms-library"
const MAX_MB = 80

export async function GET() {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data, error } = await db
    .from("cg_documents")
    .select("id, title, file_name, file_url, authority, doc_reference, edition, language, page_count, text_status, ocr_pages, scan_status, scan_progress, scan_step, scan_error, section_count, summary, created_at, cg_course_documents(course_id)")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    documents: (data ?? []).map((d: any) => ({
      ...d,
      used_by: d.cg_course_documents?.length ?? 0,
      cg_course_documents: undefined,
    })),
  })
}

// POST — add a document to the library and queue its one-time scan.
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 }) }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (file.size / (1024 * 1024) > MAX_MB)
    return NextResponse.json({ error: `File too large (max ${MAX_MB} MB)` }, { status: 413 })

  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  if (!isPdf)
    return NextResponse.json({ error: "Only PDF documents can be scanned at the moment" }, { status: 400 })

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const storagePath = `course-gen/library/${Date.now()}-${safeName}`

  const { error: upErr } = await db.storage.from(BUCKET)
    .upload(storagePath, await file.arrayBuffer(), { contentType: file.type || "application/pdf", upsert: false })
  if (upErr) return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 500 })

  const url = db.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl
  const str = (k: string) => {
    const v = formData.get(k)
    return typeof v === "string" && v.trim() ? v.trim() : null
  }

  const { data: doc, error } = await db.from("cg_documents").insert({
    title: str("title") ?? file.name.replace(/\.pdf$/i, ""),
    file_name: file.name,
    file_url: url,
    storage_path: storagePath,
    mime_type: file.type || "application/pdf",
    size_bytes: file.size,
    authority: str("authority"),
    doc_reference: str("doc_reference"),
    edition: str("edition"),
    language: str("language") ?? "en",
    scan_status: "queued",
    scan_step: "Queued for scanning…",
    created_by: session.user.id ?? null,
  }).select("id, title").single()

  if (error) {
    await db.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // The scan runs on the same worker queue as generation — one-time, in the
  // background, and resumable, so a long document costs nobody any waiting.
  await db.from("cg_generation_jobs").insert({
    job_type: "doc_scan",
    document_id: doc.id,
    status: "queued",
    input: { document_id: doc.id },
    current_step: "Queued…",
  })

  return NextResponse.json({ document: doc }, { status: 201 })
}
