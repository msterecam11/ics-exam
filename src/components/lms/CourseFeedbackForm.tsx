"use client"

import { useState } from "react"
import { Star, Loader2, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

const DIMENSIONS = [
  { key: "rating_overall",   label: "Overall",          required: true  },
  { key: "rating_content",   label: "Content",          required: false },
  { key: "rating_platform",  label: "Platform (LMS)",   required: false },
  { key: "rating_pace",      label: "Pace",             required: false },
  { key: "rating_materials", label: "Materials",        required: false },
] as const

type DimKey = (typeof DIMENSIONS)[number]["key"]

function StarRow({ label, value, onChange, required }: {
  label: string
  value: number
  onChange: (v: number) => void
  required: boolean
}) {
  const [hover, setHover] = useState(0)
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-700 w-36 shrink-0">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      <div className="flex items-center gap-1">
        {[1,2,3,4,5].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star className={cn(
              "h-6 w-6 transition-colors",
              n <= (hover || value)
                ? "fill-amber-400 text-amber-400"
                : "text-slate-200 fill-slate-100"
            )} />
          </button>
        ))}
        {value > 0 && (
          <span className="ml-2 text-xs text-slate-500">{value}/5</span>
        )}
      </div>
    </div>
  )
}

export default function CourseFeedbackForm({
  courseId,
  isAnonymous,
}: {
  courseId: string
  isAnonymous: boolean
}) {
  const [ratings, setRatings] = useState<Record<DimKey, number>>({
    rating_overall:   0,
    rating_content:   0,
    rating_platform:  0,
    rating_pace:      0,
    rating_materials: 0,
  })
  const [comments, setComments] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ratings.rating_overall) {
      setError("Please rate your overall experience.")
      return
    }
    setSubmitting(true)
    setError("")
    const res = await fetch("/api/lms/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course_id: courseId,
        ...ratings,
        comments,
      }),
    })
    setSubmitting(false)
    if (res.ok) {
      setDone(true)
    } else {
      const d = await res.json().catch(() => ({}))
      setError(d.error ?? "Something went wrong. Please try again.")
    }
  }

  if (done) {
    return (
      <div className="bg-white rounded-xl border border-emerald-200 px-6 py-8 text-center space-y-2">
        <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        </div>
        <p className="font-semibold text-slate-800">Thank you for your feedback!</p>
        <p className="text-sm text-slate-500">Your response has been recorded.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="font-semibold text-slate-800">Share your feedback</p>
          <p className="text-xs text-slate-500 mt-0.5">
            How was your experience with this course?
            {isAnonymous && <span className="ml-1 italic">Responses are anonymous.</span>}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="px-6 py-4 space-y-4">
        <div>
          {DIMENSIONS.map(d => (
            <StarRow
              key={d.key}
              label={d.label}
              value={ratings[d.key]}
              onChange={v => setRatings(prev => ({ ...prev, [d.key]: v }))}
              required={d.required}
            />
          ))}
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-slate-700 font-medium">
            Comments <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            value={comments}
            onChange={e => setComments(e.target.value)}
            rows={3}
            placeholder="What did you enjoy? What could be improved?"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 focus:border-[#1B4F8A]"
          />
        </div>

        {error && (
          <p className="text-sm text-red-500">{error}</p>
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !ratings.rating_overall}
            className={cn(
              "flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium text-white transition-colors",
              ratings.rating_overall && !submitting
                ? "bg-[#1B4F8A] hover:bg-[#163f6e]"
                : "bg-slate-300 cursor-not-allowed"
            )}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit Feedback
          </button>
        </div>
      </form>
    </div>
  )
}
