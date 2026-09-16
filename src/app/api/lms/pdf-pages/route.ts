import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { PDFDocument } from "pdf-lib"

// Matches the library upload cap; anything larger would not be in storage.
const MAX_BYTES = 100 * 1024 * 1024

// GET /api/lms/pdf-pages?url=xxx
// Returns the page count of a PDF using pdf-lib (no worker, pure JS).
//
// The only caller is the package editor counting pages of a PDF that already
// lives in this project's Supabase storage. This used to fetch ANY url for ANY
// staff session (viewer and assessor included) — a server-side request forgery:
// the server could be pointed at internal addresses or cloud metadata endpoints,
// with success/failure and raw error messages revealing what answered, and the
// whole response buffered with no size limit. Now: managers only, https to this
// project's Supabase host only, size-capped, and no raw error text returned.
export async function GET(req: Request) {
  const session = await auth()
  if (!session || (session.user.role !== "admin" && session.user.role !== "instructor"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const raw = new URL(req.url).searchParams.get("url")
  if (!raw) return NextResponse.json({ error: "url required" }, { status: 400 })

  let target: URL
  let storageHost: string
  try {
    target      = new URL(raw)
    storageHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").host
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 })
  }
  if (target.protocol !== "https:" || !storageHost || target.host !== storageHost)
    return NextResponse.json({ error: "Only files stored in the library can be read" }, { status: 400 })

  try {
    // redirect: "error" so an allowed host can't bounce the request elsewhere.
    const res = await fetch(target, { redirect: "error" })
    if (!res.ok) return NextResponse.json({ error: "Could not fetch PDF" }, { status: 400 })
    const declared = Number(res.headers.get("content-length") ?? 0)
    if (declared > MAX_BYTES) return NextResponse.json({ error: "PDF too large" }, { status: 413 })

    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > MAX_BYTES) return NextResponse.json({ error: "PDF too large" }, { status: 413 })

    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
    return NextResponse.json({ pages: pdf.getPageCount() })
  } catch {
    return NextResponse.json({ error: "Failed to read PDF" }, { status: 400 })
  }
}
