// What has happened to one certificate. A certificate that changed silently is
// no use as evidence, so every action is kept and shown.

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data } = await db.from("lms_certificate_events")
    .select("id, action, actor_name, detail, at")
    .eq("certificate_id", id).order("at", { ascending: false }).limit(100)

  return NextResponse.json(data ?? [])
}
