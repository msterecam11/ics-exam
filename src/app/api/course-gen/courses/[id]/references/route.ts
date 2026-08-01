import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const BUCKET = "lms-library"
const MAX_MB = 50

// Extracts plain text from an uploaded reference so the Content Agent can
// ground generation in it. v1 handles PDF (pdf-parse) and plain text;
// other formats are stored without extraction (still downloadable, just
// not fed into prompts).
async function extractText(file: File, buffer: Buffer): Promise<string | null> {
  const mime = file.type || ""
  try {
    if (mime === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      // @ts-expect-error — pdf-parse ships no type declarations
      const pdfParse = (await import("pdf-parse")).default as (b: Buffer) => Promise<{ text: string }>
      const parsed = await pdfParse(buffer)
      return parsed.text?.trim() || null
    }
    if (mime.startsWith("text/") || /\.(txt|md|csv)$/i.test(file.name)) {
      return buffer.toString("utf8").trim() || null
    }
  } catch (err) {
    console.error("[course-gen] reference text extraction failed:", err)
  }
  return null
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: courseId } = await params
  const { data: course } = await db.from("cg_courses").select("id").eq("id", courseId).single()
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 }) }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (file.size / (1024 * 1024) > MAX_MB)
    return NextResponse.json({ error: `File too large (max ${MAX_MB} MB)` }, { status: 413 })

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const storagePath = `course-gen/refs/${courseId}/${Date.now()}-${safeName}`
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    })
  if (uploadError)
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  const extracted = await extractText(file, buffer)

  const { data: row, error: dbError } = await db
    .from("cg_reference_materials")
    .insert({
      course_id: courseId,
      file_name: file.name,
      file_url: urlData.publicUrl,
      storage_path: storagePath,
      extracted_text: extracted,
    })
    .select("id, file_name, file_url, created_at")
    .single()

  if (dbError) {
    await db.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ ...row, has_text: !!extracted }, { status: 201 })
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: courseId } = await params
  const { data, error } = await db
    .from("cg_reference_materials")
    .select("id, file_name, file_url, created_at, extracted_text")
    .eq("course_id", courseId)
    .order("created_at")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    references: (data ?? []).map((r: any) => ({
      id: r.id, file_name: r.file_name, file_url: r.file_url,
      created_at: r.created_at, has_text: !!r.extracted_text,
    })),
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id: courseId } = await params
  const refId = new URL(req.url).searchParams.get("ref_id")
  if (!refId) return NextResponse.json({ error: "ref_id required" }, { status: 400 })

  const { data: ref } = await db
    .from("cg_reference_materials")
    .select("id, storage_path")
    .eq("id", refId)
    .eq("course_id", courseId)
    .single()
  if (!ref) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (ref.storage_path) await db.storage.from(BUCKET).remove([ref.storage_path])
  const { error } = await db.from("cg_reference_materials").delete().eq("id", refId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
