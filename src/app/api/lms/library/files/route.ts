import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

const BUCKET = "lms-library"
const MAX_MB = 500

function mimeToFileType(mime: string): string {
  if (mime.startsWith("video/"))                                                    return "mp4"
  if (mime.startsWith("audio/"))                                                    return "mp3"
  if (mime === "application/pdf")                                                   return "pdf"
  if (mime.includes("powerpoint") || mime.includes("presentationml"))              return "pptx"
  if (mime.includes("msword") || mime.includes("wordprocessingml"))                return "docx"
  if (mime.startsWith("image/"))                                                    return "image"
  if (mime.includes("ms-excel") || mime.includes("spreadsheetml"))                 return "other"
  return "other"
}

// GET — list files in a folder (or all if no folder_id)
export async function GET(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const folderId = searchParams.get("folder_id")
  const search   = searchParams.get("search")?.trim() ?? ""

  let query = db
    .from("lms_library_files")
    .select("*")
    .order("created_at", { ascending: false })

  // "root" is a sentinel meaning files with no folder (folder_id IS NULL)
  if (folderId === "root") query = query.is("folder_id", null)
  else if (folderId)       query = query.eq("folder_id", folderId)
  // if no folderId and no search, return all files (kept for backward compat / search)
  if (search) query = query.ilike("name", `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST — upload a file OR register an external link
// Multipart: file upload
// JSON: { is_external: true, public_url, name, folder_id?, description? }
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const contentType = req.headers.get("content-type") ?? ""

  // ── External link ──────────────────────────────────────────────────────────
  if (contentType.includes("application/json")) {
    let body: Record<string, unknown>
    try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

    const { name, public_url, folder_id, description } = body as Record<string, string>
    if (!name?.trim())       return NextResponse.json({ error: "name required" },       { status: 400 })
    if (!public_url?.trim()) return NextResponse.json({ error: "public_url required" }, { status: 400 })

    const { data, error } = await db.from("lms_library_files").insert({
      name:          name.trim(),
      original_name: name.trim(),
      mime_type:     "text/uri-list",
      file_type:     "other",
      size_bytes:    0,
      public_url:    public_url.trim(),
      is_external:   true,
      folder_id:     folder_id || null,
      description:   description?.trim() || null,
      created_by:    session.user.id,
    }).select("id, folder_id, name, original_name, mime_type, file_type, size_bytes, public_url, is_external, description, created_at").single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data, { status: 201 })
  }

  // ── File upload ────────────────────────────────────────────────────────────
  if (!contentType.includes("multipart/form-data"))
    return NextResponse.json({ error: "Expected multipart/form-data or application/json" }, { status: 415 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: "Failed to parse form data" }, { status: 400 }) }

  const file      = formData.get("file") as File | null
  const folderId  = (formData.get("folder_id") as string) || null
  const customName = (formData.get("name") as string)?.trim() || ""
  const desc      = (formData.get("description") as string)?.trim() || ""

  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  const sizeMB = file.size / (1024 * 1024)
  if (sizeMB > MAX_MB)
    return NextResponse.json({ error: `File too large (max ${MAX_MB} MB)` }, { status: 413 })

  // Build storage path: folder_id/timestamp-filename (sanitised)
  const safeName     = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
  const storagePath  = `${folderId ?? "root"}/${Date.now()}-${safeName}`
  const displayName  = customName || file.name

  // Upload to Supabase Storage
  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert:      false,
    })

  if (uploadError)
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 })

  // Get public URL
  const { data: urlData } = db.storage.from(BUCKET).getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl

  // Save metadata to DB
  const { data: fileRow, error: dbError } = await db.from("lms_library_files").insert({
    name:          displayName,
    original_name: file.name,
    mime_type:     file.type || "application/octet-stream",
    file_type:     mimeToFileType(file.type || ""),
    size_bytes:    file.size,
    storage_path:  storagePath,
    public_url:    publicUrl,
    is_external:   false,
    folder_id:     folderId,
    description:   desc || null,
    created_by:    session.user.id,
  }).select("id, folder_id, name, original_name, mime_type, file_type, size_bytes, public_url, is_external, description, created_at").single()

  if (dbError) {
    // Cleanup storage on DB failure
    await db.storage.from(BUCKET).remove([storagePath])
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json(fileRow, { status: 201 })
}

// PATCH — rename / move / update description
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  const { id, name, folder_id, description } = body as Record<string, string>
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name?.trim())        updates.name        = name.trim()
  if ("folder_id" in body) updates.folder_id   = folder_id || null
  if ("description" in body) updates.description = description?.trim() || null

  const { data, error } = await db
    .from("lms_library_files")
    .update(updates)
    .eq("id", id)
    .select("id, folder_id, name, original_name, mime_type, size_bytes, public_url, is_external, description, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE — remove file from storage + DB
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })

  // Get the file record first
  const { data: file } = await db
    .from("lms_library_files")
    .select("storage_path, is_external")
    .eq("id", id)
    .single()

  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Delete from storage (if not external link)
  if (!file.is_external && file.storage_path) {
    await db.storage.from(BUCKET).remove([file.storage_path])
  }

  const { error } = await db.from("lms_library_files").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
