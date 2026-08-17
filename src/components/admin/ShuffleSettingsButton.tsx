"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Shuffle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface Props {
  examId: string
  shuffleQuestions: boolean
  shuffleOptions: boolean
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-[#1B4F8A]" : "bg-slate-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  )
}

export default function ShuffleSettingsButton({ examId, shuffleQuestions, shuffleOptions }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [questions, setQuestions] = useState(shuffleQuestions)
  const [options, setOptions] = useState(shuffleOptions)

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch(`/api/exams/${examId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shuffle_questions: questions, shuffle_options: options }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to save")
      }
      toast.success("Shuffle settings updated")
      setOpen(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
        <Shuffle className="h-4 w-4" /> Shuffle
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">Shuffle Settings</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Shuffle Questions</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Each candidate sees questions in a random order.</p>
                </div>
                <Toggle checked={questions} onChange={setQuestions} />
              </div>

              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">Shuffle Options</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Answer choices are shown in a random order. Turning this off for an
                    Ordering question will show its items already in the correct order.
                  </p>
                </div>
                <Toggle checked={options} onChange={setOptions} />
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
