import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ClipboardList, CheckCircle2, Clock, Star, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

export default async function AssignmentsPage() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // All enrolled courses
  const { data: enrollments } = await db
    .from("lms_enrollments")
    .select("course_id, lms_courses(id, title)")
    .eq("student_id", student.id)
    .in("status", ["active", "completed"])

  const courseIds = (enrollments ?? []).map((e: any) => e.course_id).filter(Boolean)

  // Assignment content items across enrolled courses
  const { data: assignmentItems } = courseIds.length
    ? await db
        .from("lms_content_items")
        .select("id, title, type, course_id, module_id")
        .in("course_id", courseIds)
        .eq("type", "assignment")
        .order("created_at", { ascending: true })
    : { data: [] }

  // Student submissions
  const { data: submissions } = await db
    .from("lms_assignment_submissions")
    .select("id, content_item_id, course_id, status, score, feedback, submitted_at, graded_at")
    .eq("student_id", student.id)

  const submissionMap = new Map<string, any>()
  for (const sub of submissions ?? []) {
    submissionMap.set(sub.content_item_id, sub)
  }

  const courseMap = new Map<string, string>()
  for (const e of enrollments ?? []) {
    courseMap.set(e.course_id, (e as any).lms_courses?.title ?? "")
  }

  const items = (assignmentItems ?? []).map((item: any) => ({
    ...item,
    courseTitle: courseMap.get(item.course_id) ?? "",
    submission:  submissionMap.get(item.id) ?? null,
  }))

  const pending  = items.filter(i => !i.submission)
  const submitted = items.filter(i => i.submission?.status === "submitted")
  const graded   = items.filter(i => i.submission?.status === "graded")

  function statusBadge(item: any) {
    if (!item.submission) return (
      <span className="text-xs bg-amber-100 text-amber-700 font-medium px-2 py-0.5 rounded-full">Pending</span>
    )
    if (item.submission.status === "submitted") return (
      <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">Submitted</span>
    )
    return (
      <span className="text-xs bg-emerald-100 text-emerald-700 font-medium px-2 py-0.5 rounded-full">Graded</span>
    )
  }

  function fmtDate(d: string | null) {
    if (!d) return null
    return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
  }

  if (items.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-20 text-slate-400">
          <ClipboardList className="h-10 w-10 mb-2 opacity-30" />
          <p className="text-sm">No assignments yet</p>
        </div>
      </div>
    )
  }

  function AssignmentRow({ item }: { item: any }) {
    return (
      <div className="flex items-start gap-3 px-4 py-3.5">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0",
          !item.submission ? "bg-amber-50"
            : item.submission.status === "graded" ? "bg-emerald-50"
            : "bg-blue-50"
        )}>
          {!item.submission
            ? <ClipboardList className="h-4 w-4 text-amber-500" />
            : item.submission.status === "graded"
              ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              : <Clock className="h-4 w-4 text-blue-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">{item.title}</p>
            {statusBadge(item)}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">{item.courseTitle}</p>
          {item.submission?.status === "graded" && (
            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              {item.submission.score != null && (
                <span className="flex items-center gap-1 text-xs text-amber-600 font-medium">
                  <Star className="h-3 w-3" /> {item.submission.score}/100
                </span>
              )}
              {item.submission.feedback && (
                <span className="text-xs text-slate-500 italic truncate max-w-[280px]">
                  "{item.submission.feedback}"
                </span>
              )}
              {item.submission.graded_at && (
                <span className="text-xs text-slate-400">Graded {fmtDate(item.submission.graded_at)}</span>
              )}
            </div>
          )}
          {item.submission?.status === "submitted" && item.submission.submitted_at && (
            <p className="text-xs text-slate-400 mt-0.5">Submitted {fmtDate(item.submission.submitted_at)}</p>
          )}
        </div>
        <Link
          href={`/lms/courses/${item.course_id}/content/${item.id}`}
          className="flex-shrink-0 text-xs font-medium text-[#1B4F8A] hover:underline flex items-center gap-1 mt-0.5"
        >
          View <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Pending",   value: pending.length,   color: "text-amber-600",   bg: "bg-amber-50"   },
          { label: "Submitted", value: submitted.length, color: "text-blue-600",    bg: "bg-blue-50"    },
          { label: "Graded",    value: graded.length,    color: "text-emerald-600", bg: "bg-emerald-50" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{s.label}</p>
            <p className={cn("text-2xl font-semibold mt-1", s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Pending</p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {pending.map(item => <AssignmentRow key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {/* Submitted */}
      {submitted.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Submitted · Awaiting Grade</p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {submitted.map(item => <AssignmentRow key={item.id} item={item} />)}
          </div>
        </div>
      )}

      {/* Graded */}
      {graded.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Graded</p>
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {graded.map(item => <AssignmentRow key={item.id} item={item} />)}
          </div>
        </div>
      )}
    </div>
  )
}
