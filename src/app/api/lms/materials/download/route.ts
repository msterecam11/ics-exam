// GET /api/lms/materials/download?course_id=&key=
//
// One file. A participant gets it only if it's in THEIR list and already open
// (see materialsFor); the download is recorded. Staff may fetch any file of a
// course (not recorded). The answer is a redirect to a link that works for two
// minutes — a material file never has a permanent address.

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { getStudentSession } from "@/lib/lms-auth"
import { getCurrentEnrollment } from "@/lib/lms-enrollment"
import { staffSession } from "@/lib/staff-access"
import { isUuid } from "@/lib/lms-groups"
import { MATERIAL_BUCKET, materialsFor, resolveItem, logDownloads } from "@/lib/lms-materials"

export const dynamic = "force-dynamic"

async function linkFor(item: NonNullable<Awaited<ReturnType<typeof resolveItem>>>): Promise<string | null> {
  if (item.kind === "file") {
    const { data } = await db.storage.from(MATERIAL_BUCKET).createSignedUrl(item.storagePath, 120, { download: item.fileName })
    return data?.signedUrl ?? null
  }
  // Slide PDFs live in the course library; ask for a download, not a preview.
  try {
    const u = new URL(item.url)
    if (u.hostname.endsWith(".supabase.co")) u.searchParams.set("download", item.fileName)
    return u.toString()
  } catch { return null }
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const courseId = sp.get("course_id"), key = sp.get("key") ?? ""
  if (!isUuid(courseId) || !/^[ms]:[0-9a-f-]{36}$/i.test(key)) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Staff
  const staff = await staffSession()
  if (staff?.role === "admin") {
    const item = await resolveItem(key)
    const url = item && await linkFor(item)
    return url ? NextResponse.redirect(url) : NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Participant
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Please sign in" }, { status: 401 })
  const enrollment = await getCurrentEnrollment(student.id, courseId)
  if (!enrollment || enrollment.access === "none") return NextResponse.json({ error: "Not found" }, { status: 404 })

  const sections = await materialsFor(enrollment)
  const listed = sections.flatMap(s => s.items).find(i => i.key === key)
  if (!listed) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!listed.available) return NextResponse.json({ error: listed.lockedNote ?? "Not available yet" }, { status: 403 })

  const item = await resolveItem(key)
  const url = item && await linkFor(item)
  if (!url) return NextResponse.json({ error: "The file could not be opened" }, { status: 500 })

  // A staff preview ("View as student") takes nothing in the student's name.
  if (!student.preview)
    await logDownloads([{ studentId: student.id, enrollmentId: enrollment.id, courseId, materialId: item.kind === "file" ? item.materialId : null, label: listed.title, viaZip: false }])
  return NextResponse.redirect(url)
}
