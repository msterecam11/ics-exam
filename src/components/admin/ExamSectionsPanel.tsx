"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, Trash2, Pencil, ChevronUp, ChevronDown, Loader2, Layers } from "lucide-react"
import { toast } from "sonner"
import type { ExamSection } from "@/types"

interface Props {
  examId: string
  sections: ExamSection[]
  onChange: (sections: ExamSection[]) => void
}

export default function ExamSectionsPanel({ examId, sections, onChange }: Props) {
  const [open, setOpen] = useState(sections.length > 0)
  const [editing, setEditing] = useState<ExamSection | null>(null)
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  function startCreate() {
    setEditing(null)
    setTitle("")
    setDescription("")
    setCreating(true)
  }

  function startEdit(s: ExamSection) {
    setCreating(false)
    setEditing(s)
    setTitle(s.title)
    setDescription(s.description ?? "")
  }

  function cancel() {
    setCreating(false)
    setEditing(null)
  }

  async function handleSave() {
    if (!title.trim()) { toast.error("Section title is required"); return }
    setSaving(true)
    try {
      if (editing) {
        const res = await fetch(`/api/exams/${examId}/sections/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Failed to update section")
        onChange(sections.map((s) => (s.id === data.id ? data : s)))
        toast.success("Section updated")
      } else {
        const res = await fetch(`/api/exams/${examId}/sections`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description, order_index: sections.length }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Failed to create section")
        onChange([...sections, data])
        toast.success("Section added")
      }
      cancel()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save section")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this section? Its questions stay — they just go back to \"No section\".")) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/exams/${examId}/sections/${id}`, { method: "DELETE" })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error ?? "Failed to delete") }
      onChange(sections.filter((s) => s.id !== id))
      toast.success("Section deleted")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete section")
    } finally {
      setBusyId(null)
    }
  }

  async function move(id: string, direction: -1 | 1) {
    const idx = sections.findIndex((s) => s.id === id)
    const swapIdx = idx + direction
    if (idx === -1 || swapIdx < 0 || swapIdx >= sections.length) return

    const reordered = [...sections]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    const withIndices = reordered.map((s, i) => ({ ...s, order_index: i }))
    onChange(withIndices)

    await fetch(`/api/exams/${examId}/sections`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sections: withIndices.map((s) => ({ id: s.id, order_index: s.order_index })) }),
    })
  }

  return (
    <Card>
      <CardContent className="py-4 px-4">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold w-full text-left"
        >
          <Layers className="h-4 w-4 text-[#1B4F8A]" />
          Sections {sections.length > 0 && <span className="text-muted-foreground font-normal">({sections.length})</span>}
          <span className="ml-auto text-xs text-muted-foreground font-normal">{open ? "Hide" : "Show"}</span>
        </button>

        {open && (
          <div className="mt-3 space-y-2">
            <p className="text-xs text-muted-foreground">
              Optional — group questions into named parts (e.g. "Regulatory Framework"). Leave a question unassigned and it just stays ungrouped, same as today.
            </p>

            {sections.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                <div className="flex flex-col">
                  <button type="button" disabled={i === 0} onClick={() => move(s.id, -1)} className="disabled:opacity-20 hover:text-[#1B4F8A]">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" disabled={i === sections.length - 1} onClick={() => move(s.id, 1)} className="disabled:opacity-20 hover:text-[#1B4F8A]">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.title}</p>
                  {s.description && <p className="text-xs text-muted-foreground truncate">{s.description}</p>}
                </div>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(s)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600"
                  disabled={busyId === s.id}
                  onClick={() => handleDelete(s.id)}
                >
                  {busyId === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}

            {(creating || editing) ? (
              <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                <div className="space-y-1">
                  <Label className="text-xs">Title *</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Regulatory Framework" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="Shown to candidates when they reach this section" />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={cancel}>Cancel</Button>
                  <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-1.5">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                    {editing ? "Save" : "Add Section"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={startCreate} className="gap-1.5 text-xs h-8">
                <Plus className="h-3 w-3" /> Add Section
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
