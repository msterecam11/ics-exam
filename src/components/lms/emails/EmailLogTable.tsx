"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EMAIL_RULES, ruleLabel } from "@/lib/lms-email-rules"

export interface EmailLogRow {
  id: string; type: string; rule: string | null
  to_email: string; intended_email: string | null
  subject: string; status: string; reason: string | null; error: string | null
  sent_at: string; student: string | null; program: string | null
}

const STATUS_STYLE: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-700",
  redirected: "bg-sky-50 text-sky-700",
  skipped: "bg-slate-100 text-slate-500",
  failed: "bg-red-50 text-red-700",
}

// EM-19 — the log answers two questions: what went out, and why someone didn't
// get something. Skips are kept with their reason for exactly that.
export default function EmailLogTable({ programId }: { programId?: string }) {
  const [rows, setRows] = useState<EmailLogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [rule, setRule] = useState("")
  const [status, setStatus] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams()
    if (programId) p.set("program", programId)
    if (rule) p.set("rule", rule)
    if (status) p.set("status", status)
    const res = await fetch(`/api/lms/email-logs?${p}`)
    setRows(res.ok ? await res.json() : [])
    setLoading(false)
  }, [programId, rule, status])
  useEffect(() => { load() }, [load])

  return (
    <div className="bg-white rounded-xl border border-slate-200">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-semibold text-slate-900 text-sm">Email log</h3>
        <div className="flex items-center gap-2">
          <select value={rule} onChange={e => setRule(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs bg-white">
            <option value="">All emails</option>
            {EMAIL_RULES.map(r => <option key={r.code} value={r.code}>{r.em} {r.label}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value)} className="h-8 rounded-lg border border-slate-200 px-2 text-xs bg-white">
            <option value="">Any outcome</option>
            <option value="sent">Sent</option>
            <option value="redirected">Redirected (test mode)</option>
            <option value="skipped">Skipped</option>
            <option value="failed">Failed</option>
          </select>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5 text-xs h-8">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="px-5 py-8 text-sm text-slate-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-8 text-sm text-slate-400">Nothing logged yet.</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-left text-slate-500">
                <th className="px-4 py-2 font-semibold">When</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Recipient</th>
                <th className="px-4 py-2 font-semibold">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-2 text-slate-500 whitespace-nowrap">
                    {new Date(r.sent_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td className="px-4 py-2 text-slate-700">
                    {r.rule ? ruleLabel(r.rule) : r.type}
                    <span className="block text-[11px] text-slate-400 truncate max-w-[280px]">{r.subject}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {r.student ?? r.intended_email ?? r.to_email}
                    {r.intended_email && r.intended_email !== r.to_email && (
                      <span className="block text-[11px] text-sky-600">redirected to {r.to_email}</span>
                    )}
                    {r.program && <span className="block text-[11px] text-slate-400">{r.program}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_STYLE[r.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {r.status}
                    </span>
                    {(r.reason || r.error) && (
                      <span className="block text-[11px] text-slate-400 mt-0.5 max-w-[260px]">{r.reason ?? r.error}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
