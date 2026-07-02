import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft } from "lucide-react"
import AssignmentClient, { type RubricCriterion, type Submission } from "./AssignmentClient"

export default async function AssignmentPage({
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
    .select("id")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
    .single()
  if (!enrollment) notFound()

  // Fetch module
  const { data: module } = await db
    .from("lms_modules")
    .select(`
      id, title, description, module_type,
      assignment_brief_html, assignment_rubric,
      assignment_submission_types, assignment_due_date, assignment_max_attempts
    `)
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .single()

  if (!module || module.module_type !== "assignment") notFound()

  // Fetch course for header
  const { data: course } = await db
    .from("lms_courses")
    .select("id, title")
    .eq("id", courseId)
    .single()

  // Fetch student's most recent submission
  const { data: attempts } = await db
    .from("lms_module_attempts")
    .select("id, attempt_no, status, score, max_score, passed, answers, ai_feedback, submitted_at")
    .eq("module_id", moduleId)
    .eq("student_id", student.id)
    .order("attempt_no", { ascending: false })
    .limit(1)

  const existing = (attempts?.[0] ?? null) as Submission | null

  const rubric           = (module.assignment_rubric as RubricCriterion[] | null) ?? []
  const submissionTypes  = (module.assignment_submission_types as string[] | null) ?? ["pdf", "docx"]
  const maxAttempts      = (module.assignment_max_attempts as number | null) ?? 99

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-[#1B4F8A] text-white sticky top-0 z-30 shadow">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/lms/courses/${courseId}`}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Image src="/logo/logo-white.png" alt="ICS" width={90} height={24} className="object-contain" />
          <span className="text-white/60 text-sm truncate">
            / {course?.title} / {module.title}
          </span>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Title */}
          <div className="mb-8">
            <div className="flex items-center gap-2 text-xs text-green-600 font-semibold uppercase tracking-wider mb-1">
              📤 Assignment
            </div>
            <h1 className="text-2xl font-bold text-slate-900">{module.title}</h1>
            {module.description && (
              <p className="text-slate-500 mt-1 text-sm">{module.description}</p>
            )}
          </div>

          <AssignmentClient
            moduleId={moduleId}
            courseId={courseId}
            briefHtml={module.assignment_brief_html as string | null}
            rubric={rubric}
            submissionTypes={submissionTypes}
            dueDate={module.assignment_due_date as string | null}
            maxAttempts={maxAttempts}
            existing={existing}
          />

          <div className="mt-10 pt-6 border-t border-slate-200">
            <Link href={`/lms/courses/${courseId}`}
              className="inline-flex items-center gap-2 text-sm text-[#1B4F8A] hover:underline">
              <ArrowLeft className="h-4 w-4" /> Back to course
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

