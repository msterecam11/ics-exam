"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2, X, Search, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

// Step 11 — pick existing bank questions for a fixed section. Archived
// questions never appear: they can't go on a new paper.

interface SetRow { id: string; name: string; counts: { total: number } }
interface Q { id: string; type: string; difficulty: string; payload: any; topic: string | null }

const TYPE_LABEL: Record<string, string> = {
  mcq_single: "Single answer", mcq_multiple: "Multiple answers", ordering: "Ordering",
  match_pair: "Matching", open_ended: "Open-ended",
}

export default function BankQuestionPicker({ excludeIds, onClose, onPick }: {
  excludeIds: string[]
  onClose: () => void
  onPick: (ids: string[]) => void
}) {
  const [sets, setSets] = useState<SetRow[]>([])
  const [setId, setSetId] = useState<string>("")
  const [questions, setQuestions] = useState<Q[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [difficulty, setDifficulty] = useState("")
  const [picked, setPicked] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch("/api/lms/bank/sets").then(r => r.ok ? r.json() : []).then((d: SetRow[]) => {
      const list = Array.isArray(d) ? d : []
      setSets(list)
      setSetId(list[0]?.id ?? "")
      if (!list.length) setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (!setId) return
    setLoading(true)
    fetch(`/api/lms/bank/questions?set_id=${setId}`).then(r => r.ok ? r.json() : []).then(d => {
      setQuestions(Array.isArray(d) ? d : [])
      setLoading(false)
    })
  }, [setId])

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds])
  const q = search.trim().toLowerCase()
  const visible = questions.filter(x =>
    !excluded.has(x.id)
    && (!difficulty || x.difficulty === difficulty)
    && (!q || String(x.payload?.text ?? "").toLowerCase().includes(q) || (x.topic ?? "").toLowerCase().includes(q)))

  const toggle = (id: string) => setPicked(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allVisiblePicked = visible.length > 0 && visible.every(x => picked.has(x.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Add questions from the bank</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="h-4 w-4" /></button>
        </div>

        <div className="px-5 py-3 border-b border-slate-100 flex flex-wrap gap-2">
          <select value={setId} onChange={e => { setSetId(e.target.value); setPicked(new Set()) }}
            className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
            {sets.map(s => <option key={s.id} value={s.id}>{s.name} ({s.counts.total})</option>)}
          </select>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)} className="h-9 rounded-lg border border-slate-200 px-2 text-sm bg-white">
            <option value="">Any difficulty</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
          </select>
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search text or topic…" className="pl-9 h-9" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
          ) : !sets.length ? (
            <p className="text-sm text-slate-400 text-center py-12">The bank has no sets yet.</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-12">No questions match, or they&apos;re all in this section already.</p>
          ) : (
            <>
              <button onClick={() => setPicked(prev => {
                const n = new Set(prev)
                visible.forEach(x => allVisiblePicked ? n.delete(x.id) : n.add(x.id))
                return n
              })} className="text-xs text-[#1B4F8A] hover:underline px-2 pb-2">
                {allVisiblePicked ? "Clear these" : `Select all ${visible.length}`}
              </button>
              <ul className="space-y-1">
                {visible.map(x => {
                  const on = picked.has(x.id)
                  return (
                    <li key={x.id}>
                      <button onClick={() => toggle(x.id)}
                        className={cn("w-full text-left flex items-start gap-3 rounded-lg px-3 py-2.5 border transition-colors",
                          on ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-transparent hover:bg-slate-50")}>
                        <span className={cn("mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0",
                          on ? "bg-[#1B4F8A] border-[#1B4F8A] text-white" : "border-slate-300")}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-800 line-clamp-2">{x.payload?.text ?? "(no text)"}</span>
                          <span className="block text-[11px] text-slate-400 mt-0.5">
                            {[TYPE_LABEL[x.type] ?? x.type, x.difficulty, `${x.payload?.points ?? 1} pt`, x.topic].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-500">{picked.size} selected</span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onPick([...picked])} disabled={!picked.size} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
              Add {picked.size || ""}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
