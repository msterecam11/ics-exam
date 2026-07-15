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

  const { data: candidate } = await db
    .from("candidates")
    .select("full_name, exams(title)")
    .eq("id", candidateId)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const url = new URL(req.url)
  const entity  = url.searchParams.get("entity")   ?? "Group"
  const content = url.searchParams.get("content")  ?? "Course"
  const security = url.searchParams.get("security") ?? ""
  const mode = url.searchParams.get("mode") === "manual" ? "manual" : ""
  const port   = process.env.PORT ?? "3000"
  const secret = encodeURIComponent(process.env.PDF_INTERNAL_SECRET ?? "")
  const printUrl = `http://localhost:${port}/print/candidate/${candidateId}?entity=${encodeURIComponent(entity)}&content=${encodeURIComponent(content)}&pdf_secret=${secret}${security === "1" ? "&security=1" : ""}${mode === "manual" ? "&mode=manual" : ""}`

  const browser = await getBrowser()

  try {
    const page = await browser.newPage()

    // 794px = A4 width at 96 DPI — matches the report's design width exactly
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 })

    // Use "load" (not "networkidle0") — dev-mode WebSockets keep connections
    // open permanently and networkidle0 would time out every time.
    await page.goto(printUrl, { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector("#report-root", { timeout: 20000 })

    // Brief settle so images and fonts finish painting
    await new Promise((r) => setTimeout(r, 800))

    // Inject a hard margin/padding reset directly from Puppeteer so it cannot
    // be overridden or deferred by Next.js style hoisting.  Also strip the
    // auto-centering margin from #report-root so it sits flush at (0, 0).
    await page.addStyleTag({
      content: [
        "html, body { margin: 0 !important; padding: 0 !important; }",
        "#report-root { margin: 0 !important; }",
      ].join("\n"),
    })

    // NOTE: we intentionally stay in screen media (no emulateMediaType("print")).
    // Reason: print media activates `break-before: page` on every non-first Page
    // div; when we isolate a single section and generate its mini-PDF, Puppeteer
    // inserts a blank first page before the break, so copyPages([0]) returns a
    // blank page instead of the actual content.
    // printBackground: true already captures backgrounds correctly in screen media.

    // ── Advanced per-page PDF generation ──────────────────────────────────────
    //
    // Strategy: measure each [data-report-page] section's actual rendered height
    // (getBoundingClientRect, sub-pixel accurate), then show only one section at
    // a time and generate an individual PDF whose height matches that section
    // exactly. Merge all pages with pdf-lib.
    // Result: every PDF page = pixel-perfect match of the browser view.

    // Create a <style> element we can update per-page to drive @page size.
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
      // ── Step 1: isolate this section ────────────────────────────────────────
      // Hide all other sections first so the vertical scrollbar disappears and
      // the content reflows to its true full width before we measure anything.
      await page.evaluate((idx: number) => {
        document.querySelectorAll<HTMLElement>("[data-report-page]").forEach((el, j) => {
          el.style.display = j === idx ? "" : "none"
        })
        window.scrollTo(0, 0)
      }, i)

      // ── Step 2: measure AFTER isolation ────────────────────────────────────
      // Now that the scrollbar is gone the element width reflects the true
      // content width (794 px). Reading width + height here is fully automatic —
      // no hardcoded numbers, works for every page type including the cover.
      const { w, h } = await page.evaluate((idx: number) => {
        const el = document.querySelectorAll("[data-report-page]")[idx] as HTMLElement
        const rect = el.getBoundingClientRect()
        return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) }
      }, i)

      // ── Step 3: set @page to the exact measured size (CSS px → no rounding) ─
      await page.evaluate((width: number, height: number) => {
        const el = document.getElementById("puppeteer-page-size") as HTMLStyleElement
        el.textContent = `@page { size: ${width}px ${height}px; margin: 0; }`
      }, w, h)

      // ── Step 4: generate & merge ─────────────────────────────────────────────
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

    // ── Build filename ─────────────────────────────────────────────────────────
    const name = (candidate as any).full_name ?? "Candidate"
    const examTitle = ((candidate as any).exams as any)?.title ?? "Exam"
    const filename = `${name} - ${examTitle} - Report.pdf`
      .replace(/[^\x00-\x7F]/g, "-")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/-{2,}/g, "-")
      .trim()
    const filenameEncoded = encodeURIComponent(`${name} — ${examTitle} — Report.pdf`)

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
