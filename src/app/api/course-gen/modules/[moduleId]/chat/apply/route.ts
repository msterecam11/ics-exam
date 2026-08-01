import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"
import type { AgentOp } from "@/lib/course-gen/jobs/chatEdit"
import type { CanvasElement } from "@/lib/course-gen/primitives"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

// POST — commit an approved set of agent ops. Element-level ops are applied
// to the stored elements; slide-level ops use the elements the chat route
// already compiled (so what the user previewed is exactly what lands).
// Every target is re-validated against THIS module server-side — the client
// never gets to widen the agent's scope.
export async function POST(req: Request, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { moduleId } = await params
  const body = await parseBody(req, 4_000_000).catch(() => ({})) as any
  const ops: AgentOp[] = Array.isArray(body.ops) ? body.ops : []
  const compiled: Record<string, CanvasElement[]> = body.compiled ?? {}
  if (ops.length === 0) return NextResponse.json({ ok: true, applied: 0 })

  const { data: pagesRaw } = await db
    .from("cg_pages")
    .select("id, order_index, layout_kind, elements, source_content")
    .eq("module_id", moduleId).order("order_index")
  const pages = pagesRaw ?? []

  let applied = 0
  const now = new Date().toISOString()

  for (const op of ops) {
    const page = "page_index" in op ? pages[(op as any).page_index] : null
    if ("page_index" in op && !page) continue

    switch (op.op) {
      case "update_element": {
        const els = (page!.elements ?? []).map((e: any) =>
          e.id === op.element_id ? { ...e, ...op.patch } : e)
        await db.from("cg_pages").update({ elements: els, manually_diverged: true, updated_at: now }).eq("id", page!.id)
        applied++
        break
      }
      case "add_element": {
        const els = [...(page!.elements ?? []), op.element]
        await db.from("cg_pages").update({ elements: els, manually_diverged: true, updated_at: now }).eq("id", page!.id)
        applied++
        break
      }
      case "delete_element": {
        const els = (page!.elements ?? []).filter((e: any) => e.id !== op.element_id)
        await db.from("cg_pages").update({ elements: els, manually_diverged: true, updated_at: now }).eq("id", page!.id)
        applied++
        break
      }
      case "rewrite_slide": {
        const els = compiled[String(op.page_index)]
        if (!els) break
        await db.from("cg_pages").update({
          elements: els,
          source_content: { ...(page!.source_content ?? {}), title: op.title ?? page!.source_content?.title, intent: op.intent ?? page!.source_content?.intent },
          blueprint: op.blueprint ?? null,
          // Regenerated from a blueprint, so it matches its structure again.
          manually_diverged: false,
          updated_at: now,
        }).eq("id", page!.id)
        applied++
        break
      }
      case "add_slide": {
        const els = compiled[`new:${op.after_index}`] ?? []
        const insertAt = op.after_index + 1
        for (const p of pages.filter(p => p.order_index >= insertAt).reverse()) {
          await db.from("cg_pages").update({ order_index: p.order_index + 1 }).eq("id", p.id)
        }
        await db.from("cg_pages").insert({
          module_id: moduleId,
          order_index: insertAt,
          layout_kind: op.layout_kind,
          background: {},
          elements: els,
          source_content: { intent: op.intent ?? "ai-added", layout_kind: op.layout_kind, title: op.title },
          blueprint: op.blueprint ?? null,
        })
        applied++
        break
      }
      case "delete_slide": {
        await db.from("cg_pages").delete().eq("id", page!.id)
        applied++
        break
      }
      case "reorder_slide": {
        const ids = pages.map(p => p.id)
        const [moved] = ids.splice(op.page_index, 1)
        ids.splice(Math.max(0, Math.min(ids.length, op.to_index)), 0, moved)
        for (let i = 0; i < ids.length; i++) {
          await db.from("cg_pages").update({ order_index: 10_000 + i }).eq("id", ids[i])
        }
        for (let i = 0; i < ids.length; i++) {
          await db.from("cg_pages").update({ order_index: i }).eq("id", ids[i])
        }
        applied++
        break
      }
    }
  }

  // Renumber defensively so deletes/inserts never leave gaps.
  const { data: after } = await db.from("cg_pages")
    .select("id").eq("module_id", moduleId).order("order_index")
  for (let i = 0; i < (after ?? []).length; i++) {
    await db.from("cg_pages").update({ order_index: i }).eq("id", after![i].id)
  }

  return NextResponse.json({ ok: true, applied })
}
