import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import { cookies } from "next/headers"
import { getBrowser } from "@/lib/browser"
import { PDFDocument } from "pdf-lib"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed, retryAfterSeconds } = await rateLimit(`pdf:${session.user.id}`, 20, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { courseId } = await params

  const { data: course } = await db
    .from("courses")
    .select("name, groups(name)")
    .eq("id", courseId)
    .single()

  if (!course) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const entity = url.searchParams.get("entity") ?? "Group"
  const content = url.searchParams.get("content") ?? "Course"
  const printUrl = `${baseUrl}/print/course/${courseId}?entity=${encodeURIComponent(entity)}&content=${encodeURIComponent(content)}`

  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  const browser = await getBrowser()

  try {
    const page = await browser.newPage()

    // 794px = A4 width at 96 DPI
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 })

    // Pass auth cookies so the print page can auth-check
    if (allCookies.length > 0) {
      await page.setCookie(
        ...allCookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: url.hostname,
          path: "/",
        }))
      )
    }

    await page.goto(printUrl, { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector("#report-root", { timeout: 20000 })

    // Brief settle so images and fonts finish painting
    await new Promise((r) => setTimeout(r, 800))

    // Inject hard margin/padding reset
    await page.addStyleTag({
      content: [
        "html, body { margin: 0 !important; padding: 0 !important; }",
        "#report-root { margin: 0 !important; }",
      ].join("\n"),
    })

    // Inject style element for per-page @page size updates
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
      // Step 1: isolate — hide all other sections first (scrollbar disappears → true width)
      await page.evaluate((idx: number) => {
        document.querySelectorAll<HTMLElement>("[data-report-page]").forEach((el, j) => {
          el.style.display = j === idx ? "" : "none"
        })
        window.scrollTo(0, 0)
      }, i)

      // Step 2: measure AFTER isolation (scrollbar gone = true content width)
      const { w, h } = await page.evaluate((idx: number) => {
        const el = document.querySelectorAll("[data-report-page]")[idx] as HTMLElement
        const rect = el.getBoundingClientRect()
        return { w: Math.ceil(rect.width), h: Math.ceil(rect.height) }
      }, i)

      // Step 3: set @page to exact measured size
      await page.evaluate((width: number, height: number) => {
        const el = document.getElementById("puppeteer-page-size") as HTMLStyleElement
        el.textContent = `@page { size: ${width}px ${height}px; margin: 0; }`
      }, w, h)

      // Step 4: generate mini-PDF for this section and merge
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
    const courseName = (course as any).name ?? "Course"
    const groupName = (course as any).groups?.name ?? ""
    const label = groupName ? `${groupName} - ${courseName}` : courseName
    const filename = `${label} - Course Report.pdf`
      .replace(/[^\x00-\x7F]/g, "-")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/-{2,}/g, "-")
      .trim()
    const filenameEncoded = encodeURIComponent(`${label} — Course Report.pdf`)

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
