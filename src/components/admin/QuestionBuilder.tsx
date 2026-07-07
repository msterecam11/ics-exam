"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Trash2, GripVertical, Pencil, Loader2, CheckCircle2, AlertCircle, Upload, FileSpreadsheet, Download, XCircle } from "lucide-react"
import { toast } from "sonner"
import type { Question } from "@/types"
import MCQEditor from "./question-editors/MCQEditor"
import MatchingEditor from "./question-editors/MatchingEditor"
import OrderingEditor from "./question-editors/OrderingEditor"
import OpenEndedEditor from "./question-editors/OpenEndedEditor"

const TYPE_LABELS: Record<string, string> = {
  mcq_single: "MCQ — Single Answer",
  mcq_multi: "MCQ — Multiple Answers",
  ordering: "Ordering",
  matching: "Matching",
  open_ended: "Open-Ended",
}
const TYPE_COLORS: Record<string, string> = {
  mcq_single: "bg-blue-100 text-blue-700",
  mcq_multi: "bg-indigo-100 text-indigo-700",
  ordering: "bg-amber-100 text-amber-700",
  matching: "bg-purple-100 text-purple-700",
  open_ended: "bg-rose-100 text-rose-700",
}

interface Props {
  examId?: string
  questionBankId?: string
  initialQuestions: Question[]
  // Exams require questions to sum to exactly 100 points; a question bank
  // (a large reusable pool) has no such constraint — defaults to the existing
  // exam behavior so nothing changes for current callers.
  requireTotal100?: boolean
}

function blankQuestion(type: string) {
  return {
    type,
    text: "",
    score: 10,
    ai_scoring_guide: "",
    choices: type === "mcq_single" || type === "mcq_multi"
      ? [{ text: "", is_correct: false, score: 0 }, { text: "", is_correct: false, score: 0 }]
      : undefined,
    matching_pairs: type === "matching"
      ? [{ left_item: "", right_item: "" }]
      : undefined,
    ordering_items: type === "ordering"
      ? [{ text: "", correct_position: 0 }, { text: "", correct_position: 1 }]
      : undefined,
  }
}

export default function QuestionBuilder({ examId, questionBankId, initialQuestions, requireTotal100 = true }: Props) {
  const baseUrl = examId ? `/api/exams/${examId}` : `/api/question-banks/${questionBankId}`
  const [questions, setQuestions] = useState<Question[]>(initialQuestions)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingQ, setEditingQ] = useState<Question | null>(null)
  const [draft, setDraft] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [giftOpen, setGiftOpen] = useState(false)
  const [giftText, setGiftText] = useState("")
  const [importing, setImporting] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvErrors, setCsvErrors] = useState<{ row: number; message: string }[]>([])

  const totalScore = questions.reduce((s, q) => s + q.score, 0)
  const scoreOk = requireTotal100 ? Math.abs(totalScore - 100) < 0.01 : true

  function openNew(type: string) {
    setEditingQ(null)
    setDraft(blankQuestion(type))
    setDialogOpen(true)
  }

  function openEdit(q: Question) {
    setEditingQ(q)
    setDraft({
      ...q,
      choices: q.choices ?? [],
      matching_pairs: q.matching_pairs ?? [],
      ordering_items: q.ordering_items ?? [],
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!draft.text.trim()) { toast.error("Question text is required"); return }
    setSaving(true)

    let res: Response
    if (editingQ) {
      res = await fetch(`/api/questions/${editingQ.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
    } else {
      res = await fetch(`${baseUrl}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, order_index: questions.length }),
      })
    }

    setSaving(false)
    if (!res.ok) { toast.error("Failed to save question"); return }

    const saved = await res.json()
    if (editingQ) {
      setQuestions((qs) => qs.map((q) => (q.id === saved.id ? saved : q)))
    } else {
      setQuestions((qs) => [...qs, saved])
    }
    toast.success(editingQ ? "Question updated" : "Question added")
    setDialogOpen(false)
  }

  async function handleGIFTImport() {
    if (!giftText.trim()) return
    setImporting(true)
    const res = await fetch(`${baseUrl}/import-gift`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gift_text: giftText, start_index: questions.length }),
    })
    setImporting(false)
    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error ?? "Import failed")
      return
    }
    const { created, total } = await res.json()
    toast.success(`Imported ${created} of ${total} questions`)
    setGiftText("")
    setGiftOpen(false)
    // Reload questions from server
    const qRes = await fetch(`${baseUrl}/questions`)
    if (qRes.ok) setQuestions(await qRes.json())
  }

  async function handleCSVImport() {
    if (!csvFile) return
    setCsvImporting(true)
    setCsvErrors([])
    const text = await csvFile.text()
    const res = await fetch(`${baseUrl}/import-csv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv_text: text, start_index: questions.length }),
    })
    setCsvImporting(false)
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? "Import failed")
      if (data.errors) setCsvErrors(data.errors)
      return
    }
    if (data.errors?.length) setCsvErrors(data.errors)
    toast.success(`Imported ${data.created} of ${data.total} questions`)
    if (data.created > 0) {
      setCsvFile(null)
      setCsvOpen(false)
      const qRes = await fetch(`${baseUrl}/questions`)
      if (qRes.ok) setQuestions(await qRes.json())
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this question?")) return
    setDeleting(id)
    const res = await fetch(`/api/questions/${id}`, { method: "DELETE" })
    setDeleting(null)
    if (res.ok) {
      setQuestions((qs) => qs.filter((q) => q.id !== id))
      toast.success("Question deleted")
    } else {
      toast.error("Failed to delete")
    }
  }

  function renderEditor() {
    if (!draft) return null
    const type = draft.type
    if (type === "mcq_single" || type === "mcq_multi") {
      return <MCQEditor draft={draft} onChange={setDraft} multiAnswer={type === "mcq_multi"} />
    }
    if (type === "matching") return <MatchingEditor draft={draft} onChange={setDraft} />
    if (type === "ordering") return <OrderingEditor draft={draft} onChange={setDraft} />
    if (type === "open_ended") return <OpenEndedEditor draft={draft} onChange={setDraft} />
    return null
  }

  return (
    <div className="space-y-4">
      {/* Score indicator */}
      {requireTotal100 ? (
        <div className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${scoreOk ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
          {scoreOk
            ? <><CheckCircle2 className="h-4 w-4" /> Total score: 100 — perfect!</>
            : <><AlertCircle className="h-4 w-4" /> Total score: {totalScore} / 100 — questions must sum to exactly 100</>
          }
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-slate-50 text-slate-600">
          <CheckCircle2 className="h-4 w-4" /> {questions.length} question{questions.length !== 1 ? "s" : ""} · {totalScore} points total
        </div>
      )}

      {/* Question list */}
      {questions.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No questions yet. Add your first question below.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {questions.map((q, i) => (
            <Card key={q.id} className="border-l-4 border-l-[#1B4F8A]">
              <CardHeader className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-semibold text-muted-foreground">Q{i + 1}</span>
                      <Badge className={`text-xs border-0 ${TYPE_COLORS[q.type]}`} variant="secondary">
                        {TYPE_LABELS[q.type]}
                      </Badge>
                      <Badge variant="outline" className="text-xs">{q.score} pts</Badge>
                    </div>
                    <p className="text-sm line-clamp-2">{q.text}</p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(q)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => handleDelete(q.id)}
                      disabled={deleting === q.id}
                    >
                      {deleting === q.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />
                      }
                    </Button>
                  </div>
                </div>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      {/* Add question buttons */}
      <div className="flex flex-wrap gap-2 pt-2">
        <span className="text-sm text-muted-foreground self-center mr-1">Add:</span>
        {Object.entries(TYPE_LABELS).map(([type, label]) => (
          <Button
            key={type}
            variant="outline"
            size="sm"
            onClick={() => openNew(type)}
            className="gap-1.5 text-xs h-8"
          >
            <Plus className="h-3 w-3" /> {label}
          </Button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setGiftOpen(true)}
          className="gap-1.5 text-xs h-8 border-[#1B4F8A] text-[#1B4F8A] hover:bg-blue-50 ml-2"
        >
          <Upload className="h-3 w-3" /> Import GIFT
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setCsvOpen(true); setCsvErrors([]); setCsvFile(null) }}
          className="gap-1.5 text-xs h-8 border-emerald-600 text-emerald-700 hover:bg-emerald-50"
        >
          <FileSpreadsheet className="h-3 w-3" /> Import CSV
        </Button>
      </div>

      {/* GIFT import dialog */}
      <Dialog open={giftOpen} onOpenChange={setGiftOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import Questions — GIFT Format</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">
              Paste your questions in <strong>GIFT format</strong> (used by Moodle). Supports MCQ, True/False, Matching, and Short Answer (imported as Open-Ended).
            </p>
            <div className="bg-muted rounded-md p-3 text-xs font-mono text-muted-foreground space-y-1">
              <p>// MCQ single answer</p>
              <p>What is the capital of France? {"{"} =Paris ~London ~Berlin ~Rome {"}"}</p>
              <p className="mt-1">// MCQ multiple correct</p>
              <p>Select all mammals: {"{"} =Whale =Dolphin ~Eagle ~Salmon {"}"}</p>
              <p className="mt-1">// True/False</p>
              <p>The sky is blue. {"{"} TRUE {"}"}</p>
              <p className="mt-1">// Matching</p>
              <p>Match the capitals. {"{"} =France -{">"} Paris =Germany -{">"} Berlin {"}"}</p>
            </div>
            <Textarea
              placeholder="Paste your GIFT-formatted questions here…"
              value={giftText}
              onChange={(e) => setGiftText(e.target.value)}
              rows={12}
              className="font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setGiftOpen(false)}>Cancel</Button>
              <Button
                onClick={handleGIFTImport}
                disabled={importing || !giftText.trim()}
                className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {importing ? "Importing…" : "Import Questions"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CSV import dialog */}
      <Dialog open={csvOpen} onOpenChange={setCsvOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Questions — CSV</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Download the template, fill it in Excel or Google Sheets, then upload it here.
              </p>
              <a
                href="/templates/questions-template.csv"
                download="questions-template.csv"
                className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-md bg-[#1B4F8A] text-white hover:bg-[#163f6e] transition-colors shrink-0 ml-3"
              >
                <Download className="h-3.5 w-3.5" /> Template
              </a>
            </div>

            <div className="bg-muted rounded-md p-3 text-xs space-y-1 text-muted-foreground font-mono">
              <p className="font-sans font-medium text-foreground mb-1">Column format:</p>
              <p>mcq_single — opt: <span className="text-foreground">Text:Score</span> (e.g. Paris:10, London:5)</p>
              <p>mcq_multi  — opt: <span className="text-foreground">Text:Score</span> per correct/wrong choice</p>
              <p>ordering   — opt: <span className="text-foreground">Item text</span> in correct order</p>
              <p>matching   — opt: <span className="text-foreground">Left:Right</span> pairs</p>
              <p>open_ended — use ai_guide column for scoring hints</p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Upload your filled CSV</label>
              <input
                type="file"
                accept=".csv,text/csv"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:text-xs file:font-medium file:bg-background hover:file:bg-muted cursor-pointer"
                onChange={(e) => { setCsvFile(e.target.files?.[0] ?? null); setCsvErrors([]) }}
              />
            </div>

            {csvFile && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                {csvFile.name} — ready to import
              </p>
            )}

            {csvErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 space-y-1 max-h-32 overflow-y-auto">
                {csvErrors.map((e, i) => (
                  <p key={i} className="text-xs text-red-700 flex items-start gap-1.5">
                    <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    Row {e.row}: {e.message}
                  </p>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCsvOpen(false)}>Cancel</Button>
              <Button
                onClick={handleCSVImport}
                disabled={csvImporting || !csvFile}
                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
              >
                {csvImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {csvImporting ? "Importing…" : "Import"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Question editor dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingQ ? "Edit Question" : `New — ${TYPE_LABELS[draft?.type ?? ""]}`}
            </DialogTitle>
          </DialogHeader>

          {draft && (
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Question Text *</Label>
                <Textarea
                  placeholder="Enter the question..."
                  value={draft.text}
                  onChange={(e) => setDraft((d: any) => ({ ...d, text: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Score (points)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.5}
                  value={draft.score}
                  onChange={(e) => setDraft((d: any) => ({ ...d, score: Number(e.target.value) }))}
                  className="w-28"
                />
              </div>

              {renderEditor()}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Question"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
