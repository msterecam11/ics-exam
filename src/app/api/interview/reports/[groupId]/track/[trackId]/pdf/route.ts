export const maxDuration = 60

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { getBrowser } from "@/lib/browser"
import { PDFDocument } from "pdf-lib"

type Params = { params: Promise<{ groupId: string; trackId: string }> }

/**
 * GET /api/interview/reports/[groupId]/track/[trackId]/pdf
 * Renders the server-side track print page as a per-page merged PDF via Puppeteer + pdf-lib.
 */
export async function GET(req: Request, { params }: Params) {
  const session = await auth()
  if (!session || !["admin", "instructor"].includes(session.user.role ?? ""))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { groupId, trackId } = await params

  if (!process.env.PDF_INTERNAL_SECRET)
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 })

  const port   = process.env.PORT ?? "3000"
  const secret = encodeURIComponent(process.env.PDF_INTERNAL_SECRET)
  const printUrl = `http://localhost:${port}/print/interview/track/${groupId}/${trackId}?pdf_secret=${secret}`

  const browser = await getBrowser()

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 })

    await page.goto(printUrl, { waitUntil: "load", timeout: 60_000 })
    await page.waitForSelector("[data-report-page]", { timeout: 20_000 })
    await new Promise(r => setTimeout(r, 800))

    await page.addStyleTag({
      content: [
        "html, body { margin: 0 !important; padding: 0 !important; }",
        "#report-root { margin: 0 !important; }",
      ].join("\n"),
    })

    const pageCount: number = await page.evaluate(
      () => document.querySelectorAll("[data-report-page]").length
    )
    if (pageCount === 0) throw new Error("No [data-report-page] sections found")

    const merged = await PDFDocument.create()

    for (let i = 0; i < pageCount; i++) {
      await page.evaluate((idx: number) => {
        document.querySelectorAll<HTMLElement>("[data-report-page]").forEach((el, j) => {
          el.style.display = j === idx ? "" : "none"
        })
        window.scrollTo(0, 0)
      }, i)

      const { w, h } = await page.evaluate((idx: number) => {
        const el = document.querySelectorAll("[data-report-page]")[idx] as HTMLElement
        const rect = el.getBoundingClientRect()
        return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) }
      }, i)

      const pagePdfBytes = await page.pdf({
        printBackground: true,
        width:  `${w}px`,
        height: `${h}px`,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      })

      const singleDoc = await PDFDocument.load(pagePdfBytes)
      const [copiedPage] = await merged.copyPages(singleDoc, [0])
      merged.addPage(copiedPage)
    }

    const pdfBytes = await merged.save()

    const rawName     = new URL(req.url).searchParams.get("name") ?? trackId
    const safeName    = rawName.replace(/[/\\:*?"<>|]/g, "-").trim().slice(0, 200)
    const displayName = `Interview Report - ${safeName}`
    const filename        = `${displayName}.pdf`
    const filenameEncoded = encodeURIComponent(`${displayName}.pdf`)

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${filenameEncoded}`,
        "Cache-Control":       "no-store",
      },
    })
  } finally {
    await browser.close()
  }
}
