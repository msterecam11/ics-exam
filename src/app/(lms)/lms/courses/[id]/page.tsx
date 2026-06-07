import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft, CheckCircle2, PlayCircle, FileText, Image as ImageIcon,
  Link2, ListOrdered, HelpCircle, ClipboardList,
  Lock, Globe, Monitor, Layers, Clock, ChevronRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

// ── Icons & labels ────────────────────────────────────────────
const CONTENT_ICONS: Record<string, React.ElementType> = {
  video:      PlayCircle,
  ppt:        FileText,
  pdf:        FileText,
  text:       FileText,
  image:      ImageIcon,
  link:       Link2,
  steps:      ListOrdered,
  quiz:       HelpCircle,
  assignment: ClipboardList,
}

const CONTENT_COLORS: Record<string, string> = {
  video:      "text-purple-600 bg-purple-50",
  ppt:        "text-orange-600 bg-orange-50",
  pdf:        "text-red-600 bg-red-50",
  text:       "text-slate-600 bg-slate-100",
  image:      "text-pink-600 bg-pink-50",
  link:       "text-blue-600 bg-blue-50",
  steps:      "text-teal-600 bg-teal-50",
  quiz:       "text-amber-600 bg-amber-50",
  assignment: "text-green-600 bg-green-50",
}

const DELIVERY_ICONS: Record<string, React.ElementType> = {
  online: Globe, onsite: Monitor, hybrid: Layers,
}

function formatDuration(mins: number | null) {
  if (!mins) return null
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m > 0 ? m + "m" : ""}` : `${m}m`
}

// ── Page ──────────────────────────────────────────────────────
export default async function StudentCoursePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: courseId } = await params
  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // Verify enrollment
  const { data: enrollment } = await db
    .from("lms_enrollments")
    .select("id, status, enrolled_at, completed_at")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
    .single()

  if (!enrollment) notFound()

  // Fetch course
  const { data: course } = await db
    .from("lms_courses")
    .select("id, title, description, delivery_mode, thumbnail_url, progress_enforcement")
    .eq("id", courseId)
    .single()

  if (!course) notFound()

  // Fetch modules with content
  const { data: modules } = await db
    .from("lms_modules")
    .select(`
      id, title, description, delivery_type, order_index, estimated_duration,
      lms_content_items(id, title, type, order_index, is_mandatory, download_allowed, completion_rule)
    `)
    .eq("course_id", courseId)
    .order("order_index", { ascending: true })

  // Fetch student's progress for this course
  const { data: progressRows } = await db
    .from("lms_progress")
    .select("content_item_id, status, position")
    .eq("student_id", student.id)
    .eq("course_id", courseId)

  const progressMap = new Map(
    (progressRows ?? []).map((p: any) => [p.content_item_id, p])
  )

  // Compute module completion
  const mods = (modules ?? []).map((m: any) => {
    const items = (m.lms_content_items ?? [])
      .sort((a: any, b: any) => a.order_index - b.order_index)
    const mandatory = items.filter((i: any) => i.is_mandatory)
    const doneCount = mandatory.filter(
      (i: any) => progressMap.get(i.id)?.status === "completed"
    ).length
    const pct = mandatory.length > 0 ? Math.round(doneCount / mandatory.length * 100) : 0

    return { ...m, items, mandatory, doneCount, pct }
  })

  const totalItems    = mods.flatMap((m: any) => m.mandatory).length
  const totalDone     = mods.reduce((acc: number, m: any) => acc + m.doneCount, 0)
  const overallPct    = totalItems > 0 ? Math.round(totalDone / totalItems * 100) : 0

  const DeliveryIcon  = DELIVERY_ICONS[course.delivery_mode] ?? Globe

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top nav */}
      <header className="bg-[#1B4F8A] text-white sticky top-0 z-30 shadow">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/lms/dashboard"
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Image src="/logo/logo-white.png" alt="ICS" width={90} height={24} className="object-contain" />
          <span className="text-white/40 text-sm hidden sm:block">/ {course.title}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Course hero */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          {course.thumbnail_url && (
            <div className="h-36 bg-[#1B4F8A]/5 overflow-hidden">
              <Image
                src={course.thumbnail_url}
                alt={course.title}
                width={800}
                height={144}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-bold text-slate-900">{course.title}</h1>
                {course.description && (
                  <p className="text-slate-500 text-sm mt-1">{course.description}</p>
                )}
                <div className="flex gap-2 mt-3 flex-wrap">
                  <Badge variant="outline" className="text-xs gap-1">
                    <DeliveryIcon className="h-3 w-3" /> {course.delivery_mode}
                  </Badge>
                  {enrollment.status === "completed" && (
                    <Badge className="text-xs border-0 bg-emerald-100 text-emerald-700 gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Completed
                    </Badge>
                  )}
                </div>
              </div>
              {/* Overall progress ring */}
              <div className="text-center shrink-0">
                <div className="relative w-16 h-16">
                  <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                    <circle
                      cx="32" cy="32" r="26"
                      fill="none"
                      stroke={overallPct >= 100 ? "#22c55e" : "#1B4F8A"}
                      strokeWidth="5"
                      strokeDasharray={`${(overallPct / 100) * 163.4} 163.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-slate-800">
                    {overallPct}%
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{totalDone}/{totalItems} done</p>
              </div>
            </div>
          </div>
        </div>

        {/* Modules */}
        <div className="space-y-3">
          {mods.map((mod: any, mi: number) => (
            <div key={mod.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {/* Module header */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                  mod.pct >= 100 ? "bg-emerald-100 text-emerald-600" : "bg-[#1B4F8A]/10 text-[#1B4F8A]"
                )}>
                  {mod.pct >= 100 ? <CheckCircle2 className="h-4 w-4" /> : mi + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-slate-900">{mod.title}</p>
                  {mod.description && (
                    <p className="text-xs text-slate-500 mt-0.5">{mod.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0 text-xs text-slate-500">
                  {mod.estimated_duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDuration(mod.estimated_duration)}
                    </span>
                  )}
                  <span>{mod.doneCount}/{mod.mandatory.length} done</span>
                </div>
              </div>

              {/* Module progress bar */}
              {mod.mandatory.length > 0 && (
                <div className="h-1 bg-slate-100">
                  <div
                    className="h-full bg-[#1B4F8A] transition-all"
                    style={{ width: `${mod.pct}%` }}
                  />
                </div>
              )}

              {/* Content items */}
              <div className="divide-y divide-slate-50">
                {mod.items.map((item: any, ci: number) => {
                  const prog  = progressMap.get(item.id)
                  const done  = prog?.status === "completed"
                  const inProg = prog?.status === "in_progress"
                  const Icon  = CONTENT_ICONS[item.type] ?? FileText
                  const color = CONTENT_COLORS[item.type] ?? "text-slate-600 bg-slate-100"

                  // Enforce sequential: lock if previous mandatory not complete
                  let locked = false
                  if (course.progress_enforcement && ci > 0) {
                    const prevMandatory = mod.items.slice(0, ci).filter((i: any) => i.is_mandatory)
                    locked = prevMandatory.some(
                      (i: any) => progressMap.get(i.id)?.status !== "completed"
                    )
                  }

                  return (
                    <Link
                      key={item.id}
                      href={locked ? "#" : `/lms/courses/${courseId}/content/${item.id}`}
                      className={cn(
                        "flex items-center gap-4 px-5 py-3.5 transition-colors",
                        locked
                          ? "opacity-50 cursor-not-allowed"
                          : "hover:bg-slate-50 cursor-pointer"
                      )}
                      onClick={e => locked && e.preventDefault()}
                    >
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", color)}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          "text-sm font-medium",
                          done ? "text-slate-400 line-through" : "text-slate-800"
                        )}>
                          {item.title}
                        </p>
                        <p className="text-xs text-slate-400 uppercase mt-0.5">{item.type}
                          {inProg && <span className="ml-2 text-blue-500 normal-case">In progress</span>}
                          {!item.is_mandatory && <span className="ml-2 text-slate-300">Optional</span>}
                        </p>
                      </div>
                      <div className="shrink-0">
                        {locked ? (
                          <Lock className="h-4 w-4 text-slate-300" />
                        ) : done ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
