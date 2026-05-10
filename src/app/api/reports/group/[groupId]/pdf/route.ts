export const maxDuration = 60 // Vercel: extend timeout to 60s for Puppeteer

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
  { params }: { params: Promise<{ groupId: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { allowed, retryAfterSeconds } = await rateLimit(`pdf:${session.user.id}`, 20, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { groupId } = await params

  const { data: group } = await db.from("groups").select("name").eq("id", groupId).single()
  if (!group) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const entity = url.searchParams.get("entity") ?? "Group"
  const content = url.searchParams.get("content") ?? "Course"
  const printUrl = `${baseUrl}/print/group/${groupId}?entity=${encodeURIComponent(entity)}&content=${encodeURIComponent(content)}`

  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()

  const browser = await getBrowser()

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 794, height: 1122, deviceScaleFactor: 1 })

    if (allCookies.length > 0) {
      await page.setCookie(
        ...allCookies.map((c) => ({
          name: c.name,
          value: c.value,
          domain: url.hostname,
          path: "/",
          secure: url.protocol === "https:",
        }))
      )
    }

    await page.goto(printUrl, { waitUntil: "load", timeout: 60000 })
    await page.waitForSelector("#report-root", { timeout: 20000 })
    await new Promise((r) => setTimeout(r, 800))

    await page.addStyleTag({
      content: [
        "html, body { margin: 0 !important; padding: 0 !important; }",
        "#report-root { margin: 0 !important; }",
      ].join("\n"),
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

    const groupName = (group as any).name ?? "Group"
    const filename = `${groupName} - Group Report.pdf`
      .replace(/[^\x00-\x7F]/g, "-")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/-{2,}/g, "-")
      .trim()
    const filenameEncoded = encodeURIComponent(`${groupName} — Group Report.pdf`)

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
