export const maxDuration = 60 // Vercel: extend timeout to 60s for Puppeteer

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getBrowser } from "@/lib/browser"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params

  const { data: exam } = await db.from("exams").select("title").eq("id", id).single()
  if (!exam) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const port = process.env.PORT ?? "3000"
  const secret = encodeURIComponent(process.env.NEXTAUTH_SECRET ?? "")
  const printUrl = `http://localhost:${port}/print/invitation/${id}?pdf_secret=${secret}`

  console.log("[invitation-pdf] launching browser, url:", printUrl)
  const browser = await getBrowser()

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 780, height: 600, deviceScaleFactor: 1.5 })

    console.log("[invitation-pdf] navigating to print page")
    await page.goto(printUrl, { waitUntil: "networkidle2", timeout: 60000 })
    console.log("[invitation-pdf] page loaded, waiting for #invitation-card")
    await page.waitForSelector("#invitation-card", { timeout: 20000 })
    console.log("[invitation-pdf] selector found, generating PDF")

    // Get the card dimensions for a tight PDF
    const { w, h } = await page.evaluate(() => {
      const el = document.getElementById("invitation-card")!
      const rect = el.getBoundingClientRect()
      return { w: Math.ceil(rect.width) + 48, h: Math.ceil(rect.height) + 48 }
    })

    const pdfBytes = await page.pdf({
      printBackground: true,
      width: `${w}px`,
      height: `${h}px`,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    })

    const title = (exam as any).title ?? "Exam"
    const filename = `${title.replace(/\s+/g, "-")}-invitation.pdf`
      .replace(/[^\x00-\x7F]/g, "-")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/-{2,}/g, "-")
      .trim()
    const filenameEncoded = encodeURIComponent(`${title} — Invitation.pdf`)

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${filenameEncoded}`,
      },
    })
  } finally {
    await browser.close()
  }
}
