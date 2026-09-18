"use client"

import { useEffect, useState } from "react"
import { Store, Plus, X, Eye, Clock, BarChart3 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { VISIBILITY, LEVELS } from "@/lib/lms-catalogue"

// Step 10 (CV-1, CV-4) — how a course appears in the student catalogue, and who
// may see it. Editing happens inside the course's own Settings form, so it
// saves with everything else.

interface CatalogueForm {
  title?: string | null
  thumbnail_url?: string | null
  language?: string | null
  delivery_mode?: string | null
  catalogue_visibility?: string | null
  catalogue_companies?: string[] | null
  short_description?: string | null
  level?: string | null
  duration_hours?: number | null
  learning_outcomes?: string[] | null
}

// ── Category dropdown, with "create new" built in ────────────────────────────
export function CategorySelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const [cats, setCats] = useState<{ id: string; name: string; is_active: boolean }[]>([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")

  const load = () => fetch("/api/lms/categories").then(r => r.ok ? r.json() : null).then(d => d && setCats(d.categories ?? []))
  useEffect(() => { load() }, [])

  async function create() {
    const n = name.trim()
    if (!n) return
    const res = await fetch("/api/lms/categories", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: n }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? "Could not create the category"); return }
    await load()
    onChange(data.id)
    setName(""); setAdding(false)
    toast.success(`"${n}" created`)
  }

  if (adding) return (
    <div className="flex gap-2">
      <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="New category name"
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); create() } }} />
      <button type="button" onClick={create} className="px-3 h-9 rounded-lg bg-[#1B4F8A] text-white text-sm shrink-0">Add</button>
      <button type="button" onClick={() => { setAdding(false); setName("") }} className="px-2 h-9 rounded-lg text-slate-500 hover:bg-slate-100 shrink-0"><X className="h-4 w-4" /></button>
    </div>
  )

  return (
    <div className="flex gap-2">
      <select value={value ?? ""} onChange={e => onChange(e.target.value || null)}
        className="w-full h-9 rounded-lg border bg-transparent px-3 text-sm">
        <option value="">Uncategorised</option>
        {cats.map(c => <option key={c.id} value={c.id}>{c.name}{c.is_active ? "" : " (archived)"}</option>)}
      </select>
      <button type="button" onClick={() => setAdding(true)} title="New category"
        className="px-2 h-9 rounded-lg border text-slate-500 hover:bg-slate-50 shrink-0"><Plus className="h-4 w-4" /></button>
    </div>
  )
}

// ── The catalogue panel ──────────────────────────────────────────────────────
export default function CourseCatalogueSettings({ form, set }: {
  form: CatalogueForm
  set: (key: string, value: unknown) => void
}) {
  const [companies, setCompanies] = useState<{ id: string; name: string; code: string }[]>([])
  const visibility = form.catalogue_visibility ?? "hidden"
  const chosen = form.catalogue_companies ?? []
  const outcomes = form.learning_outcomes ?? []

  useEffect(() => {
    fetch("/api/lms/companies?status=active").then(r => r.ok ? r.json() : []).then(d => setCompanies(Array.isArray(d) ? d : []))
  }, [])

  const setOutcome = (i: number, v: string) => set("learning_outcomes", outcomes.map((o, j) => j === i ? v : o))
  const addOutcome = () => set("learning_outcomes", [...outcomes, ""])
  const dropOutcome = (i: number) => set("learning_outcomes", outcomes.filter((_, j) => j !== i))

  return (
    <div className="bg-white rounded-xl border p-5 space-y-4">
      <div>
        <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
          <Store className="h-4 w-4 text-[#1B4F8A]" /> Catalogue
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Whether students can find this course themselves and ask to join it. A client whose
          catalogue is switched off never sees it, whatever is chosen here.
        </p>
      </div>

      {/* CV-1 — who may see it */}
      <div className="space-y-1.5">
        <Label>Who can see it</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {VISIBILITY.map(v => (
            <label key={v.value}
              className={cn("flex items-start gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-colors",
                visibility === v.value ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200 hover:bg-slate-50")}>
              <input type="radio" name="catalogue_visibility" className="mt-0.5"
                checked={visibility === v.value}
                onChange={() => set("catalogue_visibility", v.value)} />
              <span>
                <span className="text-sm font-medium text-slate-800">{v.label}</span>
                <span className="block text-[11px] text-slate-500 mt-0.5">{v.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {visibility === "specific" && (
        <div className="space-y-1.5">
          <Label>Which companies</Label>
          {companies.length === 0 ? (
            <p className="text-sm text-slate-400">No active companies yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {companies.map(c => {
                const on = chosen.includes(c.id)
                return (
                  <button key={c.id} type="button"
                    onClick={() => set("catalogue_companies", on ? chosen.filter(x => x !== c.id) : [...chosen, c.id])}
                    className={cn("px-2.5 py-1 rounded-lg text-xs border transition-colors",
                      on ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium" : "border-slate-200 text-slate-600 hover:bg-slate-50")}>
                    {c.name}
                  </button>
                )
              })}
            </div>
          )}
          {!chosen.length && <p className="text-[11px] text-amber-700">Choose at least one company, or nobody will see this course.</p>}
        </div>
      )}

      {visibility !== "hidden" && (
        <>
          {/* CV-4 — the card */}
          <div className="pt-1 border-t border-slate-100" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Level</Label>
              <select value={form.level ?? ""} onChange={e => set("level", e.target.value || null)}
                className="w-full h-9 rounded-lg border bg-transparent px-3 text-sm">
                <option value="">Not set</option>
                {LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label>Duration (hours)</Label>
              <Input type="number" min={0} step="0.5" value={form.duration_hours ?? ""}
                onChange={e => set("duration_hours", e.target.value === "" ? null : Number(e.target.value))}
                placeholder="e.g. 16" />
            </div>
          </div>

          <div className="space-y-1">
            <Label>Catalogue blurb</Label>
            <textarea value={form.short_description ?? ""} onChange={e => set("short_description", e.target.value)}
              rows={2} maxLength={300}
              className="w-full rounded-lg border px-3 py-2 text-sm resize-none focus:outline-none"
              placeholder="One or two lines shown on the card. Falls back to the course description." />
          </div>

          <div className="space-y-1.5">
            <Label>What they&apos;ll learn</Label>
            {outcomes.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input value={o} onChange={e => setOutcome(i, e.target.value)} placeholder="One thing they'll be able to do" />
                <button type="button" onClick={() => dropOutcome(i)} className="px-2 h-9 rounded-lg text-slate-400 hover:bg-slate-100 shrink-0"><X className="h-4 w-4" /></button>
              </div>
            ))}
            {outcomes.length < 20 && (
              <button type="button" onClick={addOutcome} className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1">
                <Plus className="h-3.5 w-3.5" /> Add a point
              </button>
            )}
          </div>

          {/* A preview, so nobody has to guess */}
          <div className="pt-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" /> How the card will look
            </p>
            <div className="max-w-xs rounded-xl border border-slate-200 overflow-hidden bg-white">
              <div className="h-24 bg-slate-100">
                {form.thumbnail_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.thumbnail_url} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="p-3">
                <p className="text-sm font-semibold text-slate-800 line-clamp-2">{form.title || "Course title"}</p>
                <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                  {form.short_description || "Your blurb appears here."}
                </p>
                <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                  {form.duration_hours ? <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{form.duration_hours}h</span> : null}
                  {form.level ? <span className="flex items-center gap-1 capitalize"><BarChart3 className="h-3 w-3" />{form.level}</span> : null}
                  <span className="capitalize">{form.delivery_mode ?? "online"}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
