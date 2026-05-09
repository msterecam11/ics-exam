"use client"

import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Sparkles, AlertTriangle } from "lucide-react"

interface Props {
  draft: { ai_scoring_guide: string }
  onChange: (d: any) => void
}

export default function OpenEndedEditor({ draft, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Label>AI Scoring Guide</Label>
        <Badge className="bg-purple-100 text-purple-700 border-0 gap-1 text-xs">
          <Sparkles className="h-3 w-3" /> Groq AI
        </Badge>
      </div>
      <Textarea
        placeholder="Describe what a correct/complete answer looks like. The AI will use this to score the candidate's response.

Example: 'A correct answer should mention: 1) Bernoulli's principle explaining lift, 2) angle of attack, and 3) airfoil shape. Full marks for all three, partial credit for any two.'"
        value={draft.ai_scoring_guide}
        onChange={(e) => onChange((d: any) => ({ ...d, ai_scoring_guide: e.target.value }))}
        rows={5}
      />
      {!draft.ai_scoring_guide?.trim() && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            No guide provided — AI will evaluate based on the question text alone. For better accuracy, describe what a correct answer should include.
          </p>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        The AI (Llama 3.3 70B via Groq) will score the candidate&apos;s answer between 0 and the question&apos;s max points and write a one-sentence justification.
      </p>
    </div>
  )
}
