import { db } from "@/lib/db"

// What a program delivers to one track, in order. Kept free of other LMS
// imports so both the enrollment rules and Program Manager can use it without
// a circular import.
//
// Items with no track are for everyone and come first; then the track's own
// items. A learning path expands to its courses in path order. A course that
// appears twice is listed once, at its first position.
export async function coursesForTrack(programId: string, trackId: string | null): Promise<string[]> {
  const { data: items } = await db
    .from("lms_program_items")
    .select("course_id, path_id, track_id, order_index")
    .eq("program_id", programId)
    .order("order_index", { ascending: true })

  const relevant = ((items ?? []) as any[])
    .filter(i => i.track_id === null || (trackId && i.track_id === trackId))
    .sort((a, b) => (a.track_id === null ? 0 : 1) - (b.track_id === null ? 0 : 1) || a.order_index - b.order_index)

  const pathIds = [...new Set(relevant.filter(i => i.path_id).map(i => i.path_id))]
  const pathCourses = new Map<string, string[]>()
  if (pathIds.length) {
    const { data: pcs } = await db
      .from("lms_learning_path_courses")
      .select("path_id, course_id, order_index")
      .in("path_id", pathIds)
      .order("order_index", { ascending: true })
    for (const pc of (pcs ?? []) as any[]) {
      if (!pathCourses.has(pc.path_id)) pathCourses.set(pc.path_id, [])
      pathCourses.get(pc.path_id)!.push(pc.course_id)
    }
  }

  const out: string[] = []
  for (const i of relevant) {
    const ids = i.course_id ? [i.course_id] : (pathCourses.get(i.path_id) ?? [])
    for (const cid of ids) if (!out.includes(cid)) out.push(cid)
  }
  return out
}
