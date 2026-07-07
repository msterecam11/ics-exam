"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Loader2, RefreshCw, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

interface Section { title: string; question_ids: string[] }
interface Analysis { sections: Section[]; generated_at: string }

export default function BankAnalyzePanel({ bankId, questionCount }: { bankId: string; questionCount: number }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)

  useEffect(() => {
    fetch(`/api/question-banks/${bankId}/analyze`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setAnalysis(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [bankId])

  async function runAnalyze() {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/question-banks/${bankId}/analyze`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Analysis failed"); return }
      setAnalysis(data)
      toast.success("Bank analyzed — topics tagged")
    } catch {
      toast.error("Analysis failed")
    } finally {
      setAnalyzing(false)
    }
  }

  const taggedCount = analysis?.sections.reduce((s, sec) => s + sec.question_ids.length, 0) ?? 0

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <Card>
      <CardContent className="py-4 px-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-purple-600" />
            </div>
            <div>
              <p className="text-sm font-semibold">Expert Analyze</p>
              <p className="text-xs text-muted-foreground">
                {analysis
                  ? `${analysis.sections.length} topics · ${taggedCount}/${questionCount} questions tagged`
                  : "Tags every question with a topic — required for the exam draw config and topic reports"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={runAnalyze}
            disabled={analyzing || questionCount === 0}
            className={analysis ? "" : "bg-purple-600 hover:bg-purple-700 text-white"}
            variant={analysis ? "outline" : "default"}
          >
            {analyzing
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> Analyzing…</>
              : analysis
                ? <><RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Re-analyze</>
                : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Analyze Bank</>
            }
          </Button>
        </div>

        {analysis && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {analysis.sections.map((s, i) => (
              <Badge key={i} variant="secondary" className="gap-1 text-xs font-normal">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" /> {s.title} ({s.question_ids.length})
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
