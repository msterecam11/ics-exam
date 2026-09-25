// Course materials — the admin side.
//
// GET    ?course_id=[&group_id=]   — the files, with how many participants took each
// POST   multipart: file, course_id, module_id?, group_id?, title?, description?, available_from?
// PATCH  { id, title?, description?, available_from?, module_id?, order_index? }
// DELETE ?id=                      — the file and its record
//
// Files go to the PRIVATE lms-materials bucket; participants only ever get a
// short signed link, through /api/lms/materials/download.

import { NextResponse } from "next/server"
import crypto from "crypto"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { guardStaff } from "@/lib/staff-access"
import { isUuid } from "@/lib/lms-groups"
import {
  MATERIAL_BUCKET, MATERIAL_MAX_BYTES, MATERIAL_EXTENSIONS, AVAILABLE_FROM, extOf, safeFileName, type AvailableFrom,
} from "@/lib/lms-materials"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const COLUMNS = "id, course_id, module_id, group_id, title, description, file_name, mime_type, size_bytes, available_from, released_at, order_index, created_at"

export async function GET(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const sp = new URL(req.url).searchParams
  const courseId = sp.get("course_id"), groupId = sp.get("group_id")
  if (!isUuid(courseId)) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  let q = db.from("lms_materials").select(COLUMNS).eq("course_id", courseId).order("order_index").order("created_at")
  q = isUuid(groupId) ? q.eq("group_id", groupId) : q.is("group_id", null)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: "Could not load materials" }, { status: 500 })
  const rows = (data ?? []) as any[]

  // How many different participants downloaded each file.
  const { data: dl } = rows.length
    ? await db.from("lms_material_downloads").select("material_id, student_id").in("material_id", rows.map(r => r.id))
    : { data: [] as any[] }
  const takers = new Map<string, Set<string>>()
  for (const d of (dl ?? []) as any[]) {
    if (!takers.has(d.material_id)) takers.set(d.material_id, new Set())
    takers.get(d.material_id)!.add(d.student_id)
  }
  return NextResponse.json(rows.map(r => ({ ...r, downloaded_by: takers.get(r.id)?.size ?? 0 })))
}

export async function POST(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: "Expected a file upload" }, { status: 400 }) }
  const file = form.get("file") as File | null
  const courseId = String(form.get("course_id") ?? "")
  const moduleId = (form.get("module_id") as string) || null
  const groupId  = (form.get("group_id") as string) || null
  const from     = ((form.get("available_from") as string) || "enrolment") as AvailableFrom

  if (!file || typeof file === "string" || !file.size) return NextResponse.json({ error: "Choose a file" }, { status: 400 })
  if (file.size > MATERIAL_MAX_BYTES) return NextResponse.json({ error: "That file is over 50 MB — split it, or compress it" }, { status: 413 })
  if (!MATERIAL_EXTENSIONS.includes(extOf(file.name)))
    return NextResponse.json({ error: `That file type isn't accepted. Use: ${MATERIAL_EXTENSIONS.join(", ")}` }, { status: 400 })
  if (!AVAILABLE_FROM.includes(from)) return NextResponse.json({ error: "Invalid availability" }, { status: 400 })
  if (!isUuid(courseId)) return NextResponse.json({ error: "course_id required" }, { status: 400 })

  const { data: course } = await db.from("lms_courses").select("id, title").eq("id", courseId).maybeSingle()
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 })
  if (moduleId) {
    if (!isUuid(moduleId)) return NextResponse.json({ error: "Invalid module" }, { status: 400 })
    const { data: m } = await db.from("lms_modules").select("id").eq("id", moduleId).eq("course_id", courseId).maybeSingle()
    if (!m) return NextResponse.json({ error: "That module isn't in this course" }, { status: 400 })
  }
  if (groupId) {
    if (!isUuid(groupId)) return NextResponse.json({ error: "Invalid group" }, { status: 400 })
    const { data: grp } = await db.from("lms_course_groups").select("id").eq("id", groupId).eq("course_id", courseId).maybeSingle()
    if (!grp) return NextResponse.json({ error: "That group isn't in this course" }, { status: 400 })
  }

  const safe = safeFileName(file.name)
  const path = `courses/${courseId}/${groupId ? `groups/${groupId}/` : ""}${crypto.randomUUID()}-${safe.replace(/ /g, "_")}`
  const { error: upErr } = await db.storage.from(MATERIAL_BUCKET)
    .upload(path, await file.arrayBuffer(), { contentType: file.type || "application/octet-stream", upsert: false })
  if (upErr) return NextResponse.json({ error: "The upload failed. Please try again." }, { status: 500 })

  const title = String(form.get("title") ?? "").trim().slice(0, 200) || file.name.replace(/\.[^.]+$/, "")
  const description = String(form.get("description") ?? "").trim().slice(0, 1000) || null
  const { count } = await db.from("lms_materials").select("id", { count: "exact", head: true }).eq("course_id", courseId)
  const { data: row, error } = await db.from("lms_materials").insert({
    course_id: courseId, module_id: moduleId, group_id: groupId, title, description,
    storage_path: path, file_name: safe, mime_type: file.type || null, size_bytes: file.size,
    available_from: from, order_index: count ?? 0, created_by: g.session.id,
  }).select(COLUMNS).single()
  if (error || !row) {
    await db.storage.from(MATERIAL_BUCKET).remove([path])
    return NextResponse.json({ error: "Could not save the file" }, { status: 500 })
  }

  await auditLog(session, "lms.material.upload", "lms_material", (row as any).id, title, { course_id: courseId, module_id: moduleId, group_id: groupId, size: file.size })
  return NextResponse.json({ ...row, downloaded_by: 0 }, { status: 201 })
}

export async function PATCH(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const body = await req.json().catch(() => ({}))
  if (!isUuid(body.id)) return NextResponse.json({ error: "id required" }, { status: 400 })
  const { data: cur } = await db.from("lms_materials").select("id, course_id").eq("id", body.id).maybeSingle()
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const updates: Record<string, any> = {}
  if (typeof body.title === "string") {
    const t = body.title.trim().slice(0, 200)
    if (!t) return NextResponse.json({ error: "The title can't be empty" }, { status: 400 })
    updates.title = t
  }
  if (body.description !== undefined) updates.description = typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 1000) : null
  if (body.available_from !== undefined) {
    if (!AVAILABLE_FROM.includes(body.available_from)) return NextResponse.json({ error: "Invalid availability" }, { status: 400 })
    updates.available_from = body.available_from
  }
  if (body.module_id !== undefined) {
    if (body.module_id === null || body.module_id === "") updates.module_id = null
    else {
      if (!isUuid(body.module_id)) return NextResponse.json({ error: "Invalid module" }, { status: 400 })
      const { data: m } = await db.from("lms_modules").select("id").eq("id", body.module_id).eq("course_id", (cur as any).course_id).maybeSingle()
      if (!m) return NextResponse.json({ error: "That module isn't in this course" }, { status: 400 })
      updates.module_id = body.module_id
    }
  }
  if (body.order_index !== undefined && Number.isInteger(body.order_index)) updates.order_index = body.order_index
  if (!Object.keys(updates).length) return NextResponse.json({ error: "Nothing to change" }, { status: 400 })

  const { data, error } = await db.from("lms_materials").update(updates).eq("id", body.id).select(COLUMNS).single()
  if (error) return NextResponse.json({ error: "Could not save" }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: Request) {
  const g = await guardStaff({ admin: true })
  if (!g.ok) return g.res
  const session = { user: { id: g.session.id, name: g.session.name, role: g.session.role } } as any
  const id = new URL(req.url).searchParams.get("id")
  if (!isUuid(id)) return NextResponse.json({ error: "id required" }, { status: 400 })
  const { data: m } = await db.from("lms_materials").select("id, title, storage_path, course_id").eq("id", id).maybeSingle()
  if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { error } = await db.from("lms_materials").delete().eq("id", id)
  if (error) return NextResponse.json({ error: "Could not delete" }, { status: 500 })
  await db.storage.from(MATERIAL_BUCKET).remove([(m as any).storage_path])
  await auditLog(session, "lms.material.delete", "lms_material", id, (m as any).title, { course_id: (m as any).course_id })
  return NextResponse.json({ ok: true })
}
