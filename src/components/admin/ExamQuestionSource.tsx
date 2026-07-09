"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Loader2, Library, PenLine, Shuffle, Plus, X, Wand2 } from "lucide-react"
import { toast } from "sonner"
import QuestionBuilder from "./QuestionBuilder"
import { distributeProportional } from "@/lib/distribute"
import type { Question } from "@/types"

interface Bank { id: string; name: string; question_count: number }
interface BankQuestion { id: string; score: number; topic: string | null }
interface DrawConfig { total?: number; by_topic?: Record<string, number> }
interface BankLink { question_bank_id: string; name?: string; draw_config: DrawConfig }

export default function ExamQuestionSource({
  examId, initialHasBankLink, initialQuestions,
}: {
  examId: string
  initialHasBankLink: boolean
  initialQuestions: Question[]
}) {
  const [mode, setMode] = useState<"manual" | "bank">(initialHasBankLink ? "bank" : "manual")
  const [banks, setBanks] = useState<Bank[]>([])
  const [links, setLinks] = useState<BankLink[]>([])
  const [bankQuestionsById, setBankQuestionsById] = useState<Record<string, BankQuestion[]>>({})
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [saving, setSaving] = useState(false)
  const [distributeInputs, setDistributeInputs] = useState<Record<number, number>>({})

  // Load the bank picker list + this exam's current link set once, on entering bank mode.
  useEffect(() => {
    if (mode !== "bank") return
    fetch("/api/question-banks").then(r => r.ok ? r.json() : []).then(setBanks)

    setLoadingLinks(true)
    fetch(`/api/exams/${examId}/question-banks`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: BankLink[]) => setLinks(rows.length ? rows : [{ question_bank_id: "", draw_config: { total: 10 } }]))
      .finally(() => setLoadingLinks(false))
  }, [mode, examId])

  // Fetch each linked bank's questions (for per-topic counts + score preview) as bank selections change.
  useEffect(() => {
    for (const link of links) {
      if (!link.question_bank_id || bankQuestionsById[link.question_bank_id]) continue
      fetch(`/api/question-banks/${link.question_bank_id}/questions`)
        .then(r => r.ok ? r.json() : [])
        .then((qs: any[]) => setBankQuestionsById(prev => ({
          ...prev,
          [link.question_bank_id]: qs.map(q => ({ id: q.id, score: q.score, topic: q.topic })),
        })))
    }
  }, [links, bankQuestionsById])

  function topicCountsFor(bankId: string) {
    const map = new Map<string, { available: number; avgScore: number }>()
    for (const q of bankQuestionsById[bankId] ?? []) {
      const t = q.topic ?? "Untagged"
      const cur = map.get(t) ?? { available: 0, avgScore: 0 }
      cur.available++
      cur.avgScore += q.score
      map.set(t, cur)
    }
    for (const [, v] of map) v.avgScore = v.available > 0 ? v.avgScore / v.available : 0
    return map
  }

  function updateLink(index: number, patch: Partial<BankLink>) {
    setLinks(prev => prev.map((l, i) => i === index ? { ...l, ...patch } : l))
  }

  // Fills the per-topic inputs proportionally to each topic's available
  // question count (bigger topics get proportionally more), capped so no
  // topic is asked for more than it actually has. The result is just a
  // starting point — every value it fills in stays a normal editable input.
  function handleDistribute(index: number, bankId: string) {
    const total = distributeInputs[index] ?? 0
    if (!total || total <= 0) return toast.error("Enter a number of questions first")

    const topics = topicCountsFor(bankId)
    const topicArr = [...topics.entries()]
      .filter(([t]) => t !== "Untagged")
      .map(([t, v]) => ({ key: t, available: v.available }))

    const result = distributeProportional(total, topicArr)
    const placed = Object.values(result).reduce((s, n) => s + n, 0)

    updateLink(index, { draw_config: { by_topic: result } })

    if (placed < total) {
      toast.warning(`Could only distribute ${placed} of ${total} — not enough tagged questions in this bank.`)
    } else {
      toast.success(`Distributed ${placed} questions across ${topicArr.length} topics`)
    }
  }

  function addBankRow() {
    setLinks(prev => [...prev, { question_bank_id: "", draw_config: { total: 10 } }])
  }

  function removeBankRow(index: number) {
    setLinks(prev => prev.filter((_, i) => i !== index))
  }

  const grandTotal = links.reduce((sum, link) => {
    const cfg = link.draw_config
    if (cfg.by_topic) return sum + Object.values(cfg.by_topic).reduce((s, n) => s + (n || 0), 0)
    return sum + (cfg.total || 0)
  }, 0)

  const grandMaxScore = links.reduce((sum, link) => {
    const qs = bankQuestionsById[link.question_bank_id] ?? []
    const topics = topicCountsFor(link.question_bank_id)
    const cfg = link.draw_config
    if (cfg.by_topic) {
      return sum + [...topics.entries()].reduce((s, [t, v]) => s + (cfg.by_topic![t] ?? 0) * v.avgScore, 0)
    }
    const avg = qs.length ? qs.reduce((s, q) => s + q.score, 0) / qs.length : 0
    return sum + (cfg.total || 0) * avg
  }, 0)

  async function save() {
    const validLinks = links.filter(l => l.question_bank_id)
    if (validLinks.length === 0) return toast.error("Select at least one question bank")

    const ids = validLinks.map(l => l.question_bank_id)
    if (new Set(ids).size !== ids.length) return toast.error("Each bank can only be selected once")

    setSaving(true)
    const res = await fetch(`/api/exams/${examId}/question-banks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banks: validLinks.map(l => ({ question_bank_id: l.question_bank_id, draw_config: l.draw_config })) }),
    })
    setSaving(false)
    if (res.ok) toast.success(validLinks.length > 1 ? "Exam linked to question banks" : "Exam linked to question bank")
    else toast.error("Failed to save")
  }

  async function switchToManual() {
    setSaving(true)
    const res = await fetch(`/api/exams/${examId}/question-banks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banks: [] }),
    })
    setSaving(false)
    if (res.ok) { setMode("manual"); setLinks([]); toast.success("Switched to manual questions") }
    else toast.error("Failed to switch")
  }

  const usedBankIds = new Set(links.map(l => l.question_bank_id).filter(Boolean))

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
          <Shuffle className="h-3.5 w-3.5" /> Draw from Question Bank{links.length > 1 ? "s" : ""}
        </Button>
      </div>

      {mode === "manual" ? (
        <QuestionBuilder examId={examId} initialQuestions={initialQuestions} />
      ) : loadingLinks ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {links.map((link, index) => {
            const bankQuestions = bankQuestionsById[link.question_bank_id] ?? []
            const topics = topicCountsFor(link.question_bank_id)
            const hasTopics = [...topics.keys()].some(t => t !== "Untagged")
            const stratifiedTotal = Object.values(link.draw_config.by_topic ?? {}).reduce((s, n) => s + (n || 0), 0)

            return (
              <Card key={index}>
                <CardContent className="py-5 px-5 space-y-4">
                  <div className="flex items-end gap-2">
                    <div className="flex-1 space-y-2">
                      <Label>Question Bank {links.length > 1 ? `#${index + 1}` : ""}</Label>
                      <Select
                        value={link.question_bank_id}
                        onValueChange={(v) => updateLink(index, { question_bank_id: v ?? "", draw_config: { total: 10 } })}
                      >
                        <SelectTrigger><SelectValue placeholder="Select a bank" /></SelectTrigger>
                        <SelectContent>
                          {banks.filter(b => b.id === link.question_bank_id || !usedBankIds.has(b.id)).map(b => (
                            <SelectItem key={b.id} value={b.id}>{b.name} ({b.question_count} questions)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {link.question_bank_id && hasTopics && (
                      <div className="flex items-end gap-1.5">
                        <div className="space-y-2">
                          <Label className="text-xs text-muted-foreground">Distribute</Label>
                          <Input
                            type="number" min={1} className="w-20"
                            placeholder="30"
                            value={distributeInputs[index] ?? ""}
                            onChange={(e) => setDistributeInputs(prev => ({ ...prev, [index]: Number(e.target.value) }))}
                          />
                        </div>
                        <Button
                          variant="outline" size="sm" className="gap-1.5"
                          onClick={() => handleDistribute(index, link.question_bank_id)}
                          disabled={saving}
                        >
                          <Wand2 className="h-3.5 w-3.5" /> Distribute
                        </Button>
                      </div>
                    )}
                    {links.length > 1 && (
                      <Button variant="outline" size="icon" onClick={() => removeBankRow(index)} disabled={saving}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  {!link.question_bank_id ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Library className="h-4 w-4" /> Pick a bank to configure the draw.
                    </div>
                  ) : bankQuestions.length === 0 ? (
                    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
                  ) : hasTopics ? (
                    <div className="space-y-3">
                      <p className="text-sm font-medium">Questions to draw per topic</p>
                      <div className="space-y-2">
                        {[...topics.entries()].map(([topic, v]) => (
                          <div key={topic} className="flex items-center justify-between gap-3">
                            <Label className="text-sm flex-1">{topic} <span className="text-muted-foreground">({v.available} available)</span></Label>
                            <Input
                              type="number" min={0} max={v.available} className="w-24"
                              value={link.draw_config.by_topic?.[topic] ?? 0}
                              onChange={(e) => updateLink(index, {
                                draw_config: {
                                  by_topic: {
                                    ...link.draw_config.by_topic,
                                    [topic]: Math.min(v.available, Math.max(0, Number(e.target.value))),
                                  },
                                },
                              })}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <Badge variant="secondary">Questions from this bank: {stratifiedTotal}</Badge>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                        This bank hasn&apos;t been analyzed yet (no topics tagged) — run Expert Analyze on the bank&apos;s page for a topic-stratified draw. For now, this exam will draw a flat random count from the whole bank.
                      </p>
                      <Label>Total questions to draw</Label>
                      <Input
                        type="number" min={1} max={bankQuestions.length} className="w-32"
                        value={link.draw_config.total ?? 10}
                        onChange={(e) => updateLink(index, { draw_config: { total: Math.min(bankQuestions.length, Math.max(1, Number(e.target.value))) } })}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}

          <Button variant="outline" size="sm" className="gap-1.5" onClick={addBankRow} disabled={saving}>
            <Plus className="h-3.5 w-3.5" /> Add another bank
          </Button>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">Total questions: {grandTotal}</Badge>
              <Badge variant="secondary">Est. max score: {grandMaxScore.toFixed(1)}</Badge>
            </div>
            <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draw Configuration"}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
