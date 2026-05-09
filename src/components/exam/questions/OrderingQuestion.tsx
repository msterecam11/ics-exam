"use client"

import { useEffect, useState } from "react"
import { GripVertical } from "lucide-react"

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

  function handleDragStart(i: number) {
    setDragging(i)
  }

  function handleDragOver(e: React.DragEvent, i: number) {
    e.preventDefault()
    setDragOver(i)
  }

  function handleDrop(i: number) {
    if (dragging === null || dragging === i) return
    const reordered = [...items]
    const [moved] = reordered.splice(dragging, 1)
    reordered.splice(i, 0, moved)
    setItems(reordered)
    onChange({ order: reordered.map((item) => item.id) })
    setDragging(null)
    setDragOver(null)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground mb-3">Drag the items into the correct order</p>
      {items.map((item, i) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => handleDragStart(i)}
          onDragOver={(e) => handleDragOver(e, i)}
          onDrop={() => handleDrop(i)}
          onDragEnd={() => { setDragging(null); setDragOver(null) }}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-grab active:cursor-grabbing transition-all bg-white ${
            dragOver === i ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-border"
          } ${dragging === i ? "opacity-40" : ""}`}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="w-6 h-6 rounded-full bg-[#1B4F8A] text-white text-xs font-bold flex items-center justify-center shrink-0">
            {i + 1}
          </span>
          <span className="text-sm">{item.text}</span>
        </div>
      ))}
    </div>
  )
}
