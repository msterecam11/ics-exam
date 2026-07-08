"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Pencil, Trash2, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function BankHeaderActions({
  bankId, name, description,
}: {
  bankId: string
  name: string
  description: string | null
}) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [form, setForm] = useState({ name, description: description ?? "" })

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    const res = await fetch(`/api/question-banks/${bankId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Question bank updated")
      setDialogOpen(false)
      router.refresh()
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Failed to update bank")
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${name}"? This also deletes every question in it.`)) return
    setDeleting(true)
    const res = await fetch(`/api/question-banks/${bankId}`, { method: "DELETE" })
    setDeleting(false)
    if (res.ok) {
      toast.success("Question bank deleted")
      router.push("/question-banks")
    } else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Failed to delete bank")
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" />}>
          <Pencil className="h-3.5 w-3.5" />
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Question Bank</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-red-500 hover:text-red-600"
        onClick={handleDelete}
        disabled={deleting}
      >
        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>
    </div>
  )
}
