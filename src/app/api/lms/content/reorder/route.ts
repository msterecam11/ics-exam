import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { guardStaff } from "@/lib/staff-access"

// POST — bulk reorder content items
// Body: { items: [{ id: string, order_index: number }] }
export async function POST(req: Request) {
  // IR-12 — course authoring.
  const g = await guardStaff({ permission: "author_courses" })
  if (!g.ok) return g.res

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
