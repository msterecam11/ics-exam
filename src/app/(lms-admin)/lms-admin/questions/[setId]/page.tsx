"use client"

import { use, useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  ArrowLeft, Plus, Search, Loader2, X, Trash2, Edit2,
  ChevronDown, ChevronUp, CheckCircle2, Circle, Tag,
  BookOpen, HelpCircle,
} from "lucide-react"
import { Label } from "@/components/ui/label"
import { Button }  from "@/components/ui/button"
import { Badge }   from "@/components/ui/badge"
import { Input }   from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast }   from "sonner"
import { cn }      from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
type QuestionType = "mcq_single" | "mcq_multi" | "ordering" | "matching" | "open_ended"
type Difficulty   = "easy" | "medium" | "hard"

interface Choice {
  id?:         string
  text_en:     string
  text_ar:     string
  is_correct:  boolean
  order_index: number
}
interface OrderingItem { text: string }
interface MatchingPair { left: string; right: string }

interface Question {
  id:              string
  text_en:         string
  text_ar:         string | null
  type:            QuestionType
  difficulty:      Difficulty
  tags:            string[]
  score:           number
  explanation_en:  string | null
  set_id:          string | null
  ordering_items:  OrderingItem[] | null
  matching_pairs:  MatchingPair[] | null
  lms_question_choices: Choice[]
}

interface QuestionSet {
  id: string; name: string; description: string | null; topic: string | null
}

// ─── Config maps ──────────────────────────────────────────────────────────────
const TYPE_LABELS: Record<QuestionType, string> = {
  mcq_single: "Single Choice",
  mcq_multi:  "Multi Choice",
  ordering:   "Ordering",
  matching:   "Match the Pair",
  open_ended: "Open Ended",
}
const DIFF_COLOR: Record<Difficulty, string> = {
  easy:   "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  hard:   "bg-red-50 text-red-600",
}

// ─── Question Form ────────────────────────────────────────────────────────────
const EMPTY_CHOICE: () => Choice = () => ({ text_en: "", text_ar: "", is_correct: false, order_index: 0 })

const EMPTY_ORDERING: () => OrderingItem[] = () => [{ text: "" }, { text: "" }, { text: "" }]
const EMPTY_MATCHING: () => MatchingPair[] = () => [{ left: "", right: "" }, { left: "", right: "" }]

interface FormState {
  text_en: string; text_ar: string; type: QuestionType; difficulty: Difficulty
  tags: string; score: string; explanation_en: string
  choices:        Choice[]
  orderingItems:  OrderingItem[]
  matchingPairs:  MatchingPair[]
}
const EMPTY_FORM: FormState = {
  text_en: "", text_ar: "", type: "mcq_single", difficulty: "medium",
  tags: "", score: "1", explanation_en: "",
  choices: [EMPTY_CHOICE(), EMPTY_CHOICE()],
  orderingItems: EMPTY_ORDERING(),
  matchingPairs: EMPTY_MATCHING(),
}

function fromQuestion(q: Question): FormState {
  return {
    text_en:        q.text_en,
    text_ar:        q.text_ar ?? "",
    type:           q.type,
    difficulty:     q.difficulty,
    tags:           q.tags.join(", "),
    score:          String(q.score),
    explanation_en: q.explanation_en ?? "",
    choices:        q.lms_question_choices.length
      ? [...q.lms_question_choices].sort((a, b) => a.order_index - b.order_index)
      : [EMPTY_CHOICE(), EMPTY_CHOICE()],
    orderingItems:  q.ordering_items?.length ? q.ordering_items : EMPTY_ORDERING(),
    matchingPairs:  q.matching_pairs?.length  ? q.matching_pairs  : EMPTY_MATCHING(),
  }
}

function QuestionModal({
  open, onClose, editing, setId, onSaved,
}: {
  open: boolean; onClose: () => void; editing: Question | null
  setId: string; onSaved: (q: Question) => void
}) {
  const [form, setForm]     = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setForm(editing ? fromQuestion(editing) : EMPTY_FORM)
  }, [open, editing])

  function setF<K extends keyof FormState>(k: K, v: FormState[K]) {
    if (k === "type") {
      // Reset type-specific data when switching types
      const t = v as QuestionType
      setForm(f => ({
        ...f, [k]: v,
        choices:       (t === "mcq_single" || t === "mcq_multi") ? (f.choices.length ? f.choices : [EMPTY_CHOICE(), EMPTY_CHOICE()]) : f.choices,
        orderingItems: t === "ordering" ? (f.orderingItems.length ? f.orderingItems : EMPTY_ORDERING()) : f.orderingItems,
        matchingPairs: t === "matching" ? (f.matchingPairs.length ? f.matchingPairs : EMPTY_MATCHING()) : f.matchingPairs,
      }))
      return
    }
    setForm(f => ({ ...f, [k]: v }))
  }
  function setChoice(i: number, k: keyof Choice, v: string | boolean | number) {
    setForm(f => ({ ...f, choices: f.choices.map((c, ci) => ci === i ? { ...c, [k]: v } : c) }))
  }
  function addChoice() {
    setForm(f => ({ ...f, choices: [...f.choices, { ...EMPTY_CHOICE(), order_index: f.choices.length }] }))
  }
  function removeChoice(i: number) {
    setForm(f => ({ ...f, choices: f.choices.filter((_, ci) => ci !== i) }))
  }
  function toggleCorrect(i: number) {
    if (form.type === "mcq_single") {
      setForm(f => ({ ...f, choices: f.choices.map((c, ci) => ({ ...c, is_correct: ci === i })) }))
    } else {
      setChoice(i, "is_correct", !form.choices[i].is_correct)
    }
  }

  const isMcq      = form.type === "mcq_single" || form.type === "mcq_multi"
  const isOrdering = form.type === "ordering"
  const isMatching = form.type === "matching"

  async function save() {
    if (!form.text_en.trim()) return toast.error("Question text is required")
    if (isMcq) {
      if (form.choices.some(c => !c.text_en.trim())) return toast.error("All choices need text")
      if (!form.choices.some(c => c.is_correct))     return toast.error("Mark at least one correct answer")
    }
    if (isOrdering && form.orderingItems.some(it => !it.text.trim())) return toast.error("All ordering items need text")
    if (isMatching && form.matchingPairs.some(p => !p.left.trim() || !p.right.trim())) return toast.error("All match pairs need both sides")

    setSaving(true)
    try {
      const method = editing ? "PATCH" : "POST"
      const body: Record<string, unknown> = {
        text_en:        form.text_en.trim(),
        text_ar:        form.text_ar.trim() || undefined,
        type:           form.type,
        difficulty:     form.difficulty,
        tags:           form.tags.split(",").map(t => t.trim()).filter(Boolean),
        score:          parseFloat(form.score) || 1,
        explanation_en: form.explanation_en.trim() || undefined,
        set_id:         setId,
        choices:        isMcq      ? form.choices.map((c, i) => ({ ...c, order_index: i })) : undefined,
        ordering_items: isOrdering ? form.orderingItems : undefined,
        matching_pairs: isMatching ? form.matchingPairs  : undefined,
      }
      if (editing) body.id = editing.id

      const res  = await fetch("/api/lms/questions", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success(editing ? "Question updated" : "Question added")
      onSaved({ ...data, lms_question_choices: data.lms_question_choices ?? [] })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Question" : "Add Question"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Type + Difficulty row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Type</label>
              <select
                value={form.type}
                onChange={e => setF("type", e.target.value as QuestionType)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(Object.entries(TYPE_LABELS) as [QuestionType, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Difficulty</label>
              <div className="flex gap-2">
                {(["easy","medium","hard"] as Difficulty[]).map(d => (
                  <button key={d} type="button"
                    onClick={() => setF("difficulty", d)}
                    className={cn(
                      "flex-1 py-2 rounded-lg text-xs font-semibold capitalize border-2 transition-all",
                      form.difficulty === d
                        ? (d === "easy" ? "border-emerald-400 bg-emerald-50 text-emerald-700" :
                           d === "medium" ? "border-amber-400 bg-amber-50 text-amber-700" :
                           "border-red-400 bg-red-50 text-red-600")
                        : "border-slate-200 text-slate-400 hover:border-slate-300"
                    )}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Question text */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Question (English) *</label>
            <textarea
              value={form.text_en}
              onChange={e => setF("text_en", e.target.value)}
              placeholder="Type the question here…"
              rows={3}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Question (Arabic) <span className="text-slate-400 font-normal">(optional)</span></label>
            <textarea
              value={form.text_ar}
              onChange={e => setF("text_ar", e.target.value)}
              dir="rtl"
              placeholder="اكتب السؤال هنا…"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>

          {/* MCQ Choices */}
          {isMcq && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-slate-700">
                  Answer Choices
                  <span className="ml-2 text-xs text-slate-400 font-normal">
                    {form.type === "mcq_single" ? "— click circle to mark correct" : "— check all correct answers"}
                  </span>
                </label>
                <Button type="button" size="sm" variant="outline" onClick={addChoice} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {form.choices.map((c, i) => (
                  <div key={i} className={cn(
                    "flex items-center gap-2 p-2.5 rounded-xl border-2 transition-colors",
                    c.is_correct ? "border-emerald-300 bg-emerald-50/50" : "border-slate-200 bg-white"
                  )}>
                    <button type="button" onClick={() => toggleCorrect(i)} className="shrink-0">
                      {c.is_correct
                        ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        : <Circle className="h-5 w-5 text-slate-300 hover:text-slate-400" />}
                    </button>
                    <Input
                      value={c.text_en}
                      onChange={e => setChoice(i, "text_en", e.target.value)}
                      placeholder={`Choice ${i + 1}`}
                      className="flex-1 h-8 text-sm border-0 bg-transparent focus-visible:ring-0 p-0"
                    />
                    {form.choices.length > 2 && (
                      <button type="button" onClick={() => removeChoice(i)}
                        className="shrink-0 text-slate-300 hover:text-red-400 transition-colors">
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ordering items */}
          {isOrdering && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Items — in correct order</label>
              <p className="text-xs text-slate-400">Students will see these shuffled and must reorder them correctly.</p>
              {form.orderingItems.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-400 w-5 text-center shrink-0">{i + 1}</span>
                  <Input value={item.text} onChange={e => setForm(f => ({
                    ...f, orderingItems: f.orderingItems.map((it, ii) => ii === i ? { text: e.target.value } : it)
                  }))} placeholder={`Item ${i + 1}`} className="flex-1 h-8 text-sm" />
                  <button onClick={() => {
                    const arr = [...form.orderingItems]; const to = i - 1
                    if (to >= 0) { [arr[i], arr[to]] = [arr[to], arr[i]]; setForm(f => ({ ...f, orderingItems: arr })) }
                  }} disabled={i === 0} className="text-slate-300 hover:text-slate-600 disabled:opacity-30 p-1">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => {
                    const arr = [...form.orderingItems]; const to = i + 1
                    if (to < arr.length) { [arr[i], arr[to]] = [arr[to], arr[i]]; setForm(f => ({ ...f, orderingItems: arr })) }
                  }} disabled={i === form.orderingItems.length - 1} className="text-slate-300 hover:text-slate-600 disabled:opacity-30 p-1">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  {form.orderingItems.length > 2 && (
                    <button onClick={() => setForm(f => ({ ...f, orderingItems: f.orderingItems.filter((_, ii) => ii !== i) }))}
                      className="text-slate-300 hover:text-red-400 p-1"><X className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setForm(f => ({ ...f, orderingItems: [...f.orderingItems, { text: "" }] }))} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Add item
              </Button>
            </div>
          )}

          {/* Matching pairs */}
          {isMatching && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Match pairs</label>
              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-400 px-1">
                <span>Left (prompt)</span><span>Right (answer)</span>
              </div>
              {form.matchingPairs.map((pair, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={pair.left}  onChange={e => setForm(f => ({ ...f, matchingPairs: f.matchingPairs.map((p, pi) => pi === i ? { ...p, left:  e.target.value } : p) }))} placeholder="Left" className="flex-1 h-8 text-sm" />
                  <span className="text-slate-400 text-xs shrink-0">→</span>
                  <Input value={pair.right} onChange={e => setForm(f => ({ ...f, matchingPairs: f.matchingPairs.map((p, pi) => pi === i ? { ...p, right: e.target.value } : p) }))} placeholder="Right" className="flex-1 h-8 text-sm" />
                  {form.matchingPairs.length > 2 && (
                    <button onClick={() => setForm(f => ({ ...f, matchingPairs: f.matchingPairs.filter((_, pi) => pi !== i) }))}
                      className="text-slate-300 hover:text-red-400 p-1"><X className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              ))}
              <Button type="button" size="sm" variant="outline" onClick={() => setForm(f => ({ ...f, matchingPairs: [...f.matchingPairs, { left: "", right: "" }] }))} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Add pair
              </Button>
            </div>
          )}

          {/* Score + Tags row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Score (points)</label>
              <Input
                type="number" min="0" step="0.5"
                value={form.score}
                onChange={e => setF("score", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
                <Tag className="h-3.5 w-3.5 text-slate-400" /> Tags
              </label>
              <Input
                value={form.tags}
                onChange={e => setF("tags", e.target.value)}
                placeholder="safety, nav, weather (comma-separated)"
              />
            </div>
          </div>

          {/* Explanation */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Explanation <span className="text-slate-400 font-normal">(shown after answer)</span></label>
            <textarea
              value={form.explanation_en}
              onChange={e => setF("explanation_en", e.target.value)}
              placeholder="Optional explanation of the correct answer…"
              rows={2}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : (editing ? "Save Changes" : "Add Question")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Question row ─────────────────────────────────────────────────────────────
function QuestionRow({ q, idx, onEdit, onDelete }: {
  q: Question; idx: number; onEdit: (q: Question) => void; onDelete: (q: Question) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const choices = [...(q.lms_question_choices ?? [])].sort((a, b) => a.order_index - b.order_index)

  return (
    <div className="border border-slate-100 rounded-xl overflow-hidden">
      <div
        className="flex items-start gap-3 p-4 bg-white hover:bg-slate-50/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <span className="text-xs text-slate-300 font-mono w-6 shrink-0 pt-0.5">{idx + 1}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 leading-snug">{q.text_en}</p>
          {q.text_ar && <p className="text-xs text-slate-400 mt-0.5 text-right" dir="rtl">{q.text_ar}</p>}
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
              {TYPE_LABELS[q.type]}
            </span>
            <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize", DIFF_COLOR[q.difficulty])}>
              {q.difficulty}
            </span>
            <span className="text-[10px] text-slate-400">{q.score} pts</span>
            {q.tags.map(t => (
              <span key={t} className="text-[10px] text-[#1B4F8A] bg-[#1B4F8A]/8 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <Tag className="h-2.5 w-2.5" />{t}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={e => { e.stopPropagation(); onEdit(q) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/8 transition-colors">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(q) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {expanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-0 bg-slate-50 border-t border-slate-100 space-y-3">
          {/* MCQ choices */}
          {choices.length > 0 && (
            <div className="space-y-1.5 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Choices</p>
              {choices.map((c, i) => (
                <div key={c.id ?? i} className={cn("flex items-center gap-2 text-sm px-3 py-1.5 rounded-lg",
                  c.is_correct ? "bg-emerald-50 text-emerald-800" : "bg-white text-slate-600")}>
                  {c.is_correct ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> : <Circle className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                  <span>{c.text_en}</span>
                </div>
              ))}
            </div>
          )}
          {/* Ordering items */}
          {q.type === "ordering" && q.ordering_items && q.ordering_items.length > 0 && (
            <div className="space-y-1 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Correct Order</p>
              {q.ordering_items.map((it, i) => (
                <div key={i} className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-white text-slate-600">
                  <span className="font-bold text-slate-400 w-4">{i + 1}.</span>
                  <span>{it.text}</span>
                </div>
              ))}
            </div>
          )}
          {/* Matching pairs */}
          {q.type === "matching" && q.matching_pairs && q.matching_pairs.length > 0 && (
            <div className="space-y-1 pt-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Match Pairs</p>
              {q.matching_pairs.map((p, i) => (
                <div key={i} className="grid grid-cols-2 gap-2 text-xs px-3 py-1.5 rounded-lg bg-white text-slate-600">
                  <span className="font-medium">{p.left}</span>
                  <span className="text-slate-400">→ {p.right}</span>
                </div>
              ))}
            </div>
          )}
          {q.explanation_en && (
            <div className="pt-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Explanation</p>
              <p className="text-xs text-slate-600 leading-relaxed">{q.explanation_en}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Set detail page ──────────────────────────────────────────────────────────
export default function SetDetailPage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = use(params)

  const [set,       setSet]       = useState<QuestionSet | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState("")
  const [typeFilter, setTypeFilter] = useState("")
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editing,    setEditing]    = useState<Question | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ set_id: setId, limit: "200" })
    if (search)     params.set("search", search)
    if (typeFilter) params.set("type", typeFilter)

    const [setRes, qRes] = await Promise.all([
      fetch(`/api/lms/question-sets?search=`),
      fetch(`/api/lms/questions?${params}`),
    ])

    if (setRes.ok) {
      const sets = await setRes.json() as QuestionSet[]
      setSet(sets.find(s => s.id === setId) ?? null)
    }
    if (qRes.ok) {
      const data = await qRes.json()
      setQuestions(data.questions ?? [])
    }
    setLoading(false)
  }, [setId, search, typeFilter])

  useEffect(() => { load() }, [load])

  async function deleteQuestion(q: Question) {
    if (!confirm("Delete this question?")) return
    const res = await fetch(`/api/lms/questions?id=${q.id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete"); return }
    toast.success("Question deleted")
    setQuestions(prev => prev.filter(x => x.id !== q.id))
  }

  function openCreate() { setEditing(null); setModalOpen(true) }
  function openEdit(q: Question) { setEditing(q); setModalOpen(true) }

  function onSaved(q: Question) {
    setQuestions(prev =>
      editing ? prev.map(x => x.id === q.id ? q : x) : [q, ...prev]
    )
  }

  const diffCounts = {
    easy:   questions.filter(q => q.difficulty === "easy").length,
    medium: questions.filter(q => q.difficulty === "medium").length,
    hard:   questions.filter(q => q.difficulty === "hard").length,
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3 flex-wrap">
        <Link href="/lms-admin/questions">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0 mt-0.5">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-slate-900 truncate">{set?.name ?? "Loading…"}</h1>
            {set?.topic && (
              <span className="text-xs font-bold uppercase tracking-widest text-[#1B4F8A] bg-[#1B4F8A]/8 px-2 py-0.5 rounded-full">
                {set.topic}
              </span>
            )}
          </div>
          {set?.description && <p className="text-sm text-slate-500 mt-0.5">{set.description}</p>}
        </div>
        <Button onClick={openCreate} className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
          <Plus className="h-4 w-4" /> Add Question
        </Button>
      </div>

      {/* Stats strip */}
      {questions.length > 0 && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-slate-600">
            <BookOpen className="h-4 w-4 text-slate-400" />
            <span className="font-semibold">{questions.length}</span>
            <span className="text-sm text-slate-400">questions</span>
          </div>
          <div className="h-4 w-px bg-slate-200" />
          {diffCounts.easy   > 0 && <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">{diffCounts.easy} Easy</span>}
          {diffCounts.medium > 0 && <span className="text-xs font-semibold text-amber-600  bg-amber-50  px-2 py-1 rounded-full">{diffCounts.medium} Medium</span>}
          {diffCounts.hard   > 0 && <span className="text-xs font-semibold text-red-500    bg-red-50    px-2 py-1 rounded-full">{diffCounts.hard} Hard</span>}
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input placeholder="Search questions…" className="pl-9" value={search}
            onChange={e => setSearch(e.target.value)} />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
          {[
            { value: "",            label: "All"     },
            { value: "mcq_single",  label: "Single"  },
            { value: "mcq_multi",   label: "Multi"   },
            { value: "ordering",    label: "Order"   },
            { value: "matching",    label: "Match"   },
            { value: "open_ended",  label: "Open"    },
          ].map(f => (
            <button key={f.value} onClick={() => setTypeFilter(f.value)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-colors",
                typeFilter === f.value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Question list */}
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-300" /></div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <HelpCircle className="h-7 w-7 text-slate-300" />
          </div>
          <h3 className="font-semibold text-slate-700 mb-1">
            {search ? "No questions match your search" : "No questions yet"}
          </h3>
          {!search && (
            <p className="text-sm text-slate-400 mb-6 max-w-xs">
              Add your first question to this set. You can use MCQ (single or multi-answer) or open-ended questions.
            </p>
          )}
          {!search && (
            <Button onClick={openCreate} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
              <Plus className="h-4 w-4" /> Add First Question
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <QuestionRow key={q.id} q={q} idx={i} onEdit={openEdit} onDelete={deleteQuestion} />
          ))}
        </div>
      )}

      <QuestionModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        setId={setId}
        onSaved={onSaved}
      />
    </div>
  )
}
