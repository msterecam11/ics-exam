import { db } from "@/lib/db"
import { sendRuleEmail, programEmailOverrides } from "@/lib/lms-email-settings"
import { buildCourseCompletedEmail, buildCertificateEmail } from "@/lib/lms-email-templates"
import { getCurrentEnrollment, type EnrollmentContext } from "@/lib/lms-enrollment"
import { courseRules, evaluatePassRule } from "@/lib/lms-pass-rule"
import crypto from "crypto"

// ── Certificate number generator ──────────────────────────────
// Format: ICS-XXXX-XXXX-XXXX  (e.g. ICS-7HQ3-G2YN-LBJH)
//
// Two deliberate choices:
//
// 1. crypto, not Math.random. This number identifies a credential a third
//    party is meant to verify. Math.random is a predictable PRNG — observing
//    a handful of outputs lets you derive the sequence and therefore other
//    people's numbers. That is a poor property for a certificate ID no matter
//    how unlikely the attack.
//
// 2. An alphabet with no 0/O and no 1/I/L, single case, grouped in fours.
//    These numbers get printed and then read back by someone who did not
//    generate them — typed into a verification box or read over the phone.
//    The previous mixed-case alphabet produced codes like "ICS-8fPCeZI1kS",
//    where capital I sits next to digit 1 and is indistinguishable in most
//    fonts.
//
// 32^12 = 60 bits, the same strength as the 10-char/62-symbol code it
// replaces — this trades nothing away for the readability.
const CERT_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const CERT_LENGTH   = 12

export function generateCertificateNumber(): string {
  // Rejection sampling: bytes at or above the largest whole multiple of the
  // alphabet length are discarded rather than folded with %, which would make
  // the first few symbols very slightly likelier than the rest.
  const max = 256 - (256 % CERT_ALPHABET.length)
  let code = ""
  while (code.length < CERT_LENGTH) {
    for (const b of crypto.randomBytes(CERT_LENGTH * 2)) {
      if (b < max) {
        code += CERT_ALPHABET[b % CERT_ALPHABET.length]
        if (code.length === CERT_LENGTH) break
      }
    }
  }
  return `ICS-${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`
}

// ── Issue certificate (deduped) ────────────────────────────────
async function issueCertificate({
  studentId, courseId, enrollmentId, title, type, sourceId, sourceTitle, autoRelease = true,
  issuer = "ics", providerId = null, visibleToStudent = true, validityMonths = null,
}: {
  studentId:    string
  courseId?:    string | null
  enrollmentId?: string | null  // course certificates belong to one enrollment
  title:        string
  type:         "course" | "learning_path" | "cohort"
  sourceId?:    string
  sourceTitle?: string
  autoRelease?: boolean   // when true, the certificate is released to the student immediately
  /** "provider" is the partner's certificate: we hold the record, they issue the paper. */
  issuer?:      "ics" | "provider"
  providerId?:  string | null
  /** false = an internal record; the student never sees it in their portal. */
  visibleToStudent?: boolean
  validityMonths?: number | null
}): Promise<string | null> {
  // Dedup: check if already issued
  if (type === "course" && enrollmentId) {
    // One course certificate per ENROLLMENT: a retake in a new program earns
    // its own certificate; the earlier one stays on record.
    const { data: ex } = await db
      .from("lms_certificates")
      .select("id")
      .eq("enrollment_id", enrollmentId)
      .eq("type", "course")
      .eq("issuer", issuer)
      .maybeSingle()
    if (ex) return null
  } else if (type === "course" && courseId) {
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
      enrollment_id:     enrollmentId ?? null,
      verification_code: verificationCode,
      type,
      source_id:         sourceId    ?? null,
      source_title:      sourceTitle ?? null,
      issued_at:         new Date().toISOString(),
      released_at:       autoRelease ? new Date().toISOString() : null,
      issuer,
      provider_id:       providerId,
      visible_to_student: visibleToStudent,
      expires_at:        validityMonths && validityMonths > 0
        ? new Date(Date.now() + validityMonths * 30.4375 * 86400_000).toISOString()
        : null,
    })
    if (!error) return verificationCode
    if (!error.message.includes("unique")) break
  }
  return null
}

// ── Check if an enrollment passed the final exam of its course ──
async function passedFinalExam(enrollment: Pick<EnrollmentContext, "id" | "course_id">): Promise<boolean> {
  const courseId = enrollment.course_id
  // The final exam is the completion gate whether or not it's flagged
  // mandatory — don't require is_mandatory here (an admin toggling it optional
  // shouldn't silently break course completion / certificate issuance).
  const { data: examModule } = await db
    .from("lms_modules")
    .select("id")
    .eq("course_id", courseId)
    .eq("module_type", "final_exam")
    .order("is_mandatory", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!examModule) return false

  const { count } = await db
    .from("lms_module_attempts")
    .select("*", { count: "exact", head: true })
    .eq("module_id", examModule.id)
    .eq("enrollment_id", enrollment.id)
    .eq("passed", true)

  return (count ?? 0) > 0
}

async function enrollmentProgram(enrollmentId: string): Promise<{ program_id: string | null; program: EnrollmentContext["program"] }> {
  const { data } = await db
    .from("lms_enrollments")
    .select("program_id, lms_programs(id, name, status, end_date, after_end_access, certificate_enabled, certificate_auto_release, progress_enforcement, external_ics_certificate)")
    .eq("id", enrollmentId)
    .maybeSingle()
  return { program_id: (data as any)?.program_id ?? null, program: (data as any)?.lms_programs ?? null }
}

// ── PROGRAM member completion ──────────────────────────────────
// A member is completed once every course enrollment they have in the program
// (excluding withdrawn ones) is completed. (Program/track certificates come
// with the certificate template work.)
export async function checkProgramMemberCompletion(studentId: string, programId: string) {
  try {
    const { data: rows } = await db
      .from("lms_enrollments")
      .select("status")
      .eq("student_id", studentId)
      .eq("program_id", programId)
      .neq("status", "dropped")
    if (!rows?.length || rows.some((r: any) => r.status !== "completed")) return
    await db.from("lms_program_members")
      .update({ status: "completed" })
      .eq("program_id", programId).eq("student_id", studentId).eq("status", "active")
  } catch (err) {
    console.error("[completion] checkProgramMemberCompletion failed", { studentId, programId, err })
  }
}

// ── COURSE completion ──────────────────────────────────────────
// Triggered when student passes the final exam.
// Certificate issued if: final exam passed + course.certificate_enabled
export async function checkCourseCompletion(studentId: string, courseId: string, enrollmentId?: string) {
  try {
    // Completion is per enrollment (the current one unless a specific one is given).
    const enrollment = enrollmentId
      ? { id: enrollmentId, course_id: courseId, ...(await enrollmentProgram(enrollmentId)) }
      : await getCurrentEnrollment(studentId, courseId)
    if (!enrollment) return
    // A course with a pass rule completes when the rule says so (requirements
    // met and the weighted score reached, nothing left to come); otherwise,
    // as always, when the final exam is passed.
    const rules = await courseRules(courseId)
    if (rules) {
      const result = await evaluatePassRule(enrollment.id)
      if (!result?.passed) return
    } else if (!(await passedFinalExam(enrollment))) return

    // Mark enrollment as completed
    await db
      .from("lms_enrollments")
      .update({ status: "completed", completed_at: new Date().toISOString(), progress_pct: 100 })
      .eq("id", enrollment.id)
      .eq("status", "active")

    if (enrollment.program_id) await checkProgramMemberCompletion(studentId, enrollment.program_id)

    // Fetch course
    const { data: course } = await db
      .from("lms_courses")
      .select(`title, delivery_mode, certificate_enabled, certificate_auto_release, provider_id,
               partner_certificate, partner_certificate_visible, ics_certificate_visible,
               certificate_validity_months`)
      .eq("id", courseId)
      .single()

    if (!course) return

    // EM-6 — the student finished the course. Sent whether or not a certificate
    // follows, so a course without one still congratulates them.
    await notifyCourseCompleted(studentId, courseId, course.title, enrollment.program_id ?? null)

    // A program's certificate settings govern its enrollments (PM-4); outside a
    // program the course settings apply as before.
    const program = enrollment.program
    const c = course as any
    const autoRelease = program ? program.certificate_auto_release : c.certificate_auto_release === true
    const validity = c.certificate_validity_months ?? null

    // An external course (e.g. ICAO): the provider's certificate is theirs — we
    // keep the record, and it shows once its PDF is uploaded. Our own
    // certificate only when the program asks for it (outside a program, the
    // course's own setting).
    if (c.delivery_mode === "external") {
      const { data: grp } = await db.from("lms_enrollments").select("lms_course_groups(provider_id)").eq("id", enrollment.id).maybeSingle()
      const providerId = (grp as any)?.lms_course_groups?.provider_id ?? c.provider_id ?? null
      if (providerId) await issueCertificate({
        studentId, courseId, enrollmentId: enrollment.id, title: course.title, type: "course",
        autoRelease, issuer: "provider", providerId, visibleToStudent: false, validityMonths: validity,
      })
      const ics = program ? program.certificate_enabled && (program as any).external_ics_certificate === true : c.certificate_enabled === true
      if (!ics) return
      const code = await issueCertificate({
        studentId, courseId, enrollmentId: enrollment.id, title: course.title, type: "course",
        autoRelease, issuer: "ics", visibleToStudent: true, validityMonths: validity,
      })
      if (code) await notifyCertificateIssued(studentId, courseId, enrollment.id)
      return
    }

    const certEnabled = program ? program.certificate_enabled : c.certificate_enabled !== false
    if (!certEnabled) return

    const certNumber = await issueCertificate({
      studentId, courseId, enrollmentId: enrollment.id, title: course.title, type: "course",
      autoRelease, issuer: "ics", visibleToStudent: c.ics_certificate_visible !== false,
      validityMonths: validity,
    })

    // A partner-delivered course can also earn THEIR certificate. We hold the
    // record so the history and the report numbers are complete; whether the
    // student sees it depends on our having their PDF.
    if (c.partner_certificate && c.provider_id) {
      await issueCertificate({
        studentId, courseId, enrollmentId: enrollment.id, title: course.title, type: "course",
        autoRelease, issuer: "provider", providerId: c.provider_id,
        visibleToStudent: c.partner_certificate_visible === true,
        validityMonths: validity,
      })
    }

    // Only our own certificate is worth emailing about — the partner's is theirs to send.
    if (certNumber) await notifyCertificateIssued(studentId, courseId, enrollment.id)
  } catch (err) {
    // Non-fatal: must never break exam submission. Logged so a certificate
    // that fails to issue is visible instead of vanishing silently.
    console.error("[completion] checkCourseCompletion failed", { studentId, courseId, err })
  }
}

// ── Sync enrollment progress % ─────────────────────────────────
// Formula mirrors the student portal (courses/[id]/page.tsx):
//   per-module %: pkg → passed|completed=100%, else items ratio
//                 exam → passed=100%, attempted=30%, else 0%
//                 content → completed_mandatory / total_mandatory
//   course % = Math.round(avg of all mandatory module %s)
export async function syncEnrollmentProgress(studentId: string, courseId: string, enrollmentId?: string) {
  try {
    // Progress belongs to one enrollment: the current one unless given.
    const enrollment = enrollmentId ? { id: enrollmentId } : await getCurrentEnrollment(studentId, courseId)
    if (!enrollment) return

    // 1. Modules that count toward completion. Prefer mandatory modules, but
    //    if a course has NONE marked mandatory (e.g. every module set optional),
    //    fall back to ALL modules — otherwise progress freezes at 0% forever
    //    even after the student completes everything.
    let modules: { id: string; module_type: string }[] | null = null
    const mandRes = await db
      .from("lms_modules")
      .select("id, module_type")
      .eq("course_id", courseId)
      .eq("is_mandatory", true)
    modules = mandRes.data as any
    if (!modules?.length) {
      const allRes = await db
        .from("lms_modules")
        .select("id, module_type")
        .eq("course_id", courseId)
      modules = allRes.data as any
    }

    // A classroom course has no module player: its modules are headings.
    const { data: modeRow } = await db.from("lms_courses").select("delivery_mode").eq("id", courseId).maybeSingle()
    if ((modeRow as any)?.delivery_mode === "onsite") {
      modules = (modules as any[]).filter((m: any) => m.module_type !== "package")
      if (!modules.length) modules = (((await db.from("lms_modules").select("id, module_type").eq("course_id", courseId)).data ?? []) as any[])
        .filter((m: any) => m.module_type !== "package")
    }

    if (!modules?.length) return

    const pkgModIds  = (modules as any[]).filter((m: any) => m.module_type === "package").map((m: any) => m.id)
    const examModIds = (modules as any[]).filter((m: any) => m.module_type === "final_exam").map((m: any) => m.id)
    const assignModIds = (modules as any[]).filter((m: any) => m.module_type === "assignment").map((m: any) => m.id)
    const exerciseModIds = (modules as any[]).filter((m: any) => m.module_type === "exercise").map((m: any) => m.id)

    // 2. Fetch package IDs (needed before items + progress queries)
    const { data: pkgRows } = pkgModIds.length
      ? await db.from("lms_packages").select("id, module_id").in("module_id", pkgModIds)
      : { data: [] }

    const pkgIds: string[] = (pkgRows ?? []).map((p: any) => p.id)
    const modIdToPkgId: Record<string, string> = {}
    for (const p of pkgRows ?? []) modIdToPkgId[(p as any).module_id] = (p as any).id

    // 3. All remaining data in parallel
    const [pkgItemRows, pkgProgRows, examAttemptRows, assignRows, exerciseRows] = await Promise.all([
      pkgIds.length
        ? db.from("lms_package_items").select("package_id").in("package_id", pkgIds).then(r => r.data ?? [])
        : Promise.resolve([]),
      pkgIds.length
        ? db.from("lms_package_progress").select("package_id, status, completed_items")
            .eq("enrollment_id", enrollment.id).in("package_id", pkgIds).then(r => r.data ?? [])
        : Promise.resolve([]),
      examModIds.length
        ? db.from("lms_module_attempts").select("module_id, passed")
            .eq("enrollment_id", enrollment.id).in("module_id", examModIds)
            .order("attempt_no", { ascending: false }).then(r => r.data ?? [])
        : Promise.resolve([]),
      assignModIds.length
        ? db.from("lms_module_attempts").select("module_id, passed, status")
            .eq("enrollment_id", enrollment.id).in("module_id", assignModIds).then(r => r.data ?? [])
        : Promise.resolve([]),
      exerciseModIds.length
        ? db.from("lms_exercise_results").select("module_id, passed")
            .eq("enrollment_id", enrollment.id).in("module_id", exerciseModIds).then(r => r.data ?? [])
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
    const assignPassedSet    = new Set((assignRows as any[]).filter((a: any) => a.passed && a.status === "released").map((a: any) => a.module_id))
    const assignSubmittedSet = new Set((assignRows as any[]).map((a: any) => a.module_id))
    const exercisePassedSet  = new Set((exerciseRows as any[]).filter((e: any) => e.passed).map((e: any) => e.module_id))

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
      } else if (mod.module_type === "assignment") {
        // Passed once the mark is released; submitted counts half.
        sumPct += assignPassedSet.has(mod.id) ? 100 : assignSubmittedSet.has(mod.id) ? 50 : 0
      } else if (mod.module_type === "exercise") {
        sumPct += exercisePassedSet.has(mod.id) ? 100 : 0
      }
      // Live-session modules add 0%: attendance is tracked on its own.
    }

    const pct = Math.min(100, Math.round(sumPct / (modules as any[]).length))

    // Total active time-on-task for the whole course (all packages + all exam/
    // assignment attempts, incl. optional modules). Stored so the roster,
    // dashboard, and reports read one number instead of re-summing.
    const [allPkgTime, allAttemptTime] = await Promise.all([
      db.from("lms_package_progress").select("time_spent").eq("enrollment_id", enrollment.id).then(r => r.data ?? []),
      db.from("lms_module_attempts").select("time_spent_s").eq("enrollment_id", enrollment.id).then(r => r.data ?? []),
    ])
    const timeSpentS =
      (allPkgTime as any[]).reduce((s, p) => s + (p.time_spent ?? 0), 0) +
      (allAttemptTime as any[]).reduce((s, a) => s + (a.time_spent_s ?? 0), 0)

    await db.from("lms_enrollments")
      .update({ progress_pct: pct, time_spent_s: timeSpentS })
      .eq("id", enrollment.id)

    // Reset "completed" enrollment if content was added and progress dropped below 100%
    // (not for a course with a pass rule — the rule, not module progress, says
    // when it's complete).
    if (pct < 100 && !(await courseRules(courseId))) {
      await db.from("lms_enrollments")
        .update({ status: "active", completed_at: null })
        .eq("id", enrollment.id)
        .eq("status", "completed")
    }
  } catch (err) {
    console.error("[completion] syncEnrollmentProgress failed", { studentId, courseId, err })
  }
}


// ── EM-6 / EM-7 notifications ──────────────────────────────────
// Both go through sendRuleEmail, so the program's own switches, the master
// switch, test mode and the log all apply exactly as they do for a reminder.

async function notifyCourseCompleted(studentId: string, courseId: string, courseTitle: string, programId: string | null) {
  try {
    const [{ data: student }, { data: program }] = await Promise.all([
      db.from("lms_students").select("name, email").eq("id", studentId).single(),
      programId
        ? db.from("lms_programs").select("name").eq("id", programId).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ])
    if (!student) return

    // Where they are in the program, for the "3 of 5 courses" line.
    let done: number | null = null, total: number | null = null
    if (programId) {
      const { data: rows } = await db.from("lms_enrollments")
        .select("status").eq("student_id", studentId).eq("program_id", programId).neq("status", "dropped")
      total = rows?.length ?? null
      done = (rows ?? []).filter((r: any) => r.status === "completed").length
    }

    const t = buildCourseCompletedEmail({
      studentName: student.name, courseTitle,
      programName: (program as any)?.name ?? null, programId,
      completedAt: new Date().toISOString(),
      coursesDone: done, coursesTotal: total,
    })
    await sendRuleEmail({
      rule: "course_completed", to: student.email, studentId, courseId, programId,
      programSettings: await programEmailOverrides(programId), ...t,
    })
  } catch (err) {
    console.error("[email] course completed notification failed", { studentId, courseId, err })
  }
}

/** EM-7 for a provider's certificate (external course): sent once its document
 *  is uploaded and it is released and visible to the participant. */
export async function notifyProviderCertificate(certificateId: string) {
  try {
    const { data: c } = await db.from("lms_certificates")
      .select("id, student_id, course_id, enrollment_id, issuer, pdf_url, released_at, revoked_at, visible_to_student, issued_at, verification_code, lms_service_providers(name), lms_courses(title, delivery_mode)")
      .eq("id", certificateId).maybeSingle()
    const cert = c as any
    if (!cert || cert.issuer !== "provider" || !cert.pdf_url || !cert.released_at || cert.revoked_at || !cert.visible_to_student) return
    if (cert.lms_courses?.delivery_mode !== "external") return
    const [{ data: student }, { data: enr }] = await Promise.all([
      db.from("lms_students").select("name, email").eq("id", cert.student_id).single(),
      db.from("lms_enrollments").select("program_id, lms_programs(name)").eq("id", cert.enrollment_id ?? "").maybeSingle(),
    ])
    if (!student) return
    const programId = (enr as any)?.program_id ?? null
    const t = buildCertificateEmail({
      studentName: (student as any).name, courseTitle: cert.lms_courses?.title ?? "your course",
      certificateCode: cert.verification_code, issuedAt: cert.issued_at,
      programName: (enr as any)?.lms_programs?.name ?? null, issuedBy: cert.lms_service_providers?.name ?? "the provider",
    })
    await sendRuleEmail({
      rule: "certificate", to: (student as any).email, studentId: cert.student_id, courseId: cert.course_id, programId,
      programSettings: await programEmailOverrides(programId), ...t,
    })
  } catch (err) {
    console.error("[email] provider certificate notification failed", { certificateId, err })
  }
}

/** EM-7 — a certificate became available to the student. */
export async function notifyCertificateIssued(studentId: string, courseId: string, enrollmentId?: string | null) {
  try {
    const { data: cert } = await db
      .from("lms_certificates")
      .select("verification_code, issued_at, released_at, source_title, enrollment_id")
      .eq("student_id", studentId).eq("course_id", courseId).eq("issuer", "ics")
      .order("issued_at", { ascending: false })
      .limit(1).maybeSingle()
    if (!cert || !(cert as any).released_at) return   // still held — EM-7 waits for release

    const [{ data: student }, { data: enr }] = await Promise.all([
      db.from("lms_students").select("name, email").eq("id", studentId).single(),
      db.from("lms_enrollments").select("program_id, lms_programs(name), lms_courses(title)")
        .eq("id", enrollmentId ?? (cert as any).enrollment_id ?? "").maybeSingle(),
    ])
    if (!student) return

    const programId = (enr as any)?.program_id ?? null
    const t = buildCertificateEmail({
      studentName: student.name,
      courseTitle: (enr as any)?.lms_courses?.title ?? (cert as any).source_title ?? "your course",
      certificateCode: (cert as any).verification_code,
      issuedAt: (cert as any).issued_at,
      programName: (enr as any)?.lms_programs?.name ?? null,
    })
    await sendRuleEmail({
      rule: "certificate", to: student.email, studentId, courseId, programId,
      programSettings: await programEmailOverrides(programId), ...t,
    })
  } catch (err) {
    console.error("[email] certificate notification failed", { studentId, courseId, err })
  }
}
