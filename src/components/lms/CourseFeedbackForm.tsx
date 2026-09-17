"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Star, Loader2, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

// One form for both surveys (FB-4 / FB-5):
//   kind="course"  → POST /api/lms/feedback          { course_id, … }
//   kind="program" → POST /api/lms/feedback/program  { program_id, … }

type Dim = { key: string; label: string; required?: boolean }

const COURSE_DIMS: Dim[] = [
  { key: "rating_overall",   label: "Overall", required: true },
  { key: "rating_content",   label: "Content" },
  { key: "rating_platform",  label: "Platform (learning portal)" },
  { key: "rating_pace",      label: "Pace" },
  { key: "rating_materials", label: "Materials" },
]
const PROGRAM_DIMS: Dim[] = [
  { key: "rating_overall",      label: "Overall satisfaction", required: true },
  { key: "rating_organisation", label: "Organisation" },
]
const INSTRUCTOR_DIM: Dim = { key: "rating_instructor", label: "Instructor(s)" }

function StarRow({ label, value, onChange, required }: { label: string; value: number; onChange: (v: number) => void; required?: boolean }) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-700 sm:w-48 shrink-0">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} of 5`}
            onClick={() => onChange(value === n && !required ? 0 : n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star className={cn("h-6 w-6 transition-colors", n <= (hover || value) ? "fill-amber-400 text-amber-400" : "text-slate-200 fill-slate-100")} />
          </button>
        ))}
        {value > 0 && <span className="ml-2 text-xs text-slate-500">{value}/5</span>}
      </div>
    </div>
  )
}

export default function CourseFeedbackForm({
  kind = "course", courseId, programId, isAnonymous, askInstructor = false, mandatory = false, reason = "completed", title,
}: {
  kind?: "course" | "program"
  courseId?: string
  programId?: string
  isAnonymous: boolean
  askInstructor?: boolean
  mandatory?: boolean
  reason?: "completed" | "attempts_exhausted"
  title?: string
}) {
  const router = useRouter()
  const dims = [...(kind === "program" ? PROGRAM_DIMS : COURSE_DIMS), ...(askInstructor ? [INSTRUCTOR_DIM] : [])]
  const [ratings, setRatings] = useState<Record<string, number>>(Object.fromEntries(dims.map(d => [d.key, 0])))
  const [recommend, setRecommend] = useState<"" | "yes" | "maybe" | "no">("")
  const [wentWell, setWentWell] = useState("")
  const [improve, setImprove] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ratings.rating_overall) { setError("Please give an overall rating."); return }
    setSubmitting(true); setError("")
    const res = await fetch(kind === "program" ? "/api/lms/feedback/program" : "/api/lms/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(kind === "program" ? { program_id: programId } : { course_id: courseId }),
        ...Object.fromEntries(Object.entries(ratings).map(([k, v]) => [k, v || null])),
        recommend: recommend || null,
        comment_went_well: wentWell,
        comment_improve: improve,
      }),
    })
    setSubmitting(false)
    if (res.ok) { setDone(true); router.refresh(); return }
    const d = await res.json().catch(() => ({}))
    setError(d.error ?? "Something went wrong. Please try again.")
  }

  if (done) {
    return (
      <div className="bg-white rounded-xl border border-emerald-200 px-6 py-8 text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        </div>
        <p className="font-semibold text-slate-800">Thank you for your feedback!</p>
        <p className="text-sm text-slate-500">Your answers have been recorded.</p>
      </div>
    )
  }

  const intro = kind === "program"
    ? "You've completed all your courses in this program. How was the program overall?"
    : reason === "attempts_exhausted"
      ? "You've used all your exam attempts. Your view of the course helps us improve it."
      : "How was your experience with this course?"

  return (
    <div id={kind === "program" ? "program-survey" : "feedback"} className="bg-white rounded-xl border border-slate-200 overflow-hidden scroll-mt-4">
      <div className="px-5 sm:px-6 py-4 border-b border-slate-100">
        <p className="font-semibold text-slate-800 flex items-center gap-2 flex-wrap">
          {title ?? (kind === "program" ? "Program survey" : "Share your feedback")}
          {mandatory && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Required</span>}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {intro}
          {isAnonymous
            ? <span className="ml-1 font-medium text-slate-600">Your answers are anonymous: your name is never shown with them.</span>
            : <span className="ml-1">Your name is shown to the training team with your answers.</span>}
        </p>
        {mandatory && (
          <p className="text-xs text-amber-700 mt-1">Your certificate can be downloaded once you&apos;ve submitted this feedback.</p>
        )}
      </div>

      <form onSubmit={submit} className="px-5 sm:px-6 py-4 space-y-5">
        <div>
          {dims.map(d => (
            <StarRow key={d.key} label={d.label} required={d.required} value={ratings[d.key] ?? 0}
              onChange={v => setRatings(prev => ({ ...prev, [d.key]: v }))} />
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-sm text-slate-700">Would you recommend this {kind === "program" ? "program" : "course"} to a colleague?</p>
          <div className="flex gap-2 flex-wrap">
            {([["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"]] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setRecommend(recommend === v ? "" : v)} aria-pressed={recommend === v}
                className={cn("px-4 py-1.5 rounded-lg border text-sm transition-colors",
                  recommend === v ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor={`${kind}-went-well`} className="text-sm text-slate-700 font-medium">What went well? <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea id={`${kind}-went-well`} value={wentWell} onChange={e => setWentWell(e.target.value)} rows={3} maxLength={2000}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 focus:border-[#1B4F8A]" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${kind}-improve`} className="text-sm text-slate-700 font-medium">What should we improve? <span className="font-normal text-slate-400">(optional)</span></label>
            <textarea id={`${kind}-improve`} value={improve} onChange={e => setImprove(e.target.value)} rows={3} maxLength={2000}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 focus:border-[#1B4F8A]" />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end">
          <button type="submit" disabled={submitting || !ratings.rating_overall}
            className={cn("flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors",
              ratings.rating_overall && !submitting ? "bg-[#1B4F8A] hover:bg-[#163f6e]" : "bg-slate-300 cursor-not-allowed")}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit feedback
          </button>
        </div>
      </form>
    </div>
  )
}
