import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect } from "next/navigation"
import Link from "next/link"
import { ENROLLMENT_ACCESS_COLUMNS, currentVisible } from "@/lib/lms-enrollment"
import { certificateNeedsFeedback } from "@/lib/lms-feedback"
import { Award, Download, CalendarDays, BookOpen, Lock } from "lucide-react"

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  })
}

export default async function CertificatesPage() {
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // Earned certificates — released AND held.
  //
  // Held certificates used to be filtered out entirely. That left a student who
  // had finished a course falling through every list on this page: not in
  // "earned" (not released yet) and not in "In Progress" (their enrolment is
  // `completed`, and that list only shows `active`). They were shown "No
  // certificates yet — complete a course to earn your first certificate" — after
  // receiving a "Course Complete" email. The certificate exists and they earned
  // it; only the hand-over is pending, so say that instead of denying it.
  //
  // Revoked certificates ARE still excluded — that is a withdrawal, not a delay.
  const { data: certs } = await db
    .from("lms_certificates")
    // A course retaken in a later program has one certificate per enrollment;
    // the program name tells them apart.
    .select(`id, course_id, enrollment_id, verification_code, type, source_title, issued_at, released_at,
             issuer, pdf_url, expires_at, lms_service_providers(name),
             lms_courses(title), lms_enrollments(lms_programs(id, name, is_individual))`)
    .eq("student_id", student.id)
    .is("revoked_at", null)
    // An internal record — a partner's certificate we hold but they hand over —
    // is not the student's to see here.
    .eq("visible_to_student", true)
    .order("issued_at", { ascending: false })

  // In-progress enrollments (active, not yet completed)
  const { data: activeRows } = await db
    .from("lms_enrollments")
    .select(`id, course_id, status, enrolled_at, progress_pct, ${ENROLLMENT_ACCESS_COLUMNS}, lms_courses(id, title)`)
    .eq("student_id", student.id)
    .eq("status", "active")
    .order("enrolled_at", { ascending: false })
  const activeEnrollments = currentVisible(activeRows as any[])

  // FB-3: mandatory feedback not given yet → certificate can't be downloaded.
  const needsFeedback = new Set<string>()
  for (const c of (certs ?? []) as any[]) if (c.enrollment_id && (await certificateNeedsFeedback(c.enrollment_id))) needsFeedback.add(c.id)

  const certificates = (certs ?? []).map((c: any) => ({
    id:                c.id,
    course_id:         c.course_id,
    verification_code: c.verification_code,
    type:              c.type ?? "course",
    title:             c.type === "course"
                         ? (c.lms_courses?.title ?? "Course")
                         : (c.source_title ?? "Certificate"),
    issued_at:         c.issued_at,
    released:          !!c.released_at,
    needsFeedback:     needsFeedback.has(c.id),
    issuedBy:          c.issuer === "provider" ? (c.lms_service_providers?.name ?? "Our training partner") : "ICS Aviation Institute",
    fileUrl:           c.pdf_url ?? null,
    expiresAt:         c.expires_at ?? null,
    program:           c.lms_enrollments?.lms_programs && !c.lms_enrollments.lms_programs.is_individual
                         ? { id: c.lms_enrollments.lms_programs.id as string, name: c.lms_enrollments.lms_programs.name as string }
                         : null,
  }))

  // Grouped by program (SP): a program's certificates together, labelled with
  // the year(s) they were issued; courses taken on their own come last.
  const groups: { key: string; title: string; years: string; items: typeof certificates }[] = []
  for (const cert of certificates) {
    const key = cert.program?.id ?? "individual"
    let g = groups.find(x => x.key === key)
    if (!g) { g = { key, title: cert.program?.name ?? "Individual courses", years: "", items: [] }; groups.push(g) }
    g.items.push(cert)
  }
  for (const g of groups) {
    const ys = [...new Set(g.items.map(c => new Date(c.issued_at).getUTCFullYear()))].sort()
    g.years = ys.length > 1 ? `${ys[0]}–${ys[ys.length - 1]}` : String(ys[0] ?? "")
  }
  groups.sort((a, b) => (a.key === "individual" ? 1 : 0) - (b.key === "individual" ? 1 : 0))

  const pendingCount = certificates.filter(c => !c.released).length

  const inProgress = (activeEnrollments ?? []) as any[]

  return (
    <div className="p-4 sm:p-6 space-y-8">

      {/* Earned certificates */}
      <div>
        <div className="flex items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">My Certificates</h1>
            {/* Was "Issued automatically once you complete a course", which is
                only true when the course auto-releases. */}
            <p className="text-slate-500 text-sm mt-1">
              Issued when you complete a course.
              {pendingCount > 0 && " Some are still being prepared."}
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
          <div className="space-y-6">
          {groups.map(g => (
          <section key={g.key}>
            <div className="flex items-center gap-2 mb-3">
              {g.key === "individual"
                ? <h2 className="text-sm font-semibold text-slate-700">{g.title}</h2>
                : <Link href={`/lms/programs/${g.key}`} className="text-sm font-semibold text-slate-700 hover:text-[#1B4F8A]">{g.title}</Link>}
              {g.years && <span className="text-xs text-slate-400">· {g.years}</span>}
              <span className="text-xs text-slate-400 ml-auto">{g.items.length}</span>
            </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {g.items.map(cert => (
              <div
                key={cert.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col"
              >
                {/* Top accent bar — muted while the certificate is still held,
                    so a pending one reads as distinct at a glance. */}
                <div className={cert.released
                  ? "h-2 bg-gradient-to-r from-[#1B4F8A] to-[#2563eb]"
                  : "h-2 bg-slate-200"} />

                <div className="p-5 flex flex-col gap-4 flex-1">
                  {/* Icon + course title */}
                  <div className="flex items-start gap-3">
                    <div className={cert.released
                      ? "w-10 h-10 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0"
                      : "w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0"}>
                      <Award className={cert.released ? "h-5 w-5 text-[#1B4F8A]" : "h-5 w-5 text-slate-400"} />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm leading-snug line-clamp-2">
                        {cert.title}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5">{cert.issuedBy}</p>
                    </div>
                  </div>

                  {/* Pending-release notice. States plainly that the certificate
                      is already earned and recorded — the delay is on our side. */}
                  {!cert.released && (
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-amber-800">Awaiting release</p>
                        <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5">
                          You&apos;ve earned this certificate and it has been recorded. We&apos;ll let
                          you know as soon as it&apos;s ready to download.
                        </p>
                      </div>
                    </div>
                  )}

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

                  {cert.released && cert.needsFeedback && (
                    <Link href={`/lms/courses/${cert.course_id}#feedback`}
                      className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 hover:bg-amber-100 transition-colors">
                      <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-amber-800">Complete the feedback to download</span>
                        <span className="block text-[11px] text-amber-700 mt-0.5">A short feedback form for this course is required first.</span>
                      </span>
                    </Link>
                  )}

                  {/* Download button */}
                  <div className="mt-auto">
                    {cert.fileUrl && cert.released && !cert.needsFeedback ? (
                      <a
                        href={`/api/lms/certificates/${cert.id}/file`}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#1B4F8A] text-white hover:bg-[#163f6f] transition-colors"
                      >
                        <Download className="h-4 w-4" /> Download PDF
                      </a>
                    ) : (
                      <button
                        disabled
                        title={cert.needsFeedback
                          ? "Complete the course feedback first"
                          : cert.released
                          ? "The certificate document is being prepared"
                          : "This certificate has not been released yet"}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-100 text-slate-400 cursor-not-allowed select-none"
                      >
                        <Download className="h-4 w-4" />
                        Download PDF
                        <span className="ml-1 text-[10px] font-normal bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full">
                          {cert.released ? "Coming soon" : "Not yet available"}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          </section>
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
                      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#1B4F8A] rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400">{pct}% complete</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-300 shrink-0 hidden sm:inline">Complete to unlock</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
