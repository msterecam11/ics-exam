"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Hourglass, CheckCircle2, XCircle, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

// SP-16 — Pending / Approved / Rejected, with the reason when there is one.

interface Row {
  id: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  note: string | null
  reason: string | null
  created_at: string
  decided_at: string | null
  course: { id: string; title: string; thumbnail_url: string | null }
}

const STYLE: Record<string, { label: string; icon: any; cls: string }> = {
  pending:   { label: "Waiting for an answer", icon: Hourglass,   cls: "bg-amber-50 text-amber-700 border-amber-100" },
  approved:  { label: "Approved",              icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 border-emerald-100" },
  rejected:  { label: "Not approved",          icon: XCircle,      cls: "bg-red-50 text-red-700 border-red-100" },
  cancelled: { label: "Withdrawn",             icon: XCircle,      cls: "bg-slate-100 text-slate-500 border-slate-200" },
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "—"

export default function MyCourseRequests() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/lms/catalogue/requests")
    setRows(res.ok ? await res.json() : [])
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function withdraw(id: string) {
    setBusy(id)
    const res = await fetch(`/api/lms/catalogue/requests?id=${id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { toast.error(data.error ?? "Could not withdraw it"); return }
    toast.success("Request withdrawn")
    load()
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div>
        <Link href="/lms/catalogue" className="text-xs text-slate-500 hover:text-[#1B4F8A] flex items-center gap-1">
          <ArrowLeft className="h-3.5 w-3.5" /> Catalogue
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-1">My requests</h1>
        <p className="text-sm text-slate-500 mt-0.5">Courses you&apos;ve asked to join.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <Inbox className="h-8 w-8 text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-700 mt-3">You haven&apos;t asked for anything yet</p>
          <Link href="/lms/catalogue" className="text-sm text-[#1B4F8A] hover:underline mt-2 inline-block">Browse the catalogue</Link>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map(r => {
            const s = STYLE[r.status] ?? STYLE.pending
            const Icon = s.icon
            return (
              <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/lms/catalogue/${r.course.id}`} className="text-sm font-semibold text-slate-800 hover:text-[#1B4F8A]">
                      {r.course.title}
                    </Link>
                    <p className="text-xs text-slate-400 mt-0.5">Asked {fmt(r.created_at)}</p>
                  </div>
                  <span className={cn("shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border flex items-center gap-1.5", s.cls)}>
                    <Icon className="h-3 w-3" /> {s.label}
                  </span>
                </div>

                {r.note && <p className="text-xs text-slate-500 mt-2 italic border-l-2 border-slate-200 pl-2">{r.note}</p>}

                {r.status === "rejected" && r.reason && (
                  <p className="text-xs text-slate-600 mt-2 bg-slate-50 rounded-lg px-3 py-2">{r.reason}</p>
                )}
                {r.status === "approved" && (
                  <p className="text-xs text-emerald-700 mt-2">
                    You&apos;ve been enrolled — it&apos;s in <Link href="/lms/courses" className="underline">My Courses</Link>.
                  </p>
                )}

                {r.status === "pending" && (
                  <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => withdraw(r.id)} className="mt-3 h-7 text-xs">
                    {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Withdraw"}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
