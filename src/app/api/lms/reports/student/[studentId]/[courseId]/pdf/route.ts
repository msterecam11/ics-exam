export const maxDuration = 60

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { getBrowser } from "@/lib/browser"
import { PDFDocument } from "pdf-lib"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

export async function GET(
  req: Request,
  { params }: { params: Promise<{ studentId: string; courseId: string }> }
) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { studentId, courseId } = await params

  const [studentRes, courseRes] = await Promise.all([
    db.from("lms_students").select("name").eq("id", studentId).single(),
    db.from("lms_courses").select("title").eq("id", courseId).single(),
  ])

  if (!studentRes.data || !courseRes.data)
    return NextResponse.json({ error: "Not found" }, { status: 404 })

  const studentName = (studentRes.data as any).name ?? "Student"
  const courseTitle = (courseRes.data as any).title ?? "Course"

  const port    = process.env.PORT ?? "3000"
  const secret  = encodeURIComponent(process.env.PDF_INTERNAL_SECRET ?? "")
  const printUrl = `http://localhost:${port}/print/lms/student/${studentId}/${courseId}?pdf_secret=${secret}`

  const browser = await getBrowser()

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 })
    await page.goto(printUrl, { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector("#report-root", { timeout: 20000 })
    await new Promise(r => setTimeout(r, 800))

    await page.addStyleTag({
      content: "html, body { margin: 0 !important; padding: 0 !important; }\n#report-root { margin: 0 !important; }",
    })

    await page.evaluate(() => {
      const el = document.createElement("style")
      el.id = "puppeteer-page-size"
      document.head.appendChild(el)
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

    const filename = `${studentName} - ${courseTitle} - Progress Report.pdf`
      .replace(/[^\x00-\x7F]/g, "-").replace(/[/\\?%*:|"<>]/g, "-").replace(/-{2,}/g, "-").trim()
    const filenameEncoded = encodeURIComponent(`${studentName} — ${courseTitle} — Progress Report.pdf`)

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
