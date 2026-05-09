"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"
import { Link as LinkIcon } from "lucide-react"

interface Pair { id: string; left_item: string; right_item: string }
interface SubmittedPair { left_id: string; right_id: string }

interface Props {
  question: { matching_pairs: Pair[] }
  value: { pairs: SubmittedPair[] } | undefined
  onChange: (v: { pairs: SubmittedPair[] }) => void
}

export default function MatchingQuestion({ question, value, onChange }: Props) {
  const [leftItems] = useState(() => question.matching_pairs)
  const [rightItems] = useState(() => [...question.matching_pairs].sort(() => Math.random() - 0.5))
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null)
  const [pairs, setPairs] = useState<SubmittedPair[]>(value?.pairs ?? [])

  useEffect(() => {
    if (value?.pairs) setPairs(value.pairs)
  }, [value])

  function isLeftMatched(id: string) { return pairs.some((p) => p.left_id === id) }
  function isRightMatched(id: string) { return pairs.some((p) => p.right_id === id) }
  function getRightMatchedFor(leftId: string) {
    const pair = pairs.find((p) => p.left_id === leftId)
    return pair ? rightItems.find((r) => r.id === pair.right_id) : null
  }

  function handleLeftClick(id: string) {
    if (isLeftMatched(id)) {
      const newPairs = pairs.filter((p) => p.left_id !== id)
      setPairs(newPairs)
      onChange({ pairs: newPairs })
      return
    }
    setSelectedLeft(id)
  }

  function handleRightClick(rightId: string) {
    if (!selectedLeft) return
    if (isRightMatched(rightId)) return

    const newPairs = [...pairs.filter((p) => p.left_id !== selectedLeft), { left_id: selectedLeft, right_id: rightId }]
    setPairs(newPairs)
    onChange({ pairs: newPairs })
    setSelectedLeft(null)
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Click an item on the left, then click its match on the right. Click a matched item to unmatch.
      </p>
      <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
        {/* Left column */}
        <div className="space-y-2">
          {leftItems.map((item) => {
            const matched = isLeftMatched(item.id)
            const matchedWith = getRightMatchedFor(item.id)
            return (
              <button
                key={item.id}
                onClick={() => handleLeftClick(item.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-all",
                  matched ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                    : selectedLeft === item.id ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A]"
                    : "border-border hover:border-[#4B7EC8]"
                )}
              >
                {item.left_item}
                {matched && matchedWith && (
                  <span className="block text-xs text-emerald-600 mt-0.5">→ {matchedWith.right_item}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Arrow */}
        <div className="flex flex-col justify-center gap-2 pt-1">
          {leftItems.map((_, i) => (
            <div key={i} className="h-[42px] flex items-center">
              <LinkIcon className="h-4 w-4 text-muted-foreground/40" />
            </div>
          ))}
        </div>

        {/* Right column (shuffled) */}
        <div className="space-y-2">
          {rightItems.map((item) => {
            const matched = isRightMatched(item.id)
            return (
              <button
                key={item.id}
                onClick={() => handleRightClick(item.id)}
                disabled={matched}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg border-2 text-sm transition-all",
                  matched ? "border-emerald-400 bg-emerald-50 text-emerald-800 cursor-default"
                    : selectedLeft ? "border-[#4B7EC8] hover:border-[#1B4F8A] hover:bg-[#1B4F8A]/5 cursor-pointer"
                    : "border-border cursor-default opacity-60"
                )}
              >
                {item.right_item}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
