export const maxDuration = 60

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getBrowser } from "@/lib/browser"

// Public — candidate can download their own receipt
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: candidate } = await db
    .from("candidates")
    .select("full_name")
    .eq("id", id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const port   = process.env.PORT ?? "3000"
  const secret = encodeURIComponent(process.env.NEXTAUTH_SECRET ?? "")
  const printUrl = `http://localhost:${port}/print/receipt/${id}?pdf_secret=${secret}`

  console.log("[receipt-pdf] generating for candidate:", id)
  const browser = await getBrowser()

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 480, height: 700, deviceScaleFactor: 1.5 })
    await page.goto(printUrl, { waitUntil: "networkidle2", timeout: 60000 })
    await page.waitForSelector("#receipt-card", { timeout: 20000 })
    console.log("[receipt-pdf] page loaded, generating PDF")

    const { w, h } = await page.evaluate(() => {
      const el = document.getElementById("receipt-card")!
      const rect = el.getBoundingClientRect()
      return { w: Math.ceil(rect.width) + 48, h: Math.ceil(rect.height) + 48 }
    })

    const pdfBytes = await page.pdf({
      printBackground: true,
      width: `${w}px`,
      height: `${h}px`,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    })

    const name = (candidate as any).full_name ?? "candidate"
    const filename = `ICS-Receipt-${name.replace(/\s+/g, "-")}.pdf`
      .replace(/[^\x00-\x7F]/g, "-")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .trim()

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } finally {
    await browser.close()
  }
}
