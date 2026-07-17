import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

// Manual (client) report logos — optional, shown alongside the ICS Aviation
// logo on the manual report header. Stored as an ordered array on the
// group row so any manual report (candidate, and later course/group level)
// picks up the same branding from one place.

const BUCKET  = "lms-library"
const MAX_MB  = 5
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"]
const MAX_LOGOS = 3

// POST — upload and append a logo. FormData: file (image)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params

  let form: FormData
  try { form = await req.formData() }
  catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }) }

  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  if (!ALLOWED.includes(file.type))
    return NextResponse.json({ error: "Only JPEG, PNG, WebP or SVG allowed" }, { status: 415 })

  if (file.size / (1024 * 1024) > MAX_MB)
    return NextResponse.json({ error: `Max ${MAX_MB} MB` }, { status: 413 })

  const { data: group } = await db.from("groups").select("manual_report_logos").eq("id", groupId).single()
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const current: string[] = group.manual_report_logos ?? []
  if (current.length >= MAX_LOGOS)
    return NextResponse.json({ error: `Maximum ${MAX_LOGOS} logos per group` }, { status: 400 })

  const ext = file.type.split("/")[1].replace("jpeg", "jpg").replace("svg+xml", "svg")
  const storagePath = `group-logos/${groupId}/${Date.now()}.${ext}`

  const { error: uploadErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, await file.arrayBuffer(), { contentType: file.type, upsert: true })

  if (uploadErr) return NextResponse.json({ error: `Upload failed: ${uploadErr.message}` }, { status: 500 })

  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  const url = urlData.publicUrl

  const updated = [...current, url]
  const { error: dbErr } = await db.from("groups").update({ manual_report_logos: updated }).eq("id", groupId)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ manual_report_logos: updated })
}

// DELETE — remove a logo by URL. Body: { url }
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id: groupId } = await params
  const { url } = await req.json().catch(() => ({}))
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

  const { data: group } = await db.from("groups").select("manual_report_logos").eq("id", groupId).single()
  if (!group) return NextResponse.json({ error: "Group not found" }, { status: 404 })

  const updated = ((group.manual_report_logos ?? []) as string[]).filter((u) => u !== url)
  const { error: dbErr } = await db.from("groups").update({ manual_report_logos: updated }).eq("id", groupId)
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ manual_report_logos: updated })
}
