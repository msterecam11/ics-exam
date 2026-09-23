// GET /api/lms/materials/zip?course_id=
//
// "Download all": every file the participant can open right now, in one ZIP,
// in folders by section (Course / Module … / Your group). Each file is
// recorded as taken. Files not yet open are left out. Capped at 150 MB so the
// server never holds more than that — beyond it, files are downloaded one by one.

import { NextResponse } from "next/server"
import JSZip from "jszip"
import { db } from "@/lib/db"
import { getStudentSession } from "@/lib/lms-auth"
import { getCurrentEnrollment } from "@/lib/lms-enrollment"
import { isUuid } from "@/lib/lms-groups"
import { MATERIAL_BUCKET, ZIP_MAX_BYTES, materialsFor, resolveItem, logDownloads, safeFileName } from "@/lib/lms-materials"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  const courseId = new URL(req.url).searchParams.get("course_id")
  if (!isUuid(courseId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const student = await getStudentSession()
  if (!student) return NextResponse.json({ error: "Please sign in" }, { status: 401 })
  const enrollment = await getCurrentEnrollment(student.id, courseId)
  if (!enrollment || enrollment.access === "none") return NextResponse.json({ error: "Not found" }, { status: 404 })

  const sections = await materialsFor(enrollment)
  const open = sections.map(s => ({ ...s, items: s.items.filter(i => i.available) })).filter(s => s.items.length)
  if (!open.length) return NextResponse.json({ error: "There's nothing to download yet" }, { status: 404 })

  const zip = new JSZip()
  const taken: { materialId: string | null; label: string }[] = []
  let total = 0
  const used = new Set<string>()
  const uniqueName = (folder: string, name: string) => {
    let n = name, i = 2
    while (used.has(`${folder}/${n}`)) { n = name.replace(/(\.[^.]+)?$/, ` (${i++})$1`); }
    used.add(`${folder}/${n}`)
    return n
  }

  for (const [si, s] of open.entries()) {
    const folder = `${String(si + 1).padStart(2, "0")} ${safeFileName(s.title)}`
    for (const it of s.items) {
      const item = await resolveItem(it.key)
      if (!item) continue
      let buf: ArrayBuffer | null = null
      if (item.kind === "file") {
        const { data } = await db.storage.from(MATERIAL_BUCKET).download(item.storagePath)
        buf = data ? await data.arrayBuffer() : null
      } else {
        const res = await fetch(item.url).catch(() => null)
        buf = res?.ok ? await res.arrayBuffer() : null
      }
      if (!buf) continue
      total += buf.byteLength
      if (total > ZIP_MAX_BYTES)
        return NextResponse.json({ error: "These files are too large for one download — please download them one by one" }, { status: 413 })
      zip.file(`${folder}/${uniqueName(folder, safeFileName(item.fileName))}`, buf)
      taken.push({ materialId: item.kind === "file" ? item.materialId : null, label: it.title })
    }
  }
  if (!taken.length) return NextResponse.json({ error: "The files could not be collected. Please try again." }, { status: 500 })

  const { data: course } = await db.from("lms_courses").select("title, course_code").eq("id", courseId).single()
  const body = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE", compressionOptions: { level: 3 } })

  if (!student.preview)
    await logDownloads(taken.map(t => ({ studentId: student.id, enrollmentId: enrollment.id, courseId, materialId: t.materialId, label: t.label, viaZip: true })))

  const name = `${safeFileName((course as any)?.course_code || (course as any)?.title || "Course")} - Course material.zip`
  return new NextResponse(body as any, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  })
}
