"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Library, PenLine, Shuffle } from "lucide-react"
import { toast } from "sonner"
import QuestionBuilder from "./QuestionBuilder"
import type { Question } from "@/types"

interface Bank { id: string; name: string; question_count: number }
interface BankQuestion { id: string; score: number; topic: string | null }
interface DrawConfig { total?: number; by_topic?: Record<string, number> }

export default function ExamQuestionSource({
  examId, initialQuestionBankId, initialBankDrawConfig, initialQuestions,
}: {
  examId: string
  initialQuestionBankId: string | null
  initialBankDrawConfig: DrawConfig | null
  initialQuestions: Question[]
}) {
  const [mode, setMode] = useState<"manual" | "bank">(initialQuestionBankId ? "bank" : "manual")
  const [banks, setBanks] = useState<Bank[]>([])
  const [bankId, setBankId] = useState(initialQuestionBankId ?? "")
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([])
  const [loadingBank, setLoadingBank] = useState(false)
  const [byTopic, setByTopic] = useState<Record<string, number>>(initialBankDrawConfig?.by_topic ?? {})
  const [flatTotal, setFlatTotal] = useState(initialBankDrawConfig?.total ?? 10)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (mode !== "bank") return
    fetch("/api/question-banks").then(r => r.ok ? r.json() : []).then(setBanks)
  }, [mode])

  useEffect(() => {
    if (!bankId) { setBankQuestions([]); return }
    setLoadingBank(true)
    fetch(`/api/question-banks/${bankId}/questions`)
      .then(r => r.ok ? r.json() : [])
      .then((qs: any[]) => setBankQuestions(qs.map(q => ({ id: q.id, score: q.score, topic: q.topic }))))
      .finally(() => setLoadingBank(false))
  }, [bankId])

  const topicCounts = new Map<string, { available: number; avgScore: number }>()
  for (const q of bankQuestions) {
    const t = q.topic ?? "Untagged"
    const cur = topicCounts.get(t) ?? { available: 0, avgScore: 0 }
    cur.available++
    cur.avgScore += q.score
    topicCounts.set(t, cur)
  }
  for (const [t, v] of topicCounts) v.avgScore = v.available > 0 ? v.avgScore / v.available : 0
  const hasTopics = [...topicCounts.keys()].some(t => t !== "Untagged")

  const stratifiedTotal = Object.values(byTopic).reduce((s, n) => s + (n || 0), 0)
  const previewMaxScore = hasTopics
    ? [...topicCounts.entries()].reduce((s, [t, v]) => s + (byTopic[t] ?? 0) * v.avgScore, 0)
    : flatTotal * (bankQuestions.length ? bankQuestions.reduce((s, q) => s + q.score, 0) / bankQuestions.length : 0)

  async function save() {
    if (!bankId) return toast.error("Select a question bank first")
    const draw_config: DrawConfig = hasTopics ? { by_topic: byTopic } : { total: flatTotal }
    setSaving(true)
    const res = await fetch(`/api/exams/${examId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_bank_id: bankId, bank_draw_config: draw_config }),
    })
    setSaving(false)
    if (res.ok) toast.success("Exam linked to question bank")
    else toast.error("Failed to save")
  }

  async function switchToManual() {
    setSaving(true)
    const res = await fetch(`/api/exams/${examId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question_bank_id: null, bank_draw_config: null }),
    })
    setSaving(false)
    if (res.ok) { setMode("manual"); setBankId(""); toast.success("Switched to manual questions") }
    else toast.error("Failed to switch")
  }

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          variant={mode === "manual" ? "default" : "outline"}
          size="sm"
          className={mode === "manual" ? "bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-1.5" : "gap-1.5"}
          onClick={() => mode === "bank" ? switchToManual() : undefined}
          disabled={saving}
        >
          <PenLine className="h-3.5 w-3.5" /> Manual Questions
        </Button>
        <Button
          variant={mode === "bank" ? "default" : "outline"}
          size="sm"
          className={mode === "bank" ? "bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-1.5" : "gap-1.5"}
          onClick={() => setMode("bank")}
          disabled={saving}
        >
          <Shuffle className="h-3.5 w-3.5" /> Draw from Question Bank
        </Button>
      </div>

      {mode === "manual" ? (
        <QuestionBuilder examId={examId} initialQuestions={initialQuestions} />
      ) : (
        <Card>
          <CardContent className="py-5 px-5 space-y-4">
            <div className="space-y-2">
              <Label>Question Bank</Label>
              <Select value={bankId} onValueChange={(v) => setBankId(v ?? "")}>
                <SelectTrigger><SelectValue placeholder="Select a bank" /></SelectTrigger>
                <SelectContent>
                  {banks.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name} ({b.question_count} questions)</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loadingBank ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : bankId && bankQuestions.length > 0 ? (
              hasTopics ? (
                <div className="space-y-3">
                  <p className="text-sm font-medium">Questions to draw per topic</p>
                  <div className="space-y-2">
                    {[...topicCounts.entries()].map(([topic, v]) => (
                      <div key={topic} className="flex items-center justify-between gap-3">
                        <Label className="text-sm flex-1">{topic} <span className="text-muted-foreground">({v.available} available)</span></Label>
                        <Input
                          type="number" min={0} max={v.available} className="w-24"
                          value={byTopic[topic] ?? 0}
                          onChange={(e) => setByTopic(prev => ({ ...prev, [topic]: Math.min(v.available, Math.max(0, Number(e.target.value))) }))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 pt-1 flex-wrap">
                    <Badge variant="secondary">Total questions: {stratifiedTotal}</Badge>
                    <Badge variant="secondary">Est. max score: {previewMaxScore.toFixed(1)}</Badge>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                    This bank hasn&apos;t been analyzed yet (no topics tagged) — run Expert Analyze on the bank&apos;s page for a topic-stratified draw. For now, this exam will draw a flat random count from the whole bank.
                  </p>
                  <Label>Total questions to draw</Label>
                  <Input type="number" min={1} max={bankQuestions.length} className="w-32" value={flatTotal} onChange={(e) => setFlatTotal(Math.min(bankQuestions.length, Math.max(1, Number(e.target.value))))} />
                  <Badge variant="secondary">Est. max score: {previewMaxScore.toFixed(1)}</Badge>
                </div>
              )
            ) : bankId ? (
              <p className="text-sm text-muted-foreground">This bank has no questions yet.</p>
            ) : (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Library className="h-4 w-4" /> Pick a bank to configure the draw.
              </div>
            )}

            <div className="flex justify-end pt-1">
              <Button onClick={save} disabled={saving || !bankId} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draw Configuration"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
