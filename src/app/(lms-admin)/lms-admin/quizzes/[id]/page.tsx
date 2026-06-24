"use client"

import { use, useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  ArrowLeft, Save, Loader2, Plus, Trash2, Search,
  ChevronDown, ChevronUp, CheckCircle2, Circle,
  Target, Clock, Shuffle, Eye, Hash, Folder, X,
  GripVertical, Info,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { toast }  from "sonner"
import { cn }     from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
interface QuizQuestion {
  id:          string   // lms_quiz_questions.id
  question_id: string
  order_index: number
  lms_questions: {
    id:         string
    text_en:    string
    type:       string
    difficulty: string
    score:      number
    tags:       string[]
    lms_question_choices: { id: string; text_en: string; is_correct: boolean; order_index: number }[]
  }
}

interface Quiz {
  id:                 string
  title:              string
  description:        string | null
  pass_score:         number
  time_limit_minutes: number | null
  max_attempts:       number | null
  shuffle_questions:  boolean
  show_answers_after: boolean
  lms_quiz_questions: QuizQuestion[]
}

interface QSet {
  id:             string
  name:           string
  topic:          string | null
  question_count: number
}

interface BankQuestion {
  id:         string
  text_en:    string
  type:       string
  difficulty: string
  score:      number
  tags:       string[]
  lms_question_choices: { id: string; text_en: string; is_correct: boolean; order_index: number }[]
}

const DIFF_COLOR: Record<string, string> = {
  easy:   "bg-emerald-50 text-emerald-700",
  medium: "bg-amber-50 text-amber-700",
  hard:   "bg-red-50 text-red-600",
}
const TYPE_SHORT: Record<string, string> = {
  mcq_single: "MCQ-S",
  mcq_multi:  "MCQ-M",
  open_ended: "Open",
}

// ─── Settings panel ───────────────────────────────────────────────────────────
function SettingsPanel({ quiz, onSaved }: { quiz: Quiz; onSaved: (q: Partial<Quiz>) => void }) {
  const [title,        setTitle]        = useState(quiz.title)
  const [desc,         setDesc]         = useState(quiz.description ?? "")
  const [passScore,    setPassScore]    = useState(String(quiz.pass_score))
  const [timeLimit,    setTimeLimit]    = useState(String(quiz.time_limit_minutes ?? ""))
  const [maxAttempts,  setMaxAttempts]  = useState(String(quiz.max_attempts ?? ""))
  const [shuffle,      setShuffle]      = useState(quiz.shuffle_questions)
  const [showAnswers,  setShowAnswers]  = useState(quiz.show_answers_after)
  const [saving,       setSaving]       = useState(false)

  async function save() {
    if (!title.trim()) return toast.error("Title is required")
    setSaving(true)
    try {
      const body = {
        id:                 quiz.id,
        title:              title.trim(),
        description:        desc.trim() || null,
        pass_score:         parseInt(passScore) || 70,
        time_limit_minutes: timeLimit ? parseInt(timeLimit) : null,
        max_attempts:       maxAttempts ? parseInt(maxAttempts) : null,
        shuffle_questions:  shuffle,
        show_answers_after: showAnswers,
      }
      const res  = await fetch("/api/lms/quizzes", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!res.ok) { toast.error("Failed to save"); return }
      toast.success("Quiz settings saved")
      onSaved(body)
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5">
      <h2 className="font-semibold text-slate-900">Quiz Settings</h2>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Title *</label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Quiz title" />
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-slate-700">Description</label>
        <textarea
          value={desc} onChange={e => setDesc(e.target.value)}
          placeholder="Brief description for students…"
          rows={2}
          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
            <Target className="h-3.5 w-3.5 text-slate-400" /> Pass %
          </label>
          <Input type="number" min={0} max={100} value={passScore}
            onChange={e => setPassScore(e.target.value)} placeholder="70" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-slate-400" /> Time (min)
          </label>
          <Input type="number" min={1} value={timeLimit}
            onChange={e => setTimeLimit(e.target.value)} placeholder="∞ none" />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-1">
            <Hash className="h-3.5 w-3.5 text-slate-400" /> Attempts
          </label>
          <Input type="number" min={1} value={maxAttempts}
            onChange={e => setMaxAttempts(e.target.value)} placeholder="∞ unlimited" />
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-3 pt-1">
        <label className="flex items-center justify-between cursor-pointer select-none">
          <span className="flex items-center gap-2 text-sm text-slate-700">
            <Shuffle className="h-4 w-4 text-slate-400" /> Shuffle questions
          </span>
          <button
            type="button"
            onClick={() => setShuffle(s => !s)}
            className={cn("relative w-10 h-5.5 rounded-full transition-colors", shuffle ? "bg-[#1B4F8A]" : "bg-slate-200")}
            style={{ height: 22 }}
          >
            <span className={cn(
              "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
              shuffle ? "left-5" : "left-0.5"
            )} />
          </button>
        </label>
        <label className="flex items-center justify-between cursor-pointer select-none">
          <span className="flex items-center gap-2 text-sm text-slate-700">
            <Eye className="h-4 w-4 text-slate-400" /> Show correct answers after
          </span>
          <button
            type="button"
            onClick={() => setShowAnswers(s => !s)}
            className={cn("relative w-10 rounded-full transition-colors", showAnswers ? "bg-[#1B4F8A]" : "bg-slate-200")}
            style={{ height: 22 }}
          >
            <span className={cn(
              "absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all",
              showAnswers ? "left-5" : "left-0.5"
            )} />
          </button>
        </label>
      </div>

      <Button onClick={save} disabled={saving} className="w-full bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {saving ? "Saving…" : "Save Settings"}
      </Button>
    </div>
  )
}

// ─── Question picker (bank browser) ──────────────────────────────────────────
function QuestionPicker({
  addedIds, onAdd,
}: {
  addedIds: Set<string>
  onAdd:    (q: BankQuestion) => void
}) {
  const [sets,      setSets]      = useState<QSet[]>([])
  const [selSet,    setSelSet]    = useState<QSet | null>(null)
  const [questions, setQuestions] = useState<BankQuestion[]>([])
  const [search,    setSearch]    = useState("")
  const [loadingSets, setLoadingSets] = useState(true)
  const [loadingQs,   setLoadingQs]   = useState(false)

  useEffect(() => {
    fetch("/api/lms/question-sets")
      .then(r => r.json())
      .then(data => { setSets(data); setLoadingSets(false) })
  }, [])

  const loadQuestions = useCallback(async (setId: string, q: string) => {
    setLoadingQs(true)
    const params = new URLSearchParams({ set_id: setId, limit: "200" })
    if (q) params.set("search", q)
    const res = await fetch(`/api/lms/questions?${params}`)
    if (res.ok) {
      const data = await res.json()
      setQuestions(data.questions ?? [])
    }
    setLoadingQs(false)
  }, [])

  useEffect(() => {
    if (selSet) loadQuestions(selSet.id, search)
  }, [selSet, search, loadQuestions])

  return (
    <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
      <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
        <Folder className="h-4 w-4 text-slate-400" />
        <span className="text-sm font-semibold text-slate-700">Add from Question Bank</span>
      </div>

      <div className="grid grid-cols-[200px_1fr] divide-x divide-slate-100 min-h-[280px]">
        {/* Sets list */}
        <div className="overflow-y-auto max-h-80 py-2">
          {loadingSets ? (
            <div className="flex justify-center pt-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
          ) : sets.length === 0 ? (
            <p className="text-xs text-slate-400 text-center pt-8 px-3">No sets yet.<br />Go to Question Bank first.</p>
          ) : sets.map(s => (
            <button
              key={s.id}
              onClick={() => { setSelSet(s); setSearch("") }}
              className={cn(
                "w-full text-left px-4 py-2.5 transition-colors border-l-2",
                selSet?.id === s.id
                  ? "bg-[#1B4F8A]/5 border-l-[#1B4F8A] text-[#1B4F8A]"
                  : "border-l-transparent text-slate-600 hover:bg-slate-50"
              )}
            >
              <p className="text-sm font-medium leading-tight line-clamp-1">{s.name}</p>
              <p className="text-xs text-slate-400">{s.question_count} questions</p>
            </button>
          ))}
        </div>

        {/* Questions list */}
        <div className="flex flex-col">
          {!selSet ? (
            <div className="flex flex-col items-center justify-center flex-1 text-center p-6">
              <Folder className="h-8 w-8 text-slate-200 mb-2" />
              <p className="text-sm text-slate-400">Select a question set on the left</p>
            </div>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-slate-100 relative">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search questions…" className="pl-7 h-8 text-xs"
                />
              </div>
              <div className="overflow-y-auto max-h-64">
                {loadingQs ? (
                  <div className="flex justify-center pt-8"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
                ) : questions.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center pt-8">No questions in this set</p>
                ) : questions.map(q => {
                  const added = addedIds.has(q.id)
                  return (
                    <div key={q.id}
                      className={cn(
                        "flex items-start gap-2.5 px-4 py-3 border-b border-slate-50 last:border-0",
                        added ? "bg-emerald-50/40" : "hover:bg-slate-50/70"
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-800 line-clamp-2 leading-snug">{q.text_en}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <span className="text-[9px] font-bold uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {TYPE_SHORT[q.type] ?? q.type}
                          </span>
                          <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded capitalize", DIFF_COLOR[q.difficulty])}>
                            {q.difficulty}
                          </span>
                          <span className="text-[9px] text-slate-400">{q.score}pt</span>
                        </div>
                      </div>
                      <button
                        onClick={() => !added && onAdd(q)}
                        disabled={added}
                        className={cn(
                          "shrink-0 mt-0.5 p-1 rounded-lg transition-colors",
                          added
                            ? "text-emerald-500 cursor-default"
                            : "text-slate-400 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/8"
                        )}
                      >
                        {added ? <CheckCircle2 className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main builder page ────────────────────────────────────────────────────────
export default function QuizBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: quizId } = use(params)

  const [quiz,    setQuiz]    = useState<Quiz | null>(null)
  const [loading, setLoading] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/lms/quizzes?quiz_id=${quizId}`)
      .then(r => r.json())
      .then(data => { setQuiz(data); setLoading(false) })
  }, [quizId])

  // Questions already in the quiz
  const qqList = (quiz?.lms_quiz_questions ?? [])
    .slice().sort((a, b) => a.order_index - b.order_index)
  const addedIds = new Set(qqList.map(q => q.question_id))

  const totalScore = qqList.reduce((s, q) => s + (q.lms_questions?.score ?? 0), 0)

  async function addQuestion(q: BankQuestion) {
    const res = await fetch("/api/lms/quizzes", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: quizId, add_question_ids: [q.id] }),
    })
    if (!res.ok) { toast.error("Failed to add"); return }
    // Optimistic update
    setQuiz(prev => {
      if (!prev) return prev
      const newQQ: QuizQuestion = {
        id: `temp-${q.id}`,
        question_id: q.id,
        order_index: prev.lms_quiz_questions.length,
        lms_questions: { ...q, lms_question_choices: q.lms_question_choices },
      }
      return { ...prev, lms_quiz_questions: [...prev.lms_quiz_questions, newQQ] }
    })
    toast.success("Question added")
  }

  async function removeQuestion(qq: QuizQuestion) {
    setRemoving(qq.question_id)
    const res = await fetch("/api/lms/quizzes", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: quizId, remove_question_ids: [qq.question_id] }),
    })
    setRemoving(null)
    if (!res.ok) { toast.error("Failed to remove"); return }
    setQuiz(prev => prev ? {
      ...prev,
      lms_quiz_questions: prev.lms_quiz_questions.filter(q => q.question_id !== qq.question_id)
    } : prev)
    toast.success("Question removed")
  }

  if (loading) {
    return <div className="flex justify-center pt-20"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
  }
  if (!quiz) {
    return <div className="text-center pt-20 text-slate-500">Quiz not found</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/lms-admin/quizzes">
          <Button variant="ghost" size="icon" className="rounded-full shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900 truncate">{quiz.title}</h1>
          <p className="text-sm text-slate-500">
            {qqList.length} questions · {totalScore} total points · {quiz.pass_score}% pass mark
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6 items-start">
        {/* Left: Settings */}
        <SettingsPanel quiz={quiz} onSaved={updates => setQuiz(prev => prev ? { ...prev, ...updates } : prev)} />

        {/* Right: Questions */}
        <div className="space-y-4">
          {/* Questions in quiz */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-900 text-sm">Questions in this quiz</span>
                <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                  {qqList.length}
                </span>
              </div>
              <Button size="sm" onClick={() => setPickerOpen(p => !p)}
                className={cn("gap-1.5 h-8 text-xs", pickerOpen
                  ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  : "bg-[#1B4F8A] hover:bg-[#163f6f] text-white")}>
                {pickerOpen ? <><X className="h-3.5 w-3.5" /> Close bank</> : <><Plus className="h-3.5 w-3.5" /> Add questions</>}
              </Button>
            </div>

            {qqList.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-3">
                  <Info className="h-6 w-6 text-amber-400" />
                </div>
                <p className="text-sm text-slate-500">No questions yet — click <strong>Add questions</strong> to browse your question bank.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {qqList.map((qq, idx) => {
                  const q = qq.lms_questions
                  if (!q) return null
                  const choices = [...(q.lms_question_choices ?? [])].sort((a, b) => a.order_index - b.order_index)
                  return (
                    <div key={qq.id} className="flex items-start gap-3 px-5 py-3.5 hover:bg-slate-50/50 group">
                      <GripVertical className="h-4 w-4 text-slate-200 mt-0.5 shrink-0" />
                      <span className="text-xs text-slate-300 font-mono w-5 shrink-0 mt-0.5">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 line-clamp-2 leading-snug">{q.text_en}</p>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          <span className="text-[9px] font-bold uppercase text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {TYPE_SHORT[q.type] ?? q.type}
                          </span>
                          <span className={cn("text-[9px] font-bold uppercase px-1.5 py-0.5 rounded capitalize", DIFF_COLOR[q.difficulty])}>
                            {q.difficulty}
                          </span>
                          <span className="text-[9px] text-slate-400">{q.score}pt</span>
                        </div>
                        {/* Correct answers preview */}
                        {choices.filter(c => c.is_correct).map(c => (
                          <div key={c.id} className="flex items-center gap-1 mt-1">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                            <span className="text-[11px] text-emerald-700 line-clamp-1">{c.text_en}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => removeQuestion(qq)}
                        disabled={removing === qq.question_id}
                        className="shrink-0 p-1.5 rounded-lg text-slate-200 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        {removing === qq.question_id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  )
                })}
                {/* Totals row */}
                <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-t border-slate-100">
                  <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Total</span>
                  <span className="text-sm font-bold text-slate-700">{totalScore} points</span>
                </div>
              </div>
            )}
          </div>

          {/* Question bank picker */}
          {pickerOpen && (
            <QuestionPicker addedIds={addedIds} onAdd={addQuestion} />
          )}

          {/* Attach hint */}
          {qqList.length > 0 && (
            <div className="flex items-start gap-3 bg-blue-50 rounded-xl px-4 py-3 border border-blue-100">
              <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 leading-relaxed">
                <strong>To attach this quiz to a course:</strong> go to the course content builder → add a content item → select type <em>Quiz</em> → pick this quiz from the list.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
