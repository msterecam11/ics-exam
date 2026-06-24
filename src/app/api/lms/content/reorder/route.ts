import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// POST — bulk reorder content items
// Body: { items: [{ id: string, order_index: number }] }
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const { items } = body as { items?: { id: string; order_index: number }[] }
  if (!Array.isArray(items) || items.length === 0)
    return NextResponse.json({ error: "items array required" }, { status: 400 })

  // Upsert each order in parallel
  await Promise.all(
    items.map(({ id, order_index }) =>
      db.from("lms_content_items").update({ order_index }).eq("id", id)
    )
  )

  return NextResponse.json({ ok: true })
}
