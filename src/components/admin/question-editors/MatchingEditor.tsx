"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus, Trash2, ArrowRight } from "lucide-react"

interface Pair { left_item: string; right_item: string }

interface Props {
  draft: { matching_pairs: Pair[] }
  onChange: (d: any) => void
}

export default function MatchingEditor({ draft, onChange }: Props) {
  function updatePair(i: number, key: "left_item" | "right_item", val: string) {
    const pairs = [...draft.matching_pairs]
    pairs[i] = { ...pairs[i], [key]: val }
    onChange((d: any) => ({ ...d, matching_pairs: pairs }))
  }

  function addPair() {
    onChange((d: any) => ({
      ...d,
      matching_pairs: [...d.matching_pairs, { left_item: "", right_item: "" }],
    }))
  }

  function removePair(i: number) {
    onChange((d: any) => ({
      ...d,
      matching_pairs: d.matching_pairs.filter((_: unknown, idx: number) => idx !== i),
    }))
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
        <Label>Left Column</Label>
        <span />
        <Label>Right Column (Match)</Label>
        <span />
      </div>
      {draft.matching_pairs.map((pair, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center">
          <Input
            placeholder="Item A"
            value={pair.left_item}
            onChange={(e) => updatePair(i, "left_item", e.target.value)}
          />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Matching item"
            value={pair.right_item}
            onChange={(e) => updatePair(i, "right_item", e.target.value)}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600"
            onClick={() => removePair(i)}
            disabled={draft.matching_pairs.length <= 1}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addPair} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Add Pair
      </Button>
      <p className="text-xs text-muted-foreground">
        Candidates will connect left items to their matching right items. Score is split equally per correct pair.
      </p>
    </div>
  )
}
