import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const BUCKET = "lms-library"
const MAX_MB = 10

// Question figure upload — not keyed by a question id, because a NEW
// question doesn't have one yet when the admin picks a file in the builder
// dialog. Returns just the public URL; the caller (QuestionBuilder) stores
// it on the in-memory draft and it's saved along with the rest of the
// question on submit, same as every other field in that form.
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 }) }

  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (!file.type.startsWith("image/"))
    return NextResponse.json({ error: "File must be an image" }, { status: 400 })
  if (file.size / (1024 * 1024) > MAX_MB)
    return NextResponse.json({ error: `File too large (max ${MAX_MB} MB)` }, { status: 413 })

  const ext = file.name.split(".").pop()?.toLowerCase() || "png"
  const storagePath = `exams/questions/${crypto.randomUUID()}.${ext}`

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    })
  if (uploadError)
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  return NextResponse.json({ url: urlData.publicUrl })
}
