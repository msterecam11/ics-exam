import { db } from "@/lib/db"
import { sendEmail, buildCompletionEmail } from "@/lib/email"

// ── Certificate number generator ──────────────────────────────
function generateCertificateNumber(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let code = ""
  for (let i = 0; i < 10; i++) code += chars[Math.floor(Math.random() * chars.length)]
  return `ICS-${code}`
}

// ── Issue certificate (deduped) ────────────────────────────────
async function issueCertificate({
  studentId, courseId, title, type, sourceId, sourceTitle, autoRelease = true,
}: {
  studentId:    string
  courseId?:    string | null
  title:        string
  type:         "course" | "learning_path" | "cohort"
  sourceId?:    string
  sourceTitle?: string
  autoRelease?: boolean   // when true, the certificate is released to the student immediately
}): Promise<string | null> {
  // Dedup: check if already issued
  if (type === "course" && courseId) {
    const { data: ex } = await db
      .from("lms_certificates")
      .select("id")
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .eq("type", "course")
      .maybeSingle()
    if (ex) return null
  } else if (sourceId) {
    const { data: ex } = await db
      .from("lms_certificates")
      .select("id")
      .eq("student_id", studentId)
      .eq("source_id", sourceId)
      .eq("type", type)
      .maybeSingle()
    if (ex) return null
  }

  for (let i = 0; i < 5; i++) {
    const verificationCode = generateCertificateNumber()
    const { error } = await db.from("lms_certificates").insert({
      student_id:        studentId,
      course_id:         courseId ?? null,
      verification_code: verificationCode,
      type,
      source_id:         sourceId    ?? null,
      source_title:      sourceTitle ?? null,
      issued_at:         new Date().toISOString(),
      released_at:       autoRelease ? new Date().toISOString() : null,
    })
    if (!error) return verificationCode
    if (!error.message.includes("unique")) break
  }
  return null
}

// ── Check if student passed the final exam of a course ─────────
async function passedFinalExam(studentId: string, courseId: string): Promise<boolean> {
  const { data: examModule } = await db
    .from("lms_modules")
    .select("id")
    .eq("course_id", courseId)
    .eq("module_type", "final_exam")
    .eq("is_mandatory", true)
    .maybeSingle()

  if (!examModule) return false

  const { count } = await db
    .from("lms_module_attempts")
    .select("*", { count: "exact", head: true })
    .eq("module_id", examModule.id)
    .eq("student_id", studentId)
    .eq("passed", true)

  return (count ?? 0) > 0
}

// ── COURSE completion ──────────────────────────────────────────
// Triggered when student passes the final exam.
// Certificate issued if: final exam passed + course.certificate_enabled
export async function checkCourseCompletion(studentId: string, courseId: string) {
  try {
    const passed = await passedFinalExam(studentId, courseId)
    if (!passed) return

    // Mark enrollment as completed
    await db
      .from("lms_enrollments")
      .update({ status: "completed", completed_at: new Date().toISOString(), progress_pct: 100 })
      .eq("student_id", studentId)
      .eq("course_id", courseId)
      .eq("status", "active")

    // Fetch course
    const { data: course } = await db
      .from("lms_courses")
      .select("title, certificate_enabled, certificate_auto_release")
      .eq("id", courseId)
      .single()

    if (!course) return

    const certEnabled = (course as any).certificate_enabled !== false
    if (!certEnabled) return

    const certNumber = await issueCertificate({
      studentId, courseId, title: course.title, type: "course",
      autoRelease: (course as any).certificate_auto_release === true,
    })

    if (certNumber) {
      const { data: student } = await db
        .from("lms_students")
        .select("name, email")
        .eq("id", studentId)
        .single()

      if (student?.email) {
        const completedAt = new Date().toISOString()
        const { subject, html } = buildCompletionEmail({
          studentName: student.name,
          courseTitle:  course.title,
          courseId,
          completedAt,
        })
        sendEmail({ type: "completion", to: student.email, subject, html, studentId, courseId }).catch(() => {})
      }
    }
  } catch { /* non-critical */ }
}

// ── LEARNING PATH completion ───────────────────────────────────
// Called after every course final exam pass.
// Checks if this course belongs to any learning path the student is in,
// and if ALL courses in that path now have their final exams passed.
export async function checkLearningPathCompletion(studentId: string, courseId: string) {
  try {
    // Find all paths that contain this course
    const { data: pathLinks } = await db
      .from("lms_learning_path_courses")
      .select("path_id")
      .eq("course_id", courseId)

    if (!pathLinks?.length) return

    const pathIds = pathLinks.map((p: any) => p.path_id)

    // Filter to paths the student is actually enrolled in
    const { data: memberLinks } = await db
      .from("lms_learning_path_members")
      .select("path_id")
      .eq("student_id", studentId)
      .in("path_id", pathIds)

    if (!memberLinks?.length) return

    for (const { path_id } of memberLinks) {
      // Get all course IDs in this path
      const { data: pathCourses } = await db
        .from("lms_learning_path_courses")
        .select("course_id")
        .eq("path_id", path_id)

      if (!pathCourses?.length) continue
      const allCourseIds = pathCourses.map((pc: any) => pc.course_id)

      // All courses must have a mandatory final exam
      const { data: finalExams } = await db
        .from("lms_modules")
        .select("id")
        .in("course_id", allCourseIds)
        .eq("module_type", "final_exam")
        .eq("is_mandatory", true)

      // Every course in the path must have a final exam
      if (!finalExams?.length || finalExams.length !== allCourseIds.length) continue

      // Check how many the student has passed
      const { count: passedCount } = await db
        .from("lms_module_attempts")
        .select("*", { count: "exact", head: true })
        .eq("student_id", studentId)
        .eq("passed", true)
        .in("module_id", finalExams.map((e: any) => e.id))

      if ((passedCount ?? 0) < finalExams.length) continue

      // All passed — fetch path settings
      const { data: path } = await db
        .from("lms_learning_paths")
        .select("title, certificate_enabled")
        .eq("id", path_id)
        .single()

      if (!path || (path as any).certificate_enabled === false) continue

      const certNumber = await issueCertificate({
        studentId,
        title:    path.title,
        type:     "learning_path",
        sourceId: path_id,
      })

      // Notify the student — only when a new certificate was actually issued
      if (certNumber) {
        const { data: student } = await db
          .from("lms_students").select("name, email").eq("id", studentId).single()
        if (student?.email) {
          const { subject, html } = buildCompletionEmail({
            studentName: student.name,
            courseTitle: path.title,
            completedAt: new Date().toISOString(),
            kind: "learning path",
          })
          sendEmail({ type: "completion", to: student.email, subject, html, studentId }).catch(() => {})
        }
      }
    }
  } catch { /* non-critical */ }
}

// ── COHORT completion ──────────────────────────────────────────
// Called after every course final exam pass.
// Unified mode:        all cohort courses must be passed.
// Specialization mode: all courses in the student's assigned track must be passed.
export async function checkCohortCompletion(studentId: string, courseId: string) {
  try {
    // Find all cohorts this student is a member of
    const { data: memberRows } = await db
      .from("lms_cohort_members")
      .select("cohort_id, track_id")
      .eq("student_id", studentId)

    if (!memberRows?.length) return

    for (const { cohort_id, track_id } of memberRows) {
      const { data: cohort } = await db
        .from("lms_cohorts")
        .select("mode, name, certificate_enabled")
        .eq("id", cohort_id)
        .single()

      if (!cohort || (cohort as any).certificate_enabled === false) continue

      const mode = (cohort as any).mode ?? "unified"
      let allCourseIds: string[] = []
      let trackName: string | undefined

      if (mode === "unified") {
        const { data: cohortCourses } = await db
          .from("lms_cohort_courses")
          .select("course_id")
          .eq("cohort_id", cohort_id)

        if (!cohortCourses?.length) continue
        allCourseIds = cohortCourses.map((c: any) => c.course_id)

        // Only proceed if this course belongs to this cohort
        if (!allCourseIds.includes(courseId)) continue

      } else {
        // Specialization: student must be assigned to a track
        if (!track_id) continue

        const [{ data: trackData }, { data: trackCourses }] = await Promise.all([
          db.from("lms_cohort_tracks").select("name").eq("id", track_id).single(),
          db.from("lms_cohort_track_courses").select("course_id").eq("track_id", track_id),
        ])

        if (!trackCourses?.length) continue
        allCourseIds = trackCourses.map((c: any) => c.course_id)
        trackName = trackData?.name

        // Only proceed if this course belongs to the student's track
        if (!allCourseIds.includes(courseId)) continue
      }

      // All courses must have a mandatory final exam
      const { data: finalExams } = await db
        .from("lms_modules")
        .select("id")
        .in("course_id", allCourseIds)
        .eq("module_type", "final_exam")
        .eq("is_mandatory", true)

      if (!finalExams?.length || finalExams.length !== allCourseIds.length) continue

      // Check how many the student has passed
      const { count: passedCount } = await db
        .from("lms_module_attempts")
        .select("*", { count: "exact", head: true })
        .eq("student_id", studentId)
        .eq("passed", true)
        .in("module_id", finalExams.map((e: any) => e.id))

      if ((passedCount ?? 0) < finalExams.length) continue

      // All passed — issue cohort certificate
      const certNumber = await issueCertificate({
        studentId,
        title:       (cohort as any).name,
        type:        "cohort",
        sourceId:    cohort_id,
        sourceTitle: trackName,
      })

      // Notify the student — only when a new certificate was actually issued
      if (certNumber) {
        const { data: student } = await db
          .from("lms_students").select("name, email").eq("id", studentId).single()
        if (student?.email) {
          const title = trackName ? `${(cohort as any).name} — ${trackName}` : (cohort as any).name
          const { subject, html } = buildCompletionEmail({
            studentName: student.name,
            courseTitle: title,
            completedAt: new Date().toISOString(),
            kind: "programme",
          })
          sendEmail({ type: "completion", to: student.email, subject, html, studentId }).catch(() => {})
        }
      }
    }
  } catch { /* non-critical */ }
}

// ── Sync enrollment progress % ─────────────────────────────────
// Formula mirrors the student portal (courses/[id]/page.tsx):
//   per-module %: pkg → passed|completed=100%, else items ratio
//                 exam → passed=100%, attempted=30%, else 0%
//                 content → completed_mandatory / total_mandatory
//   course % = Math.round(avg of all mandatory module %s)
export async function syncEnrollmentProgress(studentId: string, courseId: string) {
  try {
    // 1. All mandatory modules for this course
    const { data: modules } = await db
      .from("lms_modules")
      .select("id, module_type")
      .eq("course_id", courseId)
      .eq("is_mandatory", true)

    if (!modules?.length) return

    const pkgModIds  = (modules as any[]).filter((m: any) => m.module_type === "package").map((m: any) => m.id)
    const examModIds = (modules as any[]).filter((m: any) => m.module_type === "final_exam").map((m: any) => m.id)
    const cntModIds  = (modules as any[]).filter((m: any) => m.module_type !== "package" && m.module_type !== "final_exam").map((m: any) => m.id)

    // 2. Fetch package IDs (needed before items + progress queries)
    const { data: pkgRows } = pkgModIds.length
      ? await db.from("lms_packages").select("id, module_id").in("module_id", pkgModIds)
      : { data: [] }

    const pkgIds: string[] = (pkgRows ?? []).map((p: any) => p.id)
    const modIdToPkgId: Record<string, string> = {}
    for (const p of pkgRows ?? []) modIdToPkgId[(p as any).module_id] = (p as any).id

    // 3. All remaining data in parallel
    const [pkgItemRows, pkgProgRows, examAttemptRows, mandatoryItemRows, contentProgRows] = await Promise.all([
      pkgIds.length
        ? db.from("lms_package_items").select("package_id").in("package_id", pkgIds).then(r => r.data ?? [])
        : Promise.resolve([]),
      pkgIds.length
        ? db.from("lms_package_progress").select("package_id, status, completed_items")
            .eq("student_id", studentId).in("package_id", pkgIds).then(r => r.data ?? [])
        : Promise.resolve([]),
      examModIds.length
        ? db.from("lms_module_attempts").select("module_id, passed")
            .eq("student_id", studentId).in("module_id", examModIds)
            .order("attempt_no", { ascending: false }).then(r => r.data ?? [])
        : Promise.resolve([]),
      cntModIds.length
        ? db.from("lms_content_items").select("id, module_id")
            .in("module_id", cntModIds).eq("is_mandatory", true).then(r => r.data ?? [])
        : Promise.resolve([]),
      cntModIds.length
        ? db.from("lms_progress").select("content_item_id")
            .eq("student_id", studentId).eq("course_id", courseId).eq("status", "completed").then(r => r.data ?? [])
        : Promise.resolve([]),
    ])

    // 4. Build lookup maps
    const totalItemsByPkg: Record<string, number> = {}
    for (const item of pkgItemRows as any[])
      totalItemsByPkg[item.package_id] = (totalItemsByPkg[item.package_id] ?? 0) + 1

    const pkgProgByPkgId: Record<string, any> = {}
    for (const pp of pkgProgRows as any[]) pkgProgByPkgId[(pp as any).package_id] = pp

    const examPassedSet    = new Set((examAttemptRows as any[]).filter((a: any) => a.passed).map((a: any) => a.module_id))
    const examAttemptedSet = new Set((examAttemptRows as any[]).map((a: any) => a.module_id))

    const mandatoryByModId: Record<string, string[]> = {}
    for (const ci of mandatoryItemRows as any[]) {
      if (!mandatoryByModId[(ci as any).module_id]) mandatoryByModId[(ci as any).module_id] = []
      mandatoryByModId[(ci as any).module_id].push((ci as any).id)
    }
    const completedIds = new Set((contentProgRows as any[]).map((r: any) => r.content_item_id))

    // 5. Per-module % — exact match to courses/[id]/page.tsx
    let sumPct = 0
    for (const mod of modules as any[]) {
      if (mod.module_type === "package") {
        const pkgId = modIdToPkgId[mod.id]
        const prog  = pkgId ? pkgProgByPkgId[pkgId] : null
        const done  = prog?.status === "passed" || prog?.status === "completed"
        const completed = Array.isArray(prog?.completed_items) ? (prog.completed_items as any[]).length : 0
        const total = pkgId ? (totalItemsByPkg[pkgId] ?? 0) : 0
        // Cap per module: completed_items can exceed total if items were
        // removed from the package after the student finished them.
        sumPct += done ? 100 : total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0
      } else if (mod.module_type === "final_exam") {
        sumPct += examPassedSet.has(mod.id) ? 100 : examAttemptedSet.has(mod.id) ? 30 : 0
      } else {
        const items = mandatoryByModId[mod.id] ?? []
        const done  = items.filter((id: string) => completedIds.has(id)).length
        sumPct += items.length > 0 ? Math.round((done / items.length) * 100) : 0
      }
    }

    const pct = Math.min(100, Math.round(sumPct / (modules as any[]).length))

    await db.from("lms_enrollments")
      .update({ progress_pct: pct })
      .eq("student_id", studentId)
      .eq("course_id", courseId)

    // Reset "completed" enrollment if content was added and progress dropped below 100%
    if (pct < 100) {
      await db.from("lms_enrollments")
        .update({ status: "active", completed_at: null })
        .eq("student_id", studentId)
        .eq("course_id", courseId)
        .eq("status", "completed")
    }
  } catch { /* silent */ }
}
