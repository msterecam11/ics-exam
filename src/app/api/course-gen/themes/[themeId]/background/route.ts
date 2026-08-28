import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const BUCKET = "lms-library"
const MAX_MB = 15

// POST — replace one master's background image. This is what turns a
// duplicated theme into a genuinely different visual identity: the zone map
// and chrome positions carry over, only the artwork changes, so every recipe
// and primitive keeps working untouched.
export async function POST(req: Request, { params }: { params: Promise<{ themeId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { themeId } = await params
  const { data: theme } = await db
    .from("cg_themes").select("id, is_main, layout_templates").eq("id", themeId).single()
  if (!theme) return NextResponse.json({ error: "Theme not found" }, { status: 404 })
  if (theme.is_main)
    return NextResponse.json({ error: "The main ICS theme is protected — duplicate it first, then edit the copy." }, { status: 409 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 }) }

  const file = formData.get("file") as File | null
  const master = String(formData.get("master") ?? "")
  const tone = String(formData.get("tone") ?? "")

  const templates = (theme.layout_templates ?? {}) as Record<string, any>
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (!templates[master]) return NextResponse.json({ error: `Unknown master "${master}"` }, { status: 400 })
  // SVG explicitly excluded — it's an XML format that can carry a <script>
  // tag, and this file is served back from a public storage URL.
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml")
    return NextResponse.json({ error: "Background must be a raster image (SVG not allowed)" }, { status: 400 })
  if (file.size / (1024 * 1024) > MAX_MB)
    return NextResponse.json({ error: `File too large (max ${MAX_MB} MB)` }, { status: 413 })

  const ext = file.name.split(".").pop()?.toLowerCase() || "png"
  const path = `course-gen/themes/${themeId}/${master}-${Date.now()}.${ext}`

  const { error: upErr } = await db.storage.from(BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 500 })

  const url = db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl

  const next = {
    ...templates,
    [master]: {
      ...templates[master],
      background: {
        ...templates[master].background,
        asset: url,
        // Tone drives per-slot logo variants, so it must stay accurate when
        // the artwork changes from light to dark or vice versa.
        tone: tone === "dark" || tone === "light" ? tone : templates[master].background?.tone ?? "light",
      },
    },
  }

  const { error } = await db.from("cg_themes")
    .update({ layout_templates: next, updated_at: new Date().toISOString() })
    .eq("id", themeId)
  if (error) {
    await db.storage.from(BUCKET).remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ url, master })
}
