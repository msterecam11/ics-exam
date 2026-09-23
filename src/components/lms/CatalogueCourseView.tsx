"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Clock, BarChart3, Globe, Monitor, Layers, CheckCircle2, Hourglass,
  Loader2, Check, BookOpen, Send, X, Users, Award, Languages, ListChecks, CalendarDays, MapPin,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import CourseCover from "@/components/lms/CourseCover"

// SP-15 — one course as a prospective student sees it. Module titles only:
// this is the shop window, not the course.

interface Detail {
  id: string; title: string; course_code: string | null
  blurb: string | null; description: string | null; overview_html: string | null
  thumbnail_url: string | null; language: string | null; delivery_mode: string
  level: string | null; duration_hours: number | null
  audience?: string | null
  certificate?: boolean
  learning_outcomes: string[]
  prerequisites?: string[]
  category: { id: string; name: string } | null
  provider?: { name: string; logo_url: string | null } | null
  modules: { id: string; title: string; type: string }[]
  enrolled: boolean
  request: { id: string; status: string; reason: string | null } | null
  /** Onsite / hybrid: upcoming dates (confirmed groups) they can ask for. */
  groups?: {
    id: string; dates: string; city: string | null; venue_name: string | null
    daily_start: string | null; daily_end: string | null; provider: string | null
    seats_left: number | null; full: boolean
  }[]
}

const MODE_ICON: Record<string, any> = { online: Globe, onsite: Monitor, hybrid: Layers }
const MODE_LABEL: Record<string, string> = { online: "Online", onsite: "Onsite", hybrid: "Online + onsite" }

export default function CatalogueCourseView({ courseId }: { courseId: string }) {
  const router = useRouter()
  const [c, setC] = useState<Detail | null>(null)
  const [loading, setLoading] = useState(true)
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState("")
  const [sending, setSending] = useState(false)
  const [groupId, setGroupId] = useState<string | null>(null)

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
      body: JSON.stringify({ course_id: courseId, note: note.trim() || undefined, group_id: groupId ?? undefined }),
    })
    const data = await res.json().catch(() => ({}))
    setSending(false)
    if (!res.ok) { toast.error(data.error ?? "Could not send your request"); return }
    setAsking(false); setNote(""); setGroupId(null)
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

  // The facts a student wants before reading anything else.
  const facts = [
    { icon: Icon, label: "Delivery", value: MODE_LABEL[c.delivery_mode] ?? c.delivery_mode },
    c.duration_hours ? { icon: Clock, label: "Duration", value: `${c.duration_hours} hours` } : null,
    c.modules.length ? { icon: ListChecks, label: "Modules", value: `${c.modules.length}` } : null,
    c.level ? { icon: BarChart3, label: "Level", value: c.level } : null,
    c.language ? { icon: Languages, label: "Language", value: c.language.toUpperCase() } : null,
    c.certificate !== false ? { icon: Award, label: "On completion", value: "Certificate" } : null,
  ].filter(Boolean) as { icon: any; label: string; value: string }[]

  return (
    <div className="space-y-5">
      <button onClick={() => router.push("/lms/catalogue")} className="text-xs text-slate-500 hover:text-[#1B4F8A] flex items-center gap-1">
        <ArrowLeft className="h-3.5 w-3.5" /> Catalogue
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* ── Left: the course itself ───────────────────────────────── */}
        <div className="space-y-5 min-w-0">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <CourseCover title={c.title} code={c.course_code} imageUrl={c.thumbnail_url} className="h-44" />
            <div className="p-6">
              <div className="flex items-center gap-2 flex-wrap">
                {c.category && <p className="text-xs text-[#1B4F8A] font-medium">{c.category.name}</p>}
                {c.provider && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <span className="text-slate-300">·</span>
                    {c.provider.logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.provider.logo_url} alt="" className="h-4 w-auto object-contain" />
                    )}
                    Delivered by {c.provider.name}
                  </p>
                )}
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">{c.title}</h1>
              {c.blurb && <p className="text-sm text-slate-600 mt-2 leading-relaxed">{c.blurb}</p>}

              {c.audience && (
                <p className="mt-4 flex items-start gap-2 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                  <Users className="h-4 w-4 text-[#1B4F8A] shrink-0 mt-0.5" />
                  <span><span className="font-medium text-slate-800">Who this course is for: </span>{c.audience}</span>
                </p>
              )}

              {/* Key facts — the questions everyone asks first. */}
              <dl className="mt-5 flex flex-wrap border border-slate-100 rounded-xl overflow-hidden divide-x divide-slate-100">
                {facts.map(f => (
                  <div key={f.label} className="bg-white px-4 py-3 grow basis-40">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400 flex items-center gap-1.5">
                      <f.icon className="h-3 w-3" />{f.label}
                    </dt>
                    <dd className="text-sm font-medium text-slate-800 capitalize mt-0.5">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          {c.learning_outcomes.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-sm font-semibold text-slate-900">What you&apos;ll learn</h2>
              <ul className="mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-2">
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

          {(c.prerequisites ?? []).length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="text-sm font-semibold text-slate-900">Prerequisites</h2>
              <ul className="mt-3 space-y-2">
                {(c.prerequisites ?? []).map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700"><span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-2" />{p}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* ── Right: how to get on it, and what happens after ───────── */}
        <aside className="lg:sticky lg:top-4 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          {/* Onsite / hybrid: the upcoming dates — pick one when asking to join */}
          {c.delivery_mode !== "online" && !c.enrolled && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5" /> Upcoming dates</p>
              {!c.groups?.length ? (
                <p className="text-sm text-slate-500">No dates are scheduled yet — ask to join and we&apos;ll tell you when the next one is.</p>
              ) : c.groups.map(g => {
                const chosen = groupId === g.id
                return (
                  <button key={g.id} type="button" disabled={g.full || pending}
                    onClick={() => { setGroupId(chosen ? null : g.id); if (!chosen) setAsking(true) }}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 transition-colors ${chosen ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200 hover:border-[#1B4F8A]/40"} ${g.full ? "opacity-50 cursor-not-allowed" : ""}`}>
                    <p className="text-sm font-semibold text-slate-800 flex items-center justify-between gap-2">
                      {g.dates}
                      {chosen && <Check className="h-4 w-4 text-[#1B4F8A]" />}
                    </p>
                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                      <MapPin className="h-3 w-3" />{[g.venue_name, g.city].filter(Boolean).join(", ") || "Venue to be confirmed"}
                      {g.daily_start && <span className="ml-1">· {g.daily_start.slice(0, 5)}–{g.daily_end?.slice(0, 5)}</span>}
                    </p>
                    <p className={`text-[11px] mt-0.5 ${g.full ? "text-red-600" : "text-slate-400"}`}>
                      {g.full ? "Full" : g.seats_left !== null ? `${g.seats_left} seat${g.seats_left === 1 ? "" : "s"} left` : "Places available"}
                      {g.provider ? ` · ${g.provider}` : ""}
                    </p>
                  </button>
                )
              })}
            </div>
          )}

          {/* CV-5 — already on it, already asked, or free to ask */}
          {c.enrolled ? (
            <>
              <div className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                You&apos;re already enrolled in this course.
              </div>
              <Link href="/lms/courses" className="block text-center text-sm text-[#1B4F8A] hover:underline">Open it</Link>
            </>
          ) : pending ? (
            <>
              <div className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
                <Hourglass className="h-4 w-4 shrink-0 mt-0.5" />
                You&apos;ve asked to join. We&apos;ll let you know.
              </div>
              <Link href="/lms/catalogue/requests" className="block text-center text-sm text-[#1B4F8A] hover:underline">My requests</Link>
            </>
          ) : asking ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-800">Ask to join this course</p>
              {c.delivery_mode !== "online" && !!c.groups?.length && (
                <p className="text-xs text-slate-500">
                  {groupId ? <>For <b className="text-slate-700">{c.groups.find(g => g.id === groupId)?.dates}</b></> : "No date chosen — pick one above, or send without and we'll suggest one."}
                </p>
              )}
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} maxLength={1000}
                placeholder="Anything you'd like us to know? (optional)"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm resize-none" />
              <div className="flex gap-2">
                <Button onClick={send} disabled={sending} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2 flex-1">
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send request
                </Button>
                <Button variant="outline" onClick={() => setAsking(false)} disabled={sending} className="gap-1.5">
                  <X className="h-4 w-4" /> Cancel
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Button onClick={() => setAsking(true)} className="w-full bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                <Send className="h-4 w-4" /> Request this course
              </Button>
              {c.request?.status === "rejected" && c.request.reason && (
                <p className="text-xs text-slate-500">A previous request wasn&apos;t approved: {c.request.reason}</p>
              )}
            </>
          )}

          {/* Nobody should have to guess what a request sets off. */}
          {!c.enrolled && (
            <div className="border-t border-slate-100 pt-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">What happens next</p>
              <ol className="mt-2.5 space-y-2.5">
                {[
                  "You send the request — nothing is charged and nothing starts yet.",
                  "Our training team reviews it, usually within two working days.",
                  "If it's approved we enrol you and email you; the course then appears under My Courses.",
                ].map((t, i) => (
                  <li key={i} className="flex items-start gap-2.5 text-xs text-slate-600 leading-relaxed">
                    <span className="w-4 h-4 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                    {t}
                  </li>
                ))}
              </ol>
              <p className="text-[11px] text-slate-400 mt-3">
                If your company arranges your training, your request goes to them first.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
