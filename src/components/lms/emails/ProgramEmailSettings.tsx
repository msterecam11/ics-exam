"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, Save, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { PROGRAM_RULES } from "@/lib/lms-email-rules"
import EmailRuleRow, { type Tri } from "@/components/lms/emails/EmailRuleRow"

type Overrides = Record<string, Record<string, any>>

// EM-16 — what this program does with each email. "Inherit" follows LMS
// Settings; On / Off decide for this program alone. The timing numbers can be
// changed here too, even when the switch itself is inherited.
export default function ProgramEmailSettings({ programId, initial, locked, onSaved }: {
  programId: string
  initial: Overrides
  locked?: boolean
  onSaved?: () => void
}) {
  const [overrides, setOverrides] = useState<Overrides>(initial ?? {})
  const [globals, setGlobals] = useState<{ master: boolean; rules: Record<string, { enabled: boolean; config: any }> } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch("/api/lms/email-settings")
    if (!res.ok) return
    const d = await res.json()
    setGlobals({ master: d.config.master_enabled, rules: d.rules })
  }, [])
  useEffect(() => { load() }, [load])

  const triOf = (code: string): Tri => {
    const o = overrides[code]
    if (!o || typeof o.enabled !== "boolean") return "inherit"
    return o.enabled ? "on" : "off"
  }
  const configOf = (code: string) => ({ ...(globals?.rules[code]?.config ?? {}), ...(overrides[code] ?? {}) })

  function setTri(code: string, v: Tri) {
    setOverrides(prev => {
      const next = { ...prev }
      const entry = { ...(next[code] ?? {}) }
      if (v === "inherit") delete entry.enabled
      else entry.enabled = v === "on"
      if (!Object.keys(entry).length) delete next[code]
      else next[code] = entry
      return next
    })
  }

  function setKnob(code: string, key: string, value: number | number[]) {
    setOverrides(prev => ({ ...prev, [code]: { ...(prev[code] ?? {}), [key]: value } }))
  }

  async function save() {
    setSaving(true)
    // Send every rule: the ones with no override go as null, which clears any
    // stored value and puts them back to inheriting.
    const payload: Record<string, any> = {}
    for (const r of PROGRAM_RULES) {
      const o = overrides[r.code]
      if (!o || !Object.keys(o).length) { payload[r.code] = null; continue }
      const { enabled, ...knobs } = o
      payload[r.code] = { enabled: typeof enabled === "boolean" ? enabled : null, config: knobs }
    }
    const res = await fetch(`/api/lms/programs/${programId}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ email_settings: payload }),
    })
    const data = await res.json().catch(() => ({}))
    setSaving(false)
    if (!res.ok) { toast.error(data.error ?? "Could not save the email settings"); return }
    setOverrides(data.email_settings ?? {})
    toast.success("Email settings saved")
    onSaved?.()
  }

  const overrideCount = Object.keys(overrides).length

  return (
    <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800 flex items-center gap-2"><Mail className="h-4 w-4 text-[#1B4F8A]" /> Emails</p>
          <p className="text-xs text-slate-500 mt-0.5">
            What this program sends its students and instructors. <strong>Inherit</strong> follows LMS Settings → Emails;
            On and Off decide for this program alone.
          </p>
        </div>
        {overrideCount > 0 && (
          <span className="text-[11px] text-slate-500 bg-slate-100 rounded-full px-2.5 py-1 shrink-0">
            {overrideCount} set here
          </span>
        )}
      </div>

      {globals && !globals.master && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Automatic emails are paused for the whole LMS, so nothing below is being sent right now.
        </p>
      )}

      {!globals ? (
        <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : (
        <div className="space-y-2.5">
          {PROGRAM_RULES.map(def => (
            <EmailRuleRow key={def.code} def={def} disabled={locked}
              value={triOf(def.code)} config={configOf(def.code)}
              inheritLabel="LMS Settings"
              effectiveOn={globals.master && globals.rules[def.code]?.enabled !== false}
              onValue={v => setTri(def.code, v)}
              onConfig={(k, v) => setKnob(def.code, k, v)}
            />
          ))}
        </div>
      )}

      {!locked && (
        <Button onClick={save} disabled={saving || !globals} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save email settings
        </Button>
      )}
    </section>
  )
}
