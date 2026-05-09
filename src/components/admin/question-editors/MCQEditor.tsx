"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Plus, Trash2 } from "lucide-react"

interface Choice {
  text: string
  is_correct: boolean
  score: number
}

interface Props {
  draft: { choices: Choice[] }
  onChange: (d: any) => void
  multiAnswer: boolean
}

export default function MCQEditor({ draft, onChange, multiAnswer }: Props) {
  function updateChoice(i: number, key: string, val: unknown) {
    const choices = [...draft.choices]
    if (!multiAnswer && key === "is_correct" && val) {
      // single answer: uncheck all others
      choices.forEach((c, idx) => { choices[idx] = { ...c, is_correct: false } })
    }
    choices[i] = { ...choices[i], [key]: val }
    onChange((d: any) => ({ ...d, choices }))
  }

  function addChoice() {
    onChange((d: any) => ({
      ...d,
      choices: [...d.choices, { text: "", is_correct: false, score: 0 }],
    }))
  }

  function removeChoice(i: number) {
    onChange((d: any) => ({
      ...d,
      choices: d.choices.filter((_: unknown, idx: number) => idx !== i),
    }))
  }

  return (
    <div className="space-y-3">
      <Label>{multiAnswer ? "Choices (check all correct answers)" : "Choices (check the correct answer)"}</Label>
      {draft.choices.map((choice, i) => (
        <div key={i} className="flex items-center gap-2">
          <Checkbox
            checked={choice.is_correct}
            onCheckedChange={(v) => updateChoice(i, "is_correct", !!v)}
            className="shrink-0"
          />
          <Input
            placeholder={`Choice ${i + 1}`}
            value={choice.text}
            onChange={(e) => updateChoice(i, "text", e.target.value)}
            className="flex-1"
          />
          <Input
            type="number"
            min={0}
            step={0.5}
            placeholder="Pts"
            value={choice.score}
            onChange={(e) => updateChoice(i, "score", Number(e.target.value))}
            className="w-20"
            title={multiAnswer ? "Score for this choice" : "Partial score if selected (0 = no credit)"}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-red-500 hover:text-red-600 shrink-0"
            onClick={() => removeChoice(i)}
            disabled={draft.choices.length <= 2}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={addChoice} className="gap-1.5">
        <Plus className="h-3.5 w-3.5" /> Add Choice
      </Button>
      <p className="text-xs text-muted-foreground">
        {multiAnswer
          ? "Assign points to each correct choice. Wrong choices deduct points."
          : "Set the score each choice awards when selected. Correct answer should equal the question total."}
      </p>
    </div>
  )
}
