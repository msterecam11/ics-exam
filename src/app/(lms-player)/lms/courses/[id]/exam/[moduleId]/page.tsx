export const dynamic = "force-dynamic"

import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import ExamClient from "./ExamClient"
import type { ExamQuestion, ExamSettings } from "@/components/lms/FinalExamPlayer"
import { sanitizeQuestionsForClient } from "@/lib/lms-exam-scoring"
import { getCurrentEnrollment, getExamRules, getCourseLock } from "@/lib/lms-enrollment"

export default async function StudentExamPage({
  params,
}: {
  params: Promise<{ id: string; moduleId: string }>
}) {
  const { id: courseId, moduleId } = await params

  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // Verify enrollment (the current one — attempts and rules are per enrollment)
  const enrollment = await getCurrentEnrollment(student.id, courseId)
  if (!enrollment || enrollment.access === "none") notFound()
  // Program not open yet / earlier course unfinished: back to the course page, which explains.
  if ((await getCourseLock(enrollment)).locked) redirect(`/lms/courses/${courseId}`)

  // Fetch module
  const { data: module } = await db
    .from("lms_modules")
    // lock_until_previous was not selected, so the server-side lock below never
    // ran and the exam could be opened by URL before the previous module was done.
    .select("id, title, module_type, questions, activity_settings, lock_until_previous")
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .single()

  if (!module || module.module_type !== "final_exam") notFound()

  // ── Server-side lock enforcement ────────────────────────────────────────
  // Mirror the course page: if this exam has lock_until_previous, the closest
  // previous mandatory module must be 100% complete. This runs server-side so a
  // student can't bypass the UI lock by opening the exam URL directly.
  if ((module as any).lock_until_previous) {
    const { data: allModules } = await db
      .from("lms_modules")
      .select("id, module_type, order_index, is_mandatory")
      .eq("course_id", courseId)
      .order("order_index", { ascending: true })

    const ordered = allModules ?? []
    const idx = ordered.findIndex((m: any) => m.id === moduleId)
    // Closest previous mandatory module
    const prev = idx > 0
      ? [...ordered.slice(0, idx)].reverse().find((m: any) => m.is_mandatory !== false)
      : undefined

    if (prev) {
      let prevDone = true
      if ((prev as any).module_type === "package") {
        const { data: pkgs } = await db.from("lms_packages").select("id").eq("module_id", (prev as any).id)
        const pkgId = (pkgs ?? [])[0]?.id
        if (pkgId) {
          const { data: pp } = await db
            .from("lms_package_progress")
            .select("status")
            .eq("enrollment_id", enrollment.id)
            .eq("package_id", pkgId)
            .maybeSingle()
          prevDone = pp?.status === "passed" || pp?.status === "completed"
        } else {
          prevDone = false
        }
      } else if ((prev as any).module_type === "final_exam") {
        const { data: att } = await db
          .from("lms_module_attempts")
          .select("passed")
          .eq("enrollment_id", enrollment.id)
          .eq("module_id", (prev as any).id)
          .eq("passed", true)
          .limit(1)
          .maybeSingle()
        prevDone = !!att
      }

      if (!prevDone) redirect(`/lms/courses/${courseId}`)
    }
  }

  // Fetch course (for header)
  const { data: course } = await db
    .from("lms_courses")
    .select("id, title, final_exam_pass_mark")
    .eq("id", courseId)
    .single()

  // Count previous attempts of this enrollment
  const { count: attemptCount } = await db
    .from("lms_module_attempts")
    .select("*", { count: "exact", head: true })
    .eq("module_id", moduleId)
    .eq("enrollment_id", enrollment.id)

  // Sanitized before it ever reaches the client — the real answer key stays
  // server-side and is only consulted at grading time (exam-attempt/route.ts).
  const questions = sanitizeQuestionsForClient((module.questions as ExamQuestion[] | null) ?? []) as ExamQuestion[]
  // Pass mark and attempts shown to the student are the ones grading uses
  // (the program's rules when the enrollment belongs to a program).
  const rules = await getExamRules(enrollment, course as any, module.activity_settings)
  const settings  = { ...((module.activity_settings as ExamSettings | null) ?? {}), pass_mark: rules.passMark, max_attempts: rules.maxAttempts } as ExamSettings
  const maxAttempts = rules.maxAttempts
  const usedAttempts = attemptCount ?? 0
  const attemptNo = usedAttempts + 1

  // No questions yet
  if (questions.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <p className="text-slate-500 text-sm">This exam has no questions yet.</p>
        <Link href={`/lms/courses/${courseId}`}
          className="text-[#1B4F8A] text-sm underline underline-offset-2">
          Back to course
        </Link>
      </div>
    )
  }

  // Program ended (review-only) or max attempts reached
  if (enrollment.access === "read_only" || usedAttempts >= maxAttempts) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <header className="bg-[#1B4F8A] text-white sticky top-0 z-30 shadow">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <Link href={`/lms/courses/${courseId}`} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Image src="/logo/logo-white.png" alt="ICS" width={90} height={24} className="object-contain" />
            <span className="text-white/40 text-sm hidden sm:block">/ {course?.title}</span>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <div className="bg-white rounded-2xl border border-slate-200 p-8 max-w-md w-full text-center space-y-3">
            <p className="text-4xl">🔒</p>
            <h2 className="text-lg font-bold text-slate-900">
              {enrollment.access === "read_only" ? "Exam Closed" : "No Attempts Remaining"}
            </h2>
            <p className="text-sm text-slate-500">
              {enrollment.access === "read_only"
                ? enrollment.accessNote
                : `You have used all ${maxAttempts} attempt${maxAttempts !== 1 ? "s" : ""} for this exam.`}
            </p>
            <Link href={`/lms/courses/${courseId}`}
              className="inline-block mt-2 text-sm text-[#1B4F8A] underline underline-offset-2">
              Back to course
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-[#1B4F8A] text-white sticky top-0 z-30 shadow">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/lms/courses/${courseId}`} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Image src="/logo/logo-white.png" alt="ICS" width={90} height={24} className="object-contain" />
          <span className="text-white/40 text-sm hidden sm:block">/ {course?.title} / {module.title}</span>
        </div>
      </header>

      <main className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <ExamClient
            moduleId={moduleId}
            courseId={courseId}
            examTitle={module.title}
            questions={questions}
            settings={settings}
            attemptNo={attemptNo}
          />
        </div>
      </main>
    </div>
  )
}
