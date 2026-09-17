import { getBrowser } from "@/lib/browser"
import { PDFDocument } from "pdf-lib"

// Renders one of the /print/lms/... pages to a PDF, one PDF page per
// [data-report-page] section, each sized to its content — the same method the
// course and student report PDFs use, shared so every report exports alike.
export async function renderReportPdf(printPath: string, filename: string): Promise<Response> {
  const port   = process.env.PORT ?? "3000"
  const secret = encodeURIComponent(process.env.PDF_INTERNAL_SECRET ?? "")
  const sep = printPath.includes("?") ? "&" : "?"
  const printUrl = `http://localhost:${port}${printPath}${sep}pdf_secret=${secret}`

  const browser = await getBrowser()
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 })
    // "load" not "networkidle0" — dev-mode HMR WebSockets stay open.
    await page.goto(printUrl, { waitUntil: "load", timeout: 90000 })
    await page.waitForSelector("[data-report-page]", { timeout: 30000 })
    await new Promise(r => setTimeout(r, 1200))
    await page.addStyleTag({ content: "html, body { margin: 0 !important; padding: 0 !important; }\n#report-root { margin: 0 !important; }" })

    const pageCount: number = await page.evaluate(() => document.querySelectorAll("[data-report-page]").length)
    if (pageCount === 0) throw new Error("No [data-report-page] sections found")

    const merged = await PDFDocument.create()
    for (let i = 0; i < pageCount; i++) {
      await page.evaluate((idx: number) => {
        document.querySelectorAll<HTMLElement>("[data-report-page]").forEach((el, j) => { el.style.display = j === idx ? "" : "none" })
        window.scrollTo(0, 0)
      }, i)
      const { w, h } = await page.evaluate((idx: number) => {
        const rect = (document.querySelectorAll("[data-report-page]")[idx] as HTMLElement).getBoundingClientRect()
        return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) }
      }, i)
      const bytes = await page.pdf({ printBackground: true, width: `${w}px`, height: `${h}px`, margin: { top: "0", right: "0", bottom: "0", left: "0" } })
      const single = await PDFDocument.load(bytes)
      const [copied] = await merged.copyPages(single, [0])
      merged.addPage(copied)
    }
    const pdfBytes = await merged.save()
    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": contentDisposition(filename),
      },
    })
  } finally {
    await browser.close()
  }
}

export function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x00-\x7F]/g, "-").replace(/[/\\?%*:|"<>]/g, "-").replace(/-{2,}/g, "-").trim()
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}
