import { NextResponse } from "next/server"
import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"

const BUCKET  = "lms-library"
const MAX_MB  = 50
const ALLOWED = new Set(["application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"])

// POST — student uploads a file for an assignment submission
// Returns { url, name, size }
export async function POST(req: Request) {
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const contentType = req.headers.get("content-type") ?? ""
  if (!contentType.includes("multipart/form-data"))
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 415 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 }) }

  const file       = formData.get("file") as File | null
  const moduleId   = (formData.get("module_id") as string) || "unknown"
  const allowedRaw = (formData.get("allowed_types") as string) || ""

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  // Validate size
  if (file.size / (1024 * 1024) > MAX_MB)
    return NextResponse.json({ error: `File too large (max ${MAX_MB} MB)` }, { status: 413 })

  // Validate mime type — use passed allowed_types if provided, else default set
  const allowedMimes: Set<string> = allowedRaw
    ? new Set(allowedRaw.split(",").flatMap(t => {
        if (t === "pdf")  return ["application/pdf"]
        if (t === "docx") return [
          "application/msword",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ]
        return []
      }))
    : ALLOWED

  if (allowedMimes.size > 0 && !allowedMimes.has(file.type))
    return NextResponse.json({ error: `File type not allowed (${file.type})` }, { status: 415 })

  const safeName    = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const storagePath = `submissions/${student.id}/${moduleId}/${Date.now()}-${safeName}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert:      false,
    })

  if (uploadError)
    return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath)

  return NextResponse.json({
    url:  urlData.publicUrl,
    name: file.name,
    size: file.size,
  }, { status: 201 })
}
