import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// Public endpoint — called from exam taking page to log security events
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { event, timestamp, duration } = body

  // Fetch current candidate security data
  const { data: candidate } = await db
    .from("candidates")
    .select("tab_switches, fullscreen_exits, right_click_attempts, copy_paste_attempts")
    .eq("id", id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (event === "tab_switch") {
    const current = (candidate.tab_switches as any[]) ?? []
    const updated = [...current, { timestamp, duration: duration ?? null }]
    await db.from("candidates").update({ tab_switches: updated }).eq("id", id)
  } else if (event === "fullscreen_exit") {
    await db.from("candidates").update({
      fullscreen_exits: (candidate.fullscreen_exits ?? 0) + 1,
    }).eq("id", id)
  } else if (event === "right_click") {
    await db.from("candidates").update({
      right_click_attempts: (candidate.right_click_attempts ?? 0) + 1,
    }).eq("id", id)
  } else if (event === "copy_paste") {
    await db.from("candidates").update({
      copy_paste_attempts: (candidate.copy_paste_attempts ?? 0) + 1,
    }).eq("id", id)
  }

  return NextResponse.json({ ok: true })
}
