export const maxDuration = 60 // Vercel: extend timeout to 60s for Puppeteer

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import { getBrowser } from "@/lib/browser"
import { PDFDocument } from "pdf-lib"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed, retryAfterSeconds } = await rateLimit(`pdf:${session.user.id}`, 20, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { candidateId } = await params
  const mode = new URL(req.url).searchParams.get("mode") === "manual" ? "manual" : ""

  const { data: candidate } = await db
    .from("candidates")
    .select("full_name, exams(title)")
    .eq("id", candidateId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const port   = process.env.PORT ?? "3000"
  const secret = encodeURIComponent(process.env.PDF_INTERNAL_SECRET ?? "")
  const printUrl = `http://localhost:${port}/print/exam-results/${candidateId}?pdf_secret=${secret}${mode === "manual" ? "&mode=manual" : ""}`

  const browser = await getBrowser()

  try {
    const page = await browser.newPage()

    // 794px = A4 width at 96 DPI — matches the report design width exactly
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 })

    await page.goto(printUrl, { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector("#report-root", { timeout: 20000 })

    // Brief settle so images and fonts finish painting
    await new Promise((r) => setTimeout(r, 800))

    // Inject margin/padding reset so content sits flush at (0,0)
    await page.addStyleTag({
      content: [
        "html, body { margin: 0 !important; padding: 0 !important; }",
        "#report-root { margin: 0 !important; }",
      ].join("\n"),
    })

    // Create a <style> element we update per-page to drive @page size
    await page.evaluate(() => {
      const el = document.createElement("style")
      el.id = "puppeteer-page-size"
      document.head.appendChild(el)
    })

    const pageCount: number = await page.evaluate(
      () => document.querySelectorAll("[data-report-page]").length
    )
    if (pageCount === 0) {
      throw new Error("No [data-report-page] sections found in print page")
    }

    const merged = await PDFDocument.create()

    for (let i = 0; i < pageCount; i++) {
      // Isolate this section — hide all others so content reflows to true width
      await page.evaluate((idx: number) => {
        document.querySelectorAll<HTMLElement>("[data-report-page]").forEach((el, j) => {
          el.style.display = j === idx ? "" : "none"
        })
        window.scrollTo(0, 0)
      }, i)

      // Measure after isolation (scrollbar gone → true 794px width)
      const { w, h } = await page.evaluate((idx: number) => {
        const el = document.querySelectorAll("[data-report-page]")[idx] as HTMLElement
        const rect = el.getBoundingClientRect()
        return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) }
      }, i)

      // Set @page to exact measured size
      await page.evaluate((width: number, height: number) => {
        const el = document.getElementById("puppeteer-page-size") as HTMLStyleElement
        el.textContent = `@page { size: ${width}px ${height}px; margin: 0; }`
      }, w, h)

      const pagePdfBytes = await page.pdf({
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      })

      const singleDoc = await PDFDocument.load(pagePdfBytes)
      const [copiedPage] = await merged.copyPages(singleDoc, [0])
      merged.addPage(copiedPage)
    }

    const pdfBytes = await merged.save()

    // Build filename
    const name      = (candidate as any).full_name ?? "Candidate"
    const examTitle = ((candidate as any).exams as any)?.title ?? "Exam"
    const filename  = `${name} - ${examTitle} - Results.pdf`
      .replace(/[^\x00-\x7F]/g, "-")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/-{2,}/g, "-")
      .trim()
    const filenameEncoded = encodeURIComponent(`${name} — ${examTitle} — Results.pdf`)

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
