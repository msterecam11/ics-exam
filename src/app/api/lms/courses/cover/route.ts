import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const BUCKET   = "lms-library"
const MAX_MB   = 10
const ALLOWED  = ["image/jpeg", "image/png", "image/webp", "image/gif"]

// POST — upload course cover image
// FormData: file (image), course_id
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let form: FormData
  try { form = await req.formData() }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }) }

  const file     = form.get("file") as File | null
  const courseId = (form.get("course_id") as string | null)?.trim()

  if (!file)     return NextResponse.json({ error: "No file provided" },  { status: 400 })
  if (!courseId) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  if (!ALLOWED.includes(file.type))
    return NextResponse.json({ error: "Only JPEG, PNG, WebP or GIF allowed" }, { status: 415 })

  if (file.size / (1024 * 1024) > MAX_MB)
    return NextResponse.json({ error: `Max ${MAX_MB} MB` }, { status: 413 })

  const ext         = file.type.split("/")[1].replace("jpeg", "jpg")
  const storagePath = `course-covers/${courseId}/${Date.now()}.${ext}`

  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert:      true,
    })

  if (uploadErr)
    return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  const url = urlData.publicUrl

  // Persist on course row
  const { error: dbErr } = await db
    .from("lms_courses")
    .update({ thumbnail_url: url, updated_at: new Date().toISOString() })
    .eq("id", courseId)

  if (dbErr)
    return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ url })
}
