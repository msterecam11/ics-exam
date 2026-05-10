"use client"

import { useEffect, useState } from "react"
import { GripVertical, ChevronUp, ChevronDown } from "lucide-react"

interface Item { id: string; text: string }

interface Props {
  question: { ordering_items: Item[] }
  value: { order: string[] } | undefined
  onChange: (v: { order: string[] }) => void
}

export default function OrderingQuestion({ question, value, onChange }: Props) {
  const [items, setItems] = useState<Item[]>([])
  const [dragging, setDragging] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  useEffect(() => {
    if (value?.order) {
      const ordered = value.order
        .map((id) => question.ordering_items.find((i) => i.id === id))
        .filter(Boolean) as Item[]
      setItems(ordered)
    } else {
      setItems(question.ordering_items)
    }
  }, [question.ordering_items, value])

  function reorder(from: number, to: number) {
    if (to < 0 || to >= items.length) return
    const reordered = [...items]
    const [moved] = reordered.splice(from, 1)
    reordered.splice(to, 0, moved)
    setItems(reordered)
    onChange({ order: reordered.map((item) => item.id) })
  }

  // ── Desktop drag handlers ──────────────────────────────────────────────────
  function handleDragStart(i: number) { setDragging(i) }
  function handleDragOver(e: React.DragEvent, i: number) { e.preventDefault(); setDragOver(i) }
  function handleDrop(i: number) {
    if (dragging === null || dragging === i) return
    reorder(dragging, i)
    setDragging(null)
    setDragOver(null)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">
        Drag the items into the correct order, or use the arrows on mobile
      </p>
      {items.map((item, i) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={() => handleDrop(i)}
          onDragEnd={() => { setDragging(null); setDragOver(null) }}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all bg-white ${
            dragOver === i ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-border"
          } ${dragging === i ? "opacity-40" : ""}`}
        >
          {/* Drag handle — desktop */}
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block cursor-grab active:cursor-grabbing" />

          {/* Up / Down arrows — mobile */}
          <div className="flex flex-col gap-0.5 sm:hidden shrink-0">
            <button
              type="button"
              onClick={() => reorder(i, i - 1)}
              disabled={i === 0}
              className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
              aria-label="Move up"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => reorder(i, i + 1)}
              disabled={i === items.length - 1}
              className="p-0.5 rounded hover:bg-muted disabled:opacity-30"
              aria-label="Move down"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>

          <span className="w-6 h-6 rounded-full bg-[#1B4F8A] text-white text-xs font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <span className="text-sm flex-1">{item.text}</span>
        </div>
      ))}
    </div>
  )
}
