import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const { data } = await db
    .from("cg_course_documents")
    .select("document_id, cg_documents(id, title, authority, doc_reference, scan_status, section_count, page_count)")
    .eq("course_id", id)

  return NextResponse.json({ documents: (data ?? []).map((r: any) => r.cg_documents).filter(Boolean) })
}

// PUT — set exactly which library documents this course draws on.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { id } = await params
  const body = await parseBody(req).catch(() => ({})) as any
  const ids: string[] = Array.isArray(body.document_ids) ? body.document_ids : []

  await db.from("cg_course_documents").delete().eq("course_id", id)
  if (ids.length > 0) {
    const { error } = await db.from("cg_course_documents")
      .insert(ids.map(document_id => ({ course_id: id, document_id })))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, count: ids.length })
}
