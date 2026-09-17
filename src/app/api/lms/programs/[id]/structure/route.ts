import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { auditLog } from "@/lib/audit"
import { ensureProgramRules, syncMemberEnrollments } from "@/lib/lms-programs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// POST /api/lms/programs/[id]/structure — admin only
// Body: { action, ... }
//   add_track     { name }
//   rename_track  { track_id, name }
//   delete_track  { track_id }                       (no members on it)
//   add_item      { track_id|null, course_id | path_id }
//   remove_item   { item_id }
//   reorder       { item_ids: string[] }             (within one scope)
//
// After a change that alters what members take, every active member's
// enrollments are brought in line (new courses enrolled; removed ones
// withdrawn with history kept).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session || session.user.role !== "admin")
    return NextResponse.json({ error: "Admin only" }, { status: 403 })
  const { id } = await params

  const { data: program } = await db.from("lms_programs").select("id, name, structure, status").eq("id", id).maybeSingle()
  if (!program) return NextResponse.json({ error: "Program not found" }, { status: 404 })
  const p = program as any
  if (p.status === "archived") return NextResponse.json({ error: "An archived program can't be changed" }, { status: 409 })

  const body = await req.json().catch(() => ({}))
  const action = body?.action
  let affectsMembers = false

  const trackOf = async (trackId: unknown) => {
    if (typeof trackId !== "string" || !UUID_RE.test(trackId)) return null
    const { data } = await db.from("lms_program_tracks").select("id").eq("id", trackId).eq("program_id", id).maybeSingle()
    return data ? (data as any).id as string : null
  }

  switch (action) {
    case "add_track": {
      if (p.structure !== "tracks") return NextResponse.json({ error: "This program doesn't use tracks" }, { status: 400 })
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
      if (!name) return NextResponse.json({ error: "Track name is required" }, { status: 400 })
      const { count } = await db.from("lms_program_tracks").select("*", { count: "exact", head: true }).eq("program_id", id)
      const { error } = await db.from("lms_program_tracks").insert({ program_id: id, name, order_index: count ?? 0 })
      if (error) return NextResponse.json({ error: (error as any).code === "23505" ? "A track with this name already exists" : "Could not add track" }, { status: (error as any).code === "23505" ? 409 : 500 })
      break
    }
    case "rename_track": {
      const trackId = await trackOf(body.track_id)
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
      if (!trackId || !name) return NextResponse.json({ error: "Track and name are required" }, { status: 400 })
      const { error } = await db.from("lms_program_tracks").update({ name }).eq("id", trackId)
      if (error) return NextResponse.json({ error: (error as any).code === "23505" ? "A track with this name already exists" : "Could not rename track" }, { status: (error as any).code === "23505" ? 409 : 500 })
      break
    }
    case "delete_track": {
      const trackId = await trackOf(body.track_id)
      if (!trackId) return NextResponse.json({ error: "Track not found" }, { status: 404 })
      const { count } = await db.from("lms_program_members").select("*", { count: "exact", head: true }).eq("track_id", trackId)
      if ((count ?? 0) > 0) return NextResponse.json({ error: "Move this track's students to another track first" }, { status: 409 })
      const { count: sessions } = await db.from("lms_sessions").select("*", { count: "exact", head: true }).eq("track_id", trackId)
      if ((sessions ?? 0) > 0) return NextResponse.json({ error: "This track has class sessions. Delete them or move them to another track first" }, { status: 409 })
      const { error } = await db.from("lms_program_tracks").delete().eq("id", trackId)
      if (error) return NextResponse.json({ error: "Could not delete track" }, { status: 500 })
      break
    }
    case "add_item": {
      const courseId = typeof body.course_id === "string" && UUID_RE.test(body.course_id) ? body.course_id : null
      const pathId   = typeof body.path_id === "string" && UUID_RE.test(body.path_id) ? body.path_id : null
      if (!!courseId === !!pathId) return NextResponse.json({ error: "Choose one course or one learning path" }, { status: 400 })

      let trackId: string | null = null
      if (body.track_id != null) {
        trackId = await trackOf(body.track_id)
        if (!trackId) return NextResponse.json({ error: "Track not found" }, { status: 404 })
      }
      if (p.structure !== "tracks" && trackId) return NextResponse.json({ error: "This program doesn't use tracks" }, { status: 400 })

      const { data: existingItems } = await db.from("lms_program_items").select("id, track_id, course_id, path_id").eq("program_id", id)
      const all = (existingItems ?? []) as any[]
      if (p.structure === "course" && (pathId || all.length)) return NextResponse.json({ error: "A one-course program delivers exactly one course" }, { status: 400 })
      if (p.structure === "path" && (courseId || all.length)) return NextResponse.json({ error: "A one-path program delivers exactly one learning path" }, { status: 400 })
      if (all.some(i => i.track_id === trackId && ((courseId && i.course_id === courseId) || (pathId && i.path_id === pathId))))
        return NextResponse.json({ error: "It's already in this part of the program" }, { status: 409 })

      if (courseId) {
        const { data: c } = await db.from("lms_courses").select("id, status").eq("id", courseId).maybeSingle()
        if (!c) return NextResponse.json({ error: "Course not found" }, { status: 404 })
        if ((c as any).status === "archived") return NextResponse.json({ error: "This course is archived" }, { status: 400 })
      } else {
        const { data: lp, count } = await db.from("lms_learning_path_courses").select("course_id", { count: "exact" }).eq("path_id", pathId!)
        if (!lp || !(count ?? 0)) return NextResponse.json({ error: "This learning path has no courses" }, { status: 400 })
      }

      const scopeCount = all.filter(i => i.track_id === trackId).length
      const { error } = await db.from("lms_program_items").insert({
        program_id: id, track_id: trackId, course_id: courseId, path_id: pathId, order_index: scopeCount,
      })
      if (error) return NextResponse.json({ error: "Could not add it" }, { status: 500 })
      // FB-1: a new program starts from the first course's feedback settings;
      // after that the program's own settings are used.
      if (courseId && all.length === 0 && p.status === "draft") {
        const { data: fbc } = await db.from("lms_courses").select("feedback_enabled, feedback_mandatory, feedback_anonymous").eq("id", courseId).maybeSingle()
        if (fbc) await db.from("lms_programs").update({
          feedback_enabled: !!(fbc as any).feedback_enabled,
          feedback_mandatory: !!(fbc as any).feedback_enabled && !!(fbc as any).feedback_mandatory,
          feedback_anonymous: !!(fbc as any).feedback_anonymous,
        }).eq("id", id)
      }
      await ensureProgramRules(id)
      affectsMembers = true
      break
    }
    case "remove_item": {
      const itemId = typeof body.item_id === "string" && UUID_RE.test(body.item_id) ? body.item_id : null
      if (!itemId) return NextResponse.json({ error: "item_id required" }, { status: 400 })

      // Class sessions scheduled for a course this item delivers would be left
      // with nobody on their roster. Refuse while any exist for a course that
      // would no longer be delivered to the session's track (or to anyone).
      const { data: progSessions } = await db.from("lms_sessions").select("course_id, track_id").eq("program_id", id)
      if ((progSessions ?? []).length) {
        const { data: others } = await db.from("lms_program_items").select("id, track_id, course_id, path_id").eq("program_id", id).neq("id", itemId)
        const pathIds = [...new Set(((others ?? []) as any[]).filter(o => o.path_id).map(o => o.path_id))]
        const { data: pcs } = pathIds.length
          ? await db.from("lms_learning_path_courses").select("path_id, course_id").in("path_id", pathIds)
          : { data: [] }
        const coursesOfItem = (o: any) => o.course_id ? [o.course_id] : ((pcs ?? []) as any[]).filter(pc => pc.path_id === o.path_id).map(pc => pc.course_id)
        const remaining = (trackId: string | null) => new Set(((others ?? []) as any[])
          .filter(o => o.track_id === null || (trackId !== null && o.track_id === trackId))
          .flatMap(coursesOfItem))
        const { data: allTracks } = await db.from("lms_program_tracks").select("id").eq("program_id", id)
        const orphaned = ((progSessions ?? []) as any[]).some(s => s.track_id
          ? !remaining(s.track_id).has(s.course_id)
          : ![null, ...((allTracks ?? []) as any[]).map(t => t.id)].some(t => remaining(t).has(s.course_id)))
        if (orphaned)
          return NextResponse.json({ error: "This program has class sessions for that course. Delete those sessions first" }, { status: 409 })
      }
      const { error, count } = await db.from("lms_program_items").delete({ count: "exact" }).eq("id", itemId).eq("program_id", id)
      if (error) return NextResponse.json({ error: "Could not remove it" }, { status: 500 })
      if (!count) return NextResponse.json({ error: "Not found" }, { status: 404 })
      affectsMembers = true
      break
    }
    case "reorder": {
      const ids = Array.isArray(body.item_ids) ? body.item_ids.filter((x: unknown) => typeof x === "string" && UUID_RE.test(x as string)) : []
      for (let i = 0; i < ids.length; i++) {
        await db.from("lms_program_items").update({ order_index: i }).eq("id", ids[i]).eq("program_id", id)
      }
      break
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }

  let sync: { created: number; withdrawn: number; issues: string[] } | undefined
  // Draft programs are synced too (students can't see a draft); emails only go
  // out for a live program.
  if (affectsMembers) {
    const { data: members } = await db.from("lms_program_members").select("id").eq("program_id", id).eq("status", "active")
    sync = { created: 0, withdrawn: 0, issues: [] }
    for (const m of (members ?? []) as any[]) {
      const r = await syncMemberEnrollments(m.id, session.user.id, { notify: true })
      sync.created += r.created + r.reactivated
      sync.withdrawn += r.withdrawn
      sync.issues.push(...r.issues.map(i => i.reason))
    }
  }

  await auditLog(session, "lms.program.structure", "lms_program", id, p.name, { action })
  return NextResponse.json({ ok: true, ...(sync ? { sync } : {}) })
}
