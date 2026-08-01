export const maxDuration = 180

import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"
import { rateLimit } from "@/lib/rateLimit"
import { res429 } from "@/lib/apiUtils"
import { runChatEdit } from "@/lib/course-gen/jobs/chatEdit"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// POST — one chat turn. Returns either an applied result (small, safe edits)
// or a proposal for the user to preview and approve (anything structural or
// destructive). Runs in-request because the user is waiting; the queue is
// for long work that must survive restarts, which a chat turn is not.
export async function POST(req: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured on the server yet" }, { status: 503 })

  const { allowed, retryAfterSeconds } = await rateLimit(`cg-chat:${session.user.id}`, 60, 3600)
  if (!allowed) return res429(retryAfterSeconds)

  const { moduleId } = await params
  const body = await parseBody(req).catch(() => ({})) as any
  const instruction = String(body.instruction ?? "").trim()
  if (!instruction) return NextResponse.json({ error: "instruction required" }, { status: 400 })

  const { data: mod } = await db.from("cg_modules").select("id, course_id").eq("id", moduleId).single()
  if (!mod) return NextResponse.json({ error: "Module not found" }, { status: 404 })

  try {
    const proposal = await runChatEdit({
      courseId: mod.course_id,
      moduleId,
      instruction,
      openPageIndex: Number.isFinite(body.open_page_index) ? body.open_page_index : 0,
      history: Array.isArray(body.history) ? body.history : [],
    })
    return NextResponse.json(proposal)
  } catch (err: any) {
    console.error("[course-gen] chat turn failed:", err)
    return NextResponse.json({ error: err?.message ?? "The assistant could not complete that request" }, { status: 500 })
  }
}
