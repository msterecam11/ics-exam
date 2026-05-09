"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2, GripVertical } from "lucide-react"

interface Item { text: string; correct_position: number }

interface Props {
  draft: { ordering_items: Item[] }
  onChange: (d: any) => void
}

export default function OrderingEditor({ draft, onChange }: Props) {
  function updateItem(i: number, text: string) {
    const items = draft.ordering_items.map((item, idx) =>
      idx === i ? { ...item, text } : item
    )
    onChange((d: any) => ({ ...d, ordering_items: items }))
  }

  function addItem() {
    onChange((d: any) => ({
      ...d,
      ordering_items: [
        ...d.ordering_items,
        { text: "", correct_position: d.ordering_items.length },
      ],
    }))
  }

  function removeItem(i: number) {
    const items = draft.ordering_items
      .filter((_: unknown, idx: number) => idx !== i)
      .map((item: Item, idx: number) => ({ ...item, correct_position: idx }))
    onChange((d: any) => ({ ...d, ordering_items: items }))
  }

  return (
    <div className="space-y-3">
      <Label>Items in correct order (top = first)</Label>
      <p className="text-xs text-muted-foreground">
        Enter items in the correct order. Candidates will receive them shuffled and must drag them into the right sequence.
      </p>
      {draft.ordering_items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}.</span>
          <Input
            placeholder={`Step ${i + 1}`}
            value={item.text}
            onChange={(e) => updateItem(i, e.target.value)}
            className="flex-1"
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600 shrink-0"
            onClick={() => removeItem(i)}
            disabled={draft.ordering_items.length <= 2}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addItem} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Add Item
      </Button>
    </div>
  )
}
