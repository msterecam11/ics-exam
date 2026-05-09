"use client"

import { cn } from "@/lib/utils"
import { CheckCircle2, Circle } from "lucide-react"

interface Props {
  question: { choices: { id: string; text: string }[] }
  value: { choice_id: string } | undefined
  onChange: (v: { choice_id: string }) => void
}

export default function MCQSingleQuestion({ question, value, onChange }: Props) {
  return (
    <div className="space-y-2">
      {question.choices.map((choice) => {
        const selected = value?.choice_id === choice.id
        return (
          <button
            key={choice.id}
            onClick={() => onChange({ choice_id: choice.id })}
            className={cn(
              "w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all",
              selected
                ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A]"
                : "border-border hover:border-[#4B7EC8] hover:bg-slate-50"
            )}
          >
            {selected
              ? <CheckCircle2 className="h-5 w-5 shrink-0 text-[#1B4F8A]" />
              : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
            }
            <span className="text-sm">{choice.text}</span>
          </button>
        )
      })}
    </div>
  )
}
