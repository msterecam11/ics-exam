import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { parseBody } from "@/lib/apiUtils"

function isMgr(role?: string) { return role === "admin" || role === "instructor" }
const BUCKET = "lms-library"

export async function GET(_: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { documentId } = await params
  const [{ data: doc }, { data: sections }] = await Promise.all([
    db.from("cg_documents").select("*").eq("id", documentId).single(),
    db.from("cg_document_sections")
      .select("id, order_index, clause, heading, page_from, page_to, summary, topics, requirement, char_count")
      .eq("document_id", documentId).order("order_index").limit(500),
  ])
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  return NextResponse.json({
    document: { ...doc, extracted_text: undefined },
    sections: sections ?? [],
  })
}

// PATCH — edit catalogue fields, or re-queue a scan ({ rescan: true }).
export async function PATCH(req: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { documentId } = await params
  const body = await parseBody(req).catch(() => ({})) as any

  if (body.rescan) {
    // Start clean: drop the old index so a re-scan can't leave stale sections.
    await db.from("cg_document_sections").delete().eq("document_id", documentId)
    await db.from("cg_documents").update({
      scan_status: "queued", scan_progress: 0, scan_step: "Queued…",
      scan_error: null, section_count: 0, summary: null, extracted_text: null,
      updated_at: new Date().toISOString(),
    }).eq("id", documentId)
    await db.from("cg_generation_jobs").insert({
      job_type: "doc_scan", document_id: documentId, status: "queued",
      input: { document_id: documentId }, current_step: "Queued…",
    })
    return NextResponse.json({ ok: true, rescanning: true })
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const k of ["title", "authority", "doc_reference", "edition", "language"]) {
    if (k in body) patch[k] = body[k]
  }
  const { error } = await db.from("cg_documents").update(patch).eq("id", documentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ documentId: string }> }) {
  const session = await auth()
  if (!session || !isMgr(session.user.role))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { documentId } = await params
  const { data: doc } = await db
    .from("cg_documents")
    .select("id, storage_path, cg_course_documents(course_id)")
    .eq("id", documentId).single()
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const used = ((doc as any).cg_course_documents ?? []).length
  if (used > 0)
    return NextResponse.json({ error: `This document is used by ${used} course${used === 1 ? "" : "s"}` }, { status: 409 })

  if (doc.storage_path) await db.storage.from(BUCKET).remove([doc.storage_path])
  const { error } = await db.from("cg_documents").delete().eq("id", documentId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
