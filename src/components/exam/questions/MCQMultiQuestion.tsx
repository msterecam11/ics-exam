"use client"

import { cn } from "@/lib/utils"
import { CheckSquare2, Square } from "lucide-react"

interface Props {
  question: { choices: { id: string; text: string }[] }
  value: { choice_ids: string[] } | undefined
  onChange: (v: { choice_ids: string[] }) => void
}

export default function MCQMultiQuestion({ question, value, onChange }: Props) {
  const selected = value?.choice_ids ?? []

  function toggle(id: string) {
    const next = selected.includes(id)
      ? selected.filter((s) => s !== id)
      : [...selected, id]
    onChange({ choice_ids: next })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">Select all that apply</p>
      {question.choices.map((choice) => {
        const checked = selected.includes(choice.id)
        return (
          <button
            key={choice.id}
            onClick={() => toggle(choice.id)}
            className={cn(
              "w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all",
              checked
                ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A]"
                : "border-border hover:border-[#4B7EC8] hover:bg-slate-50"
            )}
          >
            {checked
              ? <CheckSquare2 className="h-5 w-5 shrink-0 text-[#1B4F8A]" />
              : <Square className="h-5 w-5 shrink-0 text-muted-foreground" />
            }
            <span className="text-sm">{choice.text}</span>
          </button>
        )
      })}
    </div>
  )
}
