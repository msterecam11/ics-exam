"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Save, Mail, Play, Eye, ShieldAlert, FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { EMAIL_RULES, ruleLabel } from "@/lib/lms-email-rules"
import EmailRuleRow, { type Tri } from "@/components/lms/emails/EmailRuleRow"

interface Settings {
  config: { master_enabled: boolean; test_mode: boolean; test_address: string | null; daily_cap: number }
  rules: Record<string, { enabled: boolean; config: Record<string, any> }>
}

interface RunResult {
  dryRun: boolean; programs: number; members: number
  testMode: boolean; testAddress: string | null
  counts: Record<string, { sent: number; skipped: number; failed: number }>
  results: { rule: string; to: string | null; intended: string | null; status: string; reason: string | null; subject: string }[]
}

// EM-16 / EM-18 / EM-20 — the global email screen: master switch, test mode,
// the daily limit, every email's default, and the preview / run buttons.
export default function EmailSettingsPanel() {
  const [s, setS] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState<"" | "dry" | "live">("")
  const [run, setRun] = useState<RunResult | null>(null)

  const load = useCallback(async () => {
    const res = await fetch("/api/lms/email-settings")
    if (res.ok) setS(await res.json())
    else toast.error("Could not load the email settings")
  }, [])
  useEffect(() => { load() }, [load])

  if (!s) return <div className="flex items-center gap-2 text-sm text-slate-400 py-8"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>

  const setConfig = (patch: Partial<Settings["config"]>) => setS({ ...s, config: { ...s.config, ...patch } })
  const setRule = (code: string, patch: Partial<Settings["rules"][string]>) =>
    setS({ ...s, rules: { ...s.rules, [code]: { ...s.rules[code], ...patch } } })

  async function save() {
    setSaving(true)
    const res = await fetch("/api/lms/email-settings", {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ config: s!.config, rules: s!.rules }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Could not save"); return }
    setS(data); toast.success("Email settings saved")
  }

  async function doRun(dry: boolean) {
    if (!dry && !confirm(s!.config.test_mode
      ? `This sends now. Test mode is on, so everything goes to ${s!.config.test_address}.`
      : "TEST MODE IS OFF. This sends real emails to real students. Continue?")) return
    setRunning(dry ? "dry" : "live")
    const res = await fetch(`/api/cron/lms-daily${dry ? "?dry=1" : ""}`)
    const data = await res.json().catch(() => ({}))
    setRunning("")
    if (!res.ok) { toast.error(data.error ?? "The run failed"); return }
    setRun(data)
    const total = Object.values(data.counts ?? {}).reduce((a: number, c: any) => a + c.sent, 0)
    toast.success(dry ? `Preview: ${total} email${total === 1 ? "" : "s"} would go out` : `Sent ${total}`)
  }

  const off = !s.config.master_enabled

  return (
    <div className="space-y-5 max-w-3xl pb-10">
      {/* ── Master controls ── */}
      <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-[#1B4F8A]" />
          <p className="text-sm font-semibold text-slate-800">Automatic emails</p>
        </div>

        <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3">
          <input type="checkbox" checked={s.config.master_enabled} onChange={e => setConfig({ master_enabled: e.target.checked })} className="mt-0.5" />
          <span>
            <span className="text-sm font-medium text-slate-800">Send automatic emails</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              The master switch. Off means nothing automatic leaves the system, whatever any program says.
            </span>
          </span>
        </label>

        {off && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 shrink-0 mt-px" />
            Everything below is paused. Students get no reminders, no completion notices and no certificate emails.
          </p>
        )}

        <label className="flex items-start gap-3 cursor-pointer bg-slate-50 rounded-lg p-3">
          <input type="checkbox" checked={s.config.test_mode} onChange={e => setConfig({ test_mode: e.target.checked })} className="mt-0.5" />
          <span>
            <span className="text-sm font-medium text-slate-800 flex items-center gap-1.5"><FlaskConical className="h-3.5 w-3.5" /> Test mode</span>
            <span className="block text-xs text-slate-500 mt-0.5">
              Every email goes to one address instead of the real recipient. The log still records who it was meant for.
            </span>
          </span>
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Test address</span>
            <Input value={s.config.test_address ?? ""} onChange={e => setConfig({ test_address: e.target.value })}
              placeholder="you@example.com" />
          </label>
          <label className="text-xs">
            <span className="block text-slate-500 mb-1">Most reminders per student per day</span>
            <Input type="number" min={0} max={20} value={s.config.daily_cap}
              onChange={e => setConfig({ daily_cap: Number(e.target.value) })} />
            <span className="block text-[10px] text-slate-400 mt-0.5">0 = no limit. Completion and certificate emails are never held back.</span>
          </label>
        </div>

        {!s.config.test_mode && (
          <p className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            Test mode is off — emails go to real students.
          </p>
        )}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
          <Button variant="outline" onClick={() => doRun(true)} disabled={!!running} className="gap-2">
            {running === "dry" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />} Preview today&apos;s run
          </Button>
          <Button variant="outline" onClick={() => doRun(false)} disabled={!!running} className="gap-2">
            {running === "live" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Run now
          </Button>
        </div>
        <p className="text-[11px] text-slate-400">
          The daily job normally runs itself. Preview shows exactly who would be emailed today — and why everyone else was skipped —
          without sending anything.
        </p>
      </section>

      {/* ── Run report ── */}
      {run && (
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-sm font-semibold text-slate-800 mb-1">
            {run.dryRun ? "Preview" : "Run"} · {run.programs} live program{run.programs === 1 ? "" : "s"}, {run.members} students
          </p>
          {run.testMode && <p className="text-xs text-amber-700 mb-3">Test mode: everything would go to {run.testAddress}.</p>}
          {run.results.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing is due today.</p>
          ) : (
            <div className="max-h-80 overflow-auto rounded-lg border border-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-left text-slate-500">
                    <th className="px-3 py-2 font-semibold">Email</th>
                    <th className="px-3 py-2 font-semibold">To</th>
                    <th className="px-3 py-2 font-semibold">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {run.results.map((r, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5 text-slate-700">{ruleLabel(r.rule)}</td>
                      <td className="px-3 py-1.5 text-slate-500">{r.intended ?? r.to ?? "—"}</td>
                      <td className="px-3 py-1.5">
                        <span className={
                          r.status === "skipped" ? "text-slate-400"
                            : r.status === "failed" ? "text-red-600" : "text-emerald-600"}>
                          {r.status === "would_send" ? "would send" : r.status}
                        </span>
                        {r.reason && <span className="text-slate-400"> · {r.reason}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Each email ── */}
      {(["student", "staff"] as const).map(aud => (
        <section key={aud} className="space-y-2.5">
          <p className="text-sm font-semibold text-slate-800 pt-1">
            {aud === "student" ? "Emails to students" : "Emails to staff"}
          </p>
          {EMAIL_RULES.filter(r => r.audience === aud).map(def => (
            <EmailRuleRow key={def.code} def={def} disabled={off}
              value={(s.rules[def.code]?.enabled ? "on" : "off") as Tri}
              config={s.rules[def.code]?.config ?? {}}
              onValue={v => setRule(def.code, { enabled: v === "on" })}
              onConfig={(k, v) => setRule(def.code, { config: { ...s.rules[def.code]?.config, [k]: v } })}
            />
          ))}
        </section>
      ))}

      <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save email settings
      </Button>
    </div>
  )
}
