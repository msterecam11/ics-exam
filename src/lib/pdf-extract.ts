import { db } from "@/lib/db"
import { spawn } from "child_process"
import path from "path"

// ── Parse Supabase storage URL → bucket + path ────────────────────
export function parseSupabaseStorageUrl(url: string): { bucket: string; path: string } | null {
  // https://*.supabase.co/storage/v1/object/public/{bucket}/{path}
  // https://*.supabase.co/storage/v1/object/sign/{bucket}/{path}?token=...
  const m = url.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/?]+)\/(.+?)(?:\?|$)/)
  if (!m) return null
  return { bucket: m[1], path: decodeURIComponent(m[2]) }
}

// ── PDF text extraction via subprocess ────────────────────────────
// pdfjs cannot run inside the Next.js/Turbopack bundle (worker setup
// fails in bundled environments). We spawn scripts/extract-pdf-text.js
// as a plain Node.js subprocess so it loads pdfjs natively.
// Returns one string per page (empty string for pages with no text).
export async function extractPdfPageTexts(url: string): Promise<string[]> {
  try {
    // Download the PDF — try plain fetch first, fall back to Supabase storage client
    let rawBuffer: Buffer | null = null
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) })
    if (res.ok) {
      rawBuffer = Buffer.from(await res.arrayBuffer())
    } else {
      const parsed = parseSupabaseStorageUrl(url)
      if (parsed) {
        const { data } = await db.storage.from(parsed.bucket).download(parsed.path)
        if (data) rawBuffer = Buffer.from(await (data as Blob).arrayBuffer())
      }
    }

    if (!rawBuffer) {
      console.warn(`[pdf-extract] Could not download PDF: ${url.slice(0, 80)}`)
      return []
    }

    const scriptPath = path.join(process.cwd(), "scripts", "extract-pdf-text.js")
    const buf = rawBuffer

    const texts = await new Promise<string[]>((resolve) => {
      const proc = spawn(process.execPath, [scriptPath], { timeout: 30_000 })
      const out: Buffer[] = []
      const err: Buffer[] = []

      proc.stdout.on("data", d => out.push(d))
      proc.stderr.on("data", d => { err.push(d) })

      proc.on("close", code => {
        const rawOut = Buffer.concat(out)
        if (code !== 0) {
          console.error("[pdf-extract] subprocess error:", Buffer.concat(err).toString().slice(0, 300))
          resolve([]); return
        }
        try {
          const rawStr = rawOut.toString()
          const jsonStart = rawStr.indexOf("[")
          if (jsonStart === -1) { resolve([]); return }
          const parsed = JSON.parse(rawStr.slice(jsonStart))
          resolve(Array.isArray(parsed) ? parsed : [])
        } catch { resolve([]) }
      })

      proc.on("error", e => {
        console.error("[pdf-extract] subprocess spawn failed:", e.message)
        resolve([])
      })

      proc.stdin.write(buf)
      proc.stdin.end()
    })

    return texts
  } catch (err) {
    console.error(`[pdf-extract] extraction failed:`, err)
    return []
  }
}
