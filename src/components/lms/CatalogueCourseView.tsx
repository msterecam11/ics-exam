"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Clock, BarChart3, Globe, Monitor, Layers, CheckCircle2, Hourglass,
  Loader2, Check, BookOpen, Send, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

// SP-15 — one course as a prospective student sees it. Module titles only:
// this is the shop window, not the course.

interface Detail {
  id: string; title: string; course_code: string | null
  blurb: string | null; description: string | null; overview_html: string | null
  thumbnail_url: string | null; language: string | null; delivery_mode: string
  level: string | null; duration_hours: number | null
  learning_outcomes: string[]
  category: { id: string; name: string } | null
  modules: { id: string; title: string; type: string }[]
  enrolled: boolean
  request: { id: string; status: string; reason: string | null } | null
}

const MODE_ICON: Record<string, any> = { online: Globe, onsite: Monitor, hybrid: Layers }

export default function CatalogueCourseView({ courseId }: { courseId: string }) {
  const router = useRouter()
  const [c, setC] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/lms/catalogue/${courseId}`)
    setC(res.ok ? await res.json() : null)
    setLoading(false)
  }, [courseId])
  useEffect(() => { load() }, [load])

  async function send() {
    setSending(true)
    const res = await fetch("/api/lms/catalogue/requests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ course_id: courseId, note: note.trim() || undefined }),
    })
    const data = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) { toast.error(data.error ?? "Could not send your request"); return }
    setAsking(false); setNote("")
    toast.success("Request sent — we'll come back to you")
    load()
  }

  if (loading) return <div className="flex items-center justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
  if (!c) return (
    <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
      <p className="text-sm font-medium text-slate-700">This course isn&apos;t available</p>
      <Link href="/lms/catalogue" className="text-sm text-[#1B4F8A] hover:underline mt-3 inline-block">Back to the catalogue</Link>
    </div>
  )

  const Icon = MODE_ICON[c.delivery_mode] ?? Globe
  const pending = c.request?.status === "pending"

  return (
    <div className="space-y-5 max-w-3xl">
      <button onClick={() => router.push("/lms/catalogue")} className="text-xs text-slate-500 hover:text-[#1B4F8A] flex items-center gap-1">
        <ArrowLeft className="h-3.5 w-3.5" /> Catalogue
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="h-40 bg-slate-100 relative">
          {c.thumbnail_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
          )}
        </div>
        <div className="p-6">
          {c.category && <p className="text-xs text-[#1B4F8A] font-medium">{c.category.name}</p>}
          <h1 className="text-2xl font-bold text-slate-900 mt-1">{c.title}</h1>
          {c.blurb && <p className="text-sm text-slate-600 mt-2 leading-relaxed">{c.blurb}</p>}

          <div className="flex items-center gap-4 mt-4 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1.5 capitalize"><Icon className="h-3.5 w-3.5" />{c.delivery_mode}</span>
            {c.duration_hours ? <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />{c.duration_hours} hours</span> : null}
            {c.level ? <span className="flex items-center gap-1.5 capitalize"><BarChart3 className="h-3.5 w-3.5" />{c.level}</span> : null}
            {c.language ? <span className="uppercase">{c.language}</span> : null}
            {c.course_code ? <span className="text-slate-400">{c.course_code}</span> : null}
          </div>

          {/* CV-5 — already on it, already asked, or free to ask */}
          <div className="mt-5">
            {c.enrolled ? (
              <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                You&apos;re already enrolled in this course.
                <Link href="/lms/courses" className="ml-auto text-[#1B4F8A] hover:underline shrink-0">Open it</Link>
              </div>
            ) : pending ? (
              <div className="flex items-center gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <Hourglass className="h-4 w-4 shrink-0" />
                You&apos;ve asked to join. We&apos;ll let you know.
                <Link href="/lms/catalogue/requests" className="ml-auto text-[#1B4F8A] hover:underline shrink-0">My requests</Link>
              </div>
            ) : asking ? (
              <div className="border border-slate-200 rounded-xl p-4 space-y-2">
                <p className="text-sm font-medium text-slate-800">Ask to join this course</p>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000}
                  placeholder="Anything you'd like us to know? (optional)"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" />
                <div className="flex gap-2">
                  <Button onClick={send} disabled={sending} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send request
                  </Button>
                  <Button variant="outline" onClick={() => setAsking(false)} disabled={sending} className="gap-1.5">
                    <X className="h-4 w-4" /> Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Button onClick={() => setAsking(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                  <Send className="h-4 w-4" /> Request this course
                </Button>
                {c.request?.status === "rejected" && c.request.reason && (
                  <p className="text-xs text-slate-500 mt-2">
                    A previous request wasn&apos;t approved: {c.request.reason}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {c.learning_outcomes.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900">What you&apos;ll learn</h2>
          <ul className="mt-3 space-y-2">
            {c.learning_outcomes.map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-700">
                <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />{o}
              </li>
            ))}
          </ul>
        </section>
      )}

      {c.description && c.description !== c.blurb && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900">About this course</h2>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed whitespace-pre-line">{c.description}</p>
        </section>
      )}

      {c.modules.length > 0 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-6">
          <h2 className="text-sm font-semibold text-slate-900">What&apos;s inside</h2>
          <ol className="mt-3 space-y-1.5">
            {c.modules.map((m, i) => (
              <li key={m.id} className="flex items-start gap-2.5 text-sm text-slate-700">
                <span className="text-xs text-slate-400 w-5 shrink-0 mt-0.5">{i + 1}.</span>
                <BookOpen className="h-4 w-4 text-slate-300 shrink-0 mt-0.5" />
                {m.title}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
