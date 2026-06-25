export const dynamic = "force-dynamic"

import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import ExamClient from "./ExamClient"
import type { ExamQuestion, ExamSettings } from "@/components/lms/FinalExamPlayer"

export default async function StudentExamPage({
  params,
}: {
  params: Promise<{ id: string; moduleId: string }>
}) {
  const { id: courseId, moduleId } = await params

  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // Verify enrollment
  const { data: enrollment } = await db
    .from("lms_enrollments")
    .select("id, status")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
    .single()
  if (!enrollment) notFound()

  // Fetch module
  const { data: module } = await db
    .from("lms_modules")
    .select("id, title, module_type, questions, activity_settings")
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .single()

  if (!module || module.module_type !== "final_exam") notFound()

  // Fetch course (for header)
  const { data: course } = await db
    .from("lms_courses")
    .select("id, title")
    .eq("id", courseId)
    .single()

  // Count previous attempts by this student
  const { count: attemptCount } = await db
    .from("lms_module_attempts")
    .select("*", { count: "exact", head: true })
    .eq("module_id", moduleId)
    .eq("student_id", student.id)

  const questions = (module.questions as ExamQuestion[] | null) ?? []
  const settings  = (module.activity_settings as ExamSettings | null)
  const maxAttempts = settings?.max_attempts ?? 3
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

  // Max attempts reached
  if (usedAttempts >= maxAttempts) {
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
            <h2 className="text-lg font-bold text-slate-900">No Attempts Remaining</h2>
            <p className="text-sm text-slate-500">
              You have used all {maxAttempts} attempt{maxAttempts !== 1 ? "s" : ""} for this exam.
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
