import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { PDFDocument } from "pdf-lib"

// GET /api/lms/pdf-pages?url=xxx
// Returns the page count of a PDF using pdf-lib (no worker, pure JS)
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url).searchParams.get("url")
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 })

  try {
    const res = await fetch(url)
    if (!res.ok) return NextResponse.json({ error: "Could not fetch PDF" }, { status: 400 })
    const buffer = await res.arrayBuffer()

    const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true })
    return NextResponse.json({ pages: pdf.getPageCount() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Failed to read PDF" }, { status: 500 })
  }
}
