"use client"

import { AlertTriangle } from "lucide-react"
import { WEEKDAYS, type EmailRuleDef, type RuleKnob } from "@/lib/lms-email-rules"

export type Tri = "inherit" | "on" | "off"

/**
 * One email's controls. Used by both settings screens: LMS Settings shows a
 * plain on/off, a program shows Inherit / On / Off so it can follow the global
 * setting or go its own way (EM-16). Timing numbers work the same in both.
 */
export default function EmailRuleRow({
  def, value, config, effectiveOn, inheritLabel, onValue, onConfig, disabled,
}: {
  def: EmailRuleDef
  /** "on"/"off" on the global screen; "inherit" is only offered per program. */
  value: Tri
  config: Record<string, any>
  /** What "Inherit" currently resolves to, shown next to the choice. */
  effectiveOn?: boolean
  inheritLabel?: string
  onValue: (v: Tri) => void
  onConfig: (key: string, v: number | number[]) => void
  disabled?: boolean
}) {
  const allowInherit = !!inheritLabel
  const isOff = value === "off" || (value === "inherit" && effectiveOn === false)

  return (
    <div className={`rounded-xl border p-4 ${isOff ? "border-slate-200 bg-slate-50/60" : "border-slate-200 bg-white"}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            <span className="text-slate-400 font-mono text-xs mr-1.5">{def.em}</span>{def.label}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{def.description}</p>
        </div>
        <div className="shrink-0 flex rounded-lg border border-slate-200 overflow-hidden text-xs">
          {(allowInherit ? (["inherit", "on", "off"] as Tri[]) : (["on", "off"] as Tri[])).map(opt => (
            <button key={opt} type="button" disabled={disabled} onClick={() => onValue(opt)}
              className={`px-3 py-1.5 font-medium transition-colors disabled:opacity-50 ${
                value === opt
                  ? opt === "off" ? "bg-slate-700 text-white" : opt === "on" ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-800"
                  : "bg-white text-slate-500 hover:bg-slate-50"}`}>
              {opt === "inherit" ? "Inherit" : opt === "on" ? "On" : "Off"}
            </button>
          ))}
        </div>
      </div>

      {allowInherit && value === "inherit" && (
        <p className="text-[11px] text-slate-400 mt-2">
          Following {inheritLabel} — currently <strong className={effectiveOn ? "text-emerald-600" : "text-slate-600"}>{effectiveOn ? "on" : "off"}</strong>.
        </p>
      )}

      {def.warning && value === "off" && (
        <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mt-2 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" /> {def.warning}
        </p>
      )}

      {!!def.knobs?.length && !isOff && (
        <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap gap-4">
          {def.knobs.map(k => (
            <KnobInput key={k.key} knob={k} value={config?.[k.key] ?? k.default} disabled={disabled}
              onChange={v => onConfig(k.key, v)} />
          ))}
        </div>
      )}
    </div>
  )
}

function KnobInput({ knob, value, onChange, disabled }: {
  knob: RuleKnob; value: any; onChange: (v: number | number[]) => void; disabled?: boolean
}) {
  const label = <span className="block text-[11px] text-slate-500 mb-1">{knob.label}</span>

  if (knob.kind === "weekday") {
    return (
      <label className="text-xs">
        {label}
        <select value={Number(value)} disabled={disabled} onChange={e => onChange(Number(e.target.value))}
          className="h-8 rounded-lg border border-slate-200 px-2 text-sm bg-white">
          {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
      </label>
    )
  }

  if (knob.kind === "number_list") {
    const text = Array.isArray(value) ? value.join(", ") : String(value ?? "")
    return (
      <label className="text-xs">
        {label}
        <input type="text" defaultValue={text} disabled={disabled}
          onBlur={e => {
            const list = e.target.value.split(/[,\s]+/).map(Number).filter(n => Number.isFinite(n) && n > 0)
            if (list.length) onChange([...new Set(list)].sort((a, b) => b - a))
          }}
          className="h-8 w-28 rounded-lg border border-slate-200 px-2 text-sm" placeholder="14, 3" />
        {knob.hint && <span className="block text-[10px] text-slate-400 mt-0.5">{knob.hint}</span>}
      </label>
    )
  }

  return (
    <label className="text-xs">
      {label}
      <span className="flex items-center gap-1.5">
        <input type="number" min={knob.min} max={knob.max} value={Number(value)} disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
          className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-sm" />
        {knob.unit && <span className="text-slate-400">{knob.unit}</span>}
      </span>
      {knob.hint && <span className="block text-[10px] text-slate-400 mt-0.5">{knob.hint}</span>}
    </label>
  )
}
