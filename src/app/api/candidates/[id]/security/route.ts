import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { rateLimit } from "@/lib/rateLimit"
import { getIp, res429 } from "@/lib/apiUtils"

const ALLOWED_EVENTS = ["tab_switch", "fullscreen_exit", "right_click", "copy_paste"] as const
const MAX_TAB_SWITCHES = 200  // cap JSONB array growth

// Public endpoint — called from exam taking page to log security events
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  // 120 events per candidate per hour — a real exam session never exceeds this
  const ip = getIp(req)
  const { allowed, retryAfterSeconds } = await rateLimit(`security-event:${ip}`, 120, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { id } = await params
  const body = await req.json()
  const { event, timestamp, duration } = body

  // Validate event type
  if (!ALLOWED_EVENTS.includes(event)) {
    return NextResponse.json({ ok: true }) // silently ignore unknown events
  }

  // Validate timestamp and duration
  const safeTimestamp = typeof timestamp === "string" && timestamp.length < 50
    ? timestamp
    : new Date().toISOString()
  const safeDuration = typeof duration === "number" && duration >= 0 && duration < 86400
    ? duration
    : null

  // Fetch current candidate security data
  const { data: candidate } = await db
    .from("candidates")
    .select("tab_switches, fullscreen_exits, right_click_attempts, copy_paste_attempts")
    .eq("id", id)
    .single()

  if (!candidate) return NextResponse.json({ error: "Not found" }, { status: 404 })

  if (event === "tab_switch") {
    const current = (candidate.tab_switches as any[]) ?? []
    // Cap array at MAX_TAB_SWITCHES to prevent unbounded growth
    if (current.length < MAX_TAB_SWITCHES) {
      const updated = [...current, { timestamp: safeTimestamp, duration: safeDuration }]
      await db.from("candidates").update({ tab_switches: updated }).eq("id", id)
    }
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
