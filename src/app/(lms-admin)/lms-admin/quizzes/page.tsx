"use client"

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import {
  Plus, Search, Loader2, X, Trash2,
  HelpCircle, Clock, Target, Shuffle, ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast }  from "sonner"
import { cn }     from "@/lib/utils"

interface Quiz {
  id:                 string
  title:              string
  description:        string | null
  pass_score:         number
  time_limit_minutes: number | null
  max_attempts:       number | null
  shuffle_questions:  boolean
  show_answers_after: boolean
  question_count:     number
  created_at:         string
}

// ─── Create Quiz modal ────────────────────────────────────────────────────────
function CreateModal({ open, onClose, onCreate }: {
  open: boolean; onClose: () => void; onCreate: (q: Quiz) => void
}) {
  const [title, setTitle]   = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setTitle("") }, [open])

  async function save() {
    if (!title.trim()) return toast.error("Title is required")
    setSaving(true)
    try {
      const res  = await fetch("/api/lms/quizzes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success("Quiz created — now add questions")
      onCreate({ ...data, question_count: 0 })
      onClose()
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>New Quiz</DialogTitle></DialogHeader>
        <div className="py-2 space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Quiz Title *</label>
          <Input
            value={title} onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Module 2 Check Quiz"
            onKeyDown={e => e.key === "Enter" && save()}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & Configure"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Quiz card ────────────────────────────────────────────────────────────────
function QuizCard({ quiz, onDelete }: { quiz: Quiz; onDelete: (q: Quiz) => void }) {
  return (
    <div className="relative bg-white rounded-2xl border border-slate-200 hover:border-[#1B4F8A]/40 hover:shadow-md transition-all group flex flex-col overflow-hidden">
      <Link href={`/lms-admin/quizzes/${quiz.id}`} className="flex flex-col flex-1 p-5 gap-3">
        {/* Icon + title */}
        <div className="flex items-start gap-3 pr-8">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
            <HelpCircle className="h-5 w-5 text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 leading-tight line-clamp-2">{quiz.title}</h3>
            {quiz.description && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{quiz.description}</p>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
            <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-semibold">{quiz.question_count}</span>
            <span className="text-slate-400">questions</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
            <Target className="h-3.5 w-3.5 text-slate-400" />
            <span className="font-semibold">{quiz.pass_score}%</span>
            <span className="text-slate-400">pass</span>
          </div>
          {quiz.time_limit_minutes && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <Clock className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold">{quiz.time_limit_minutes}m</span>
              <span className="text-slate-400">limit</span>
            </div>
          )}
          {quiz.shuffle_questions && (
            <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <Shuffle className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-400">Shuffled</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-auto pt-3 border-t border-slate-100">
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full",
            quiz.question_count > 0
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-400"
          )}>
            {quiz.question_count > 0 ? "Ready" : "No questions"}
          </span>
          <span className="text-xs text-slate-400 flex items-center gap-1">
            Configure <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </Link>

      {/* Delete button */}
      <button
        onClick={e => { e.preventDefault(); onDelete(quiz) }}
        className="absolute top-3 right-3 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function QuizzesPage() {
  const [quizzes, setQuizzes]     = useState<Quiz[]>([])
  const [loading, setLoading]     = useState(true)
  const [search,  setSearch]      = useState("")
  const [modalOpen, setModalOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.set("search", search)
    const res = await fetch(`/api/lms/quizzes?${params}`)
    if (res.ok) setQuizzes(await res.json())
    setLoading(false)
  }, [search])

  useEffect(() => { load() }, [load])

  async function deleteQuiz(quiz: Quiz) {
    if (!confirm(`Delete "${quiz.title}"? This will also remove it from any content items.`)) return
    const res = await fetch(`/api/lms/quizzes?id=${quiz.id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete"); return }
    toast.success("Quiz deleted")
    setQuizzes(prev => prev.filter(q => q.id !== quiz.id))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quizzes</h1>
          <p className="text-slate-500 text-sm mt-1">{quizzes.length} quiz{quizzes.length !== 1 ? "zes" : ""} · build from your question bank, then attach to a course</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
          <Plus className="h-4 w-4" /> New Quiz
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input placeholder="Search quizzes…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-slate-300" /></div>
      ) : quizzes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
            <HelpCircle className="h-8 w-8 text-amber-300" />
          </div>
          <h3 className="font-semibold text-slate-700 text-lg mb-1">No quizzes yet</h3>
          <p className="text-sm text-slate-400 max-w-xs mb-6">
            Create a quiz, pick questions from your question bank, then attach it to a course content item.
          </p>
          <Button onClick={() => setModalOpen(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            <Plus className="h-4 w-4" /> Create First Quiz
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {quizzes.map(q => <QuizCard key={q.id} quiz={q} onDelete={deleteQuiz} />)}
        </div>
      )}

      <CreateModal open={modalOpen} onClose={() => setModalOpen(false)}
        onCreate={q => { setQuizzes(prev => [q, ...prev]); window.location.href = `/lms-admin/quizzes/${q.id}` }} />
    </div>
  )
}
