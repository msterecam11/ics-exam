"use client"

import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Sparkles } from "lucide-react"

interface Props {
  question: { id: string }
  value: { text: string } | undefined
  onChange: (v: { text: string }) => void
}

export default function OpenEndedQuestion({ question, value, onChange }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-purple-100 text-purple-700 border-0 gap-1 text-xs">
          <Sparkles className="h-3 w-3" /> AI-scored
        </Badge>
        <span className="text-xs text-muted-foreground">Your response will be evaluated by AI</span>
      </div>
      <Textarea
        placeholder="Write your answer here..."
        value={value?.text ?? ""}
        onChange={(e) => onChange({ text: e.target.value })}
        rows={6}
        className="resize-none"
      />
      <p className="text-xs text-muted-foreground text-right">
        {(value?.text ?? "").length} characters
      </p>
    </div>
  )
}
