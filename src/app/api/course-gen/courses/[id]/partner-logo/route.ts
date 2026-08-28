import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const BUCKET = "lms-library"
const MAX_MB = 10

// Client/partner logo upload — per-course setting, never part of the theme.
// Two variants: "light" (white version, shown on dark slides) and "dark"
// (colored/dark version, shown on light slides). If a client only supplies
// one, the renderer falls back to a CSS recolor for the missing side.
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
  const variant = formData.get("variant") as string
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (!["light", "dark"].includes(variant))
    return NextResponse.json({ error: "variant must be 'light' or 'dark'" }, { status: 400 })
  // SVG explicitly excluded — it's an XML format that can carry a <script>
  // tag, and this file is served back from a public storage URL.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    return NextResponse.json({ error: "Logo must be a raster image (SVG not allowed)" }, { status: 400 })
  if (file.size / (1024 * 1024) > MAX_MB)
    return NextResponse.json({ error: `File too large (max ${MAX_MB} MB)` }, { status: 413 })

  const ext = file.name.split(".").pop()?.toLowerCase() || "png"
  const storagePath = `course-gen/partner-logos/${courseId}/${variant}-${Date.now()}.${ext}`

  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, await file.arrayBuffer(), {
      contentType: file.type,
      upsert: false,
    })
  if (uploadError)
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  const column = variant === "light" ? "partner_logo_light_url" : "partner_logo_dark_url"

  const { error: dbError } = await db
    .from("cg_courses")
    .update({ [column]: urlData.publicUrl, updated_at: new Date().toISOString() })
    .eq("id", courseId)

  if (dbError) {
    await db.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ url: urlData.publicUrl, variant })
}
