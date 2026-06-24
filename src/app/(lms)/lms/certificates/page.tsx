import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import { Award, Download, CalendarDays, BookOpen, Lock } from "lucide-react"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })
}

export default async function CertificatesPage() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // Earned certificates from lms_certificates table
  const { data: certs } = await db
    .from("lms_certificates")
    .select("id, course_id, verification_code, type, source_title, issued_at, lms_courses(title)")
    .eq("student_id", student.id)
    .order("issued_at", { ascending: false })

  // In-progress enrollments (active, not yet completed)
  const { data: activeEnrollments } = await db
    .from("lms_enrollments")
    .select("id, progress_pct, lms_courses(id, title)")
    .eq("student_id", student.id)
    .eq("status", "active")
    .order("enrolled_at", { ascending: false })

  const certificates = (certs ?? []).map((c: any) => ({
    id:                c.id,
    course_id:         c.course_id,
    verification_code: c.verification_code,
    type:              c.type ?? "course",
    title:             c.type === "course"
                         ? (c.lms_courses?.title ?? "Course")
                         : (c.source_title ?? "Certificate"),
    issued_at:         c.issued_at,
  }))

  const inProgress = (activeEnrollments ?? []) as any[]

  return (
    <div className="p-6 space-y-8">

      {/* Earned certificates */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Certificates</h1>
            <p className="text-slate-500 text-sm mt-1">
              Issued automatically once you complete a course.
            </p>
          </div>
          <span className="text-sm text-slate-400">
            {certificates.length} earned
          </span>
        </div>

        {certificates.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 flex flex-col items-center justify-center py-20 gap-4">
            <div className="w-16 h-16 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center">
              <Award className="h-8 w-8 text-[#1B4F8A]" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-slate-700">No certificates yet</p>
              <p className="text-sm text-slate-400 mt-1">Complete a course to earn your first certificate.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {certificates.map(cert => (
              <div
                key={cert.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col"
              >
                {/* Top accent bar */}
                <div className="h-2 bg-gradient-to-r from-[#1B4F8A] to-[#2563eb]" />

                <div className="p-5 flex flex-col gap-4 flex-1">
                  {/* Icon + course title */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
                      <Award className="h-5 w-5 text-[#1B4F8A]" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">
                        {cert.title}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">ICS Aviation Institute</p>
                    </div>
                  </div>

                  {/* Certificate details */}
                  <div className="space-y-2 bg-slate-50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <BookOpen className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="text-[11px] text-slate-400">Certificate No.</span>
                      <span className="font-mono font-semibold text-slate-700 tracking-wide">
                        {cert.verification_code}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>Issued {formatDate(cert.issued_at)}</span>
                    </div>
                  </div>

                  {/* Download button */}
                  <div className="mt-auto">
                    <button
                      disabled
                      title="Certificate template is being prepared by our team"
                      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-400 cursor-not-allowed select-none"
                    >
                      <Download className="h-4 w-4" />
                      Download PDF
                      <span className="ml-1 text-[10px] font-normal bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
                        Coming soon
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* In-progress courses */}
      {inProgress.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">In Progress</h2>
          <div className="space-y-2">
            {inProgress.map((e: any) => {
              const course = e.lms_courses
              const pct = e.progress_pct ?? 0
              return (
                <div
                  key={e.id}
                  className="bg-white rounded-xl border border-slate-200 px-4 py-3 flex items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Lock className="h-4 w-4 text-slate-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{course?.title}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden max-w-[200px]">
                        <div
                          className="h-full bg-[#1B4F8A] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{pct}% complete</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-300 shrink-0">Complete to unlock</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
