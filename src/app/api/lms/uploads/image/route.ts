import { NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"

const BUCKET = "lms-library"
const MAX_MB = 5
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]
const KINDS = ["category", "company"] as const

// POST — upload a category image or a company logo (admin). Returns { url };
// the form saves it with the rest of the record.
// FormData: file, kind ("category" | "company")
export async function POST(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: "Invalid form data" }, { status: 400 }) }
  const file = form.get("file") as File | null
  const kind = String(form.get("kind") ?? "")
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })
  if (!(KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: "Unknown image kind" }, { status: 400 })
  if (!ALLOWED.includes(file.type)) return NextResponse.json({ error: "Use a JPEG, PNG, WebP, GIF or SVG image" }, { status: 415 })
  if (file.size > MAX_MB * 1024 * 1024) return NextResponse.json({ error: `The image must be under ${MAX_MB} MB` }, { status: 413 })

  const ext = file.type === "image/svg+xml" ? "svg" : file.type.split("/")[1].replace("jpeg", "jpg")
  const path = `branding/${kind}/${crypto.randomUUID()}.${ext}`
  const { error } = await db.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false })
  if (error) return NextResponse.json({ error: "Upload failed — please try again" }, { status: 500 })
  return NextResponse.json({ url: db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl })
}
