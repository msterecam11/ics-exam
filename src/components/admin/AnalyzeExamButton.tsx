"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, BrainCircuit, CheckCircle2, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface Props {
  examId: string
  initialAnalysis: { generated_at: string; sections: any[] } | null
  questionCount: number
}

export default function AnalyzeExamButton({ examId, initialAnalysis, questionCount }: Props) {
  const [analysis, setAnalysis] = useState(initialAnalysis)
  const [loading, setLoading] = useState(false)

  const alreadyAnalyzed = !!analysis

  async function handleAnalyze() {
    if (questionCount === 0) {
      toast.error("Add questions to the exam before analyzing")
      return
    }
    setLoading(true)
    const res = await fetch(`/api/exams/${examId}/analyze`, { method: "POST" })
    setLoading(false)
    if (!res.ok) {
      const data = await res.json()
      toast.error(data.error ?? "Analysis failed")
      return
    }
    const data = await res.json()
    setAnalysis(data)
    toast.success(`Exam analyzed — ${data.sections?.length} sections identified`)
  }

  if (alreadyAnalyzed) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          <span className="font-medium">Analyzed</span>
          <span className="text-muted-foreground text-xs">
            · {analysis.sections?.length} sections · {new Date(analysis.generated_at).toLocaleDateString()}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleAnalyze}
          disabled={loading}
        >
          {loading
            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
            : <RefreshCw className="h-3.5 w-3.5" />
          }
          Re-analyze
        </Button>
      </div>
    )
  }

  return (
    <Button
      onClick={handleAnalyze}
      disabled={loading || questionCount === 0}
      className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
    >
      {loading
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : <BrainCircuit className="h-4 w-4" />
      }
      {loading ? "Analyzing…" : "Analyze Exam"}
    </Button>
  )
}
