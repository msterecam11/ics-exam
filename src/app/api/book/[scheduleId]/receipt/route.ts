export const maxDuration = 60

import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getBrowser } from "@/lib/browser"

type Ctx = { params: Promise<{ scheduleId: string }> }

// GET /api/book/[scheduleId]/receipt?code=XXXX
// Public — candidate downloads their booking receipt PDF
export async function GET(req: NextRequest, { params }: Ctx) {
  const { scheduleId } = await params
  const code = req.nextUrl.searchParams.get("code")?.toUpperCase()

  if (!code) return NextResponse.json({ error: "code is required" }, { status: 400 })

  // Verify booking exists and is confirmed
  const { data: booking } = await db
    .from("schedule_bookings")
    .select("id, candidate_name, confirmation_code, status")
    .eq("schedule_id", scheduleId)
    .eq("confirmation_code", code)
    .single()

  if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 })
  if (booking.status === "cancelled") {
    return NextResponse.json({ error: "Booking is cancelled" }, { status: 410 })
  }

  const port      = process.env.PORT ?? "3000"
  const secret    = process.env.PDF_INTERNAL_SECRET ?? ""
  const printUrl  = `http://localhost:${port}/print/booking/receipt/${scheduleId}?code=${encodeURIComponent(code)}&pdf_secret=${encodeURIComponent(secret)}`

  const browser = await getBrowser()

  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 700, deviceScaleFactor: 2 })
    await page.goto(printUrl, { waitUntil: "networkidle2", timeout: 60000 })
    await page.waitForSelector("#receipt-card", { timeout: 20000 })

    const { w, h } = await page.evaluate(() => {
      const el = document.getElementById("receipt-card")!
      const rect = el.getBoundingClientRect()
      return { w: Math.ceil(rect.width) + 48, h: Math.ceil(rect.height) + 48 }
    })

    const pdfBytes = await page.pdf({
      printBackground: true,
      width:  `${w}px`,
      height: `${h}px`,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    })

    const name     = booking.candidate_name ?? "Booking"
    const filename = `${name.replace(/\s+/g, "-")}-interview-receipt.pdf`
      .replace(/[^\x00-\x7F]/g, "-")
      .replace(/[/\\?%*:|"<>]/g, "-")
      .replace(/-{2,}/g, "-")
      .trim()
    const filenameEncoded = encodeURIComponent(`${name} — Interview Receipt.pdf`)

    return new Response(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type":        "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${filenameEncoded}`,
      },
    })
  } finally {
    await browser.close()
  }
}
