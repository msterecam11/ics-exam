"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Plus, Loader2, Library, FileQuestion, ClipboardList, Settings, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface Bank {
  id: string; name: string; description: string | null; created_at: string
  question_count: number; exam_count: number
}

export default function QuestionBanksPage() {
  const [banks, setBanks] = useState<Bank[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Bank | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", description: "" })

  async function load() {
    setLoading(true)
    const res = await fetch("/api/question-banks")
    if (res.ok) setBanks(await res.json())
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  function openCreate() {
    setEditing(null)
    setForm({ name: "", description: "" })
    setDialogOpen(true)
  }

  function openEdit(bank: Bank) {
    setEditing(bank)
    setForm({ name: bank.name, description: bank.description ?? "" })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim()) return
    setSaving(true)
    const url = editing ? `/api/question-banks/${editing.id}` : "/api/question-banks"
    const method = editing ? "PUT" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      toast.success(editing ? "Question bank updated" : "Question bank created")
      setDialogOpen(false)
      setForm({ name: "", description: "" })
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? (editing ? "Failed to update bank" : "Failed to create bank"))
    }
  }

  async function handleDelete(bank: Bank) {
    if (!confirm(`Delete "${bank.name}"? This also deletes all ${bank.question_count} question(s) in it.`)) return
    const res = await fetch(`/api/question-banks/${bank.id}`, { method: "DELETE" })
    if (res.ok) { toast.success("Question bank deleted"); load() }
    else {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Failed to delete bank")
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Question Banks</h2>
          <p className="text-muted-foreground text-sm">Reusable question pools — link an exam to draw a random subset for each candidate</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger render={<Button onClick={openCreate} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2" />}>
            <Plus className="h-4 w-4" /> New Bank
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Question Bank" : "Create Question Bank"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input placeholder="e.g. Aerodrome Ops — Master Bank" value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea placeholder="Optional..." rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving || !form.name.trim()} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save Changes" : "Create Bank"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" /></div>
      ) : banks.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <Library className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">No question banks yet. Create your first one.</p>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {banks.map((bank) => (
            <Card key={bank.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4 px-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{bank.name}</h3>
                    {bank.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{bank.description}</p>}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Badge variant="secondary" className="gap-1"><FileQuestion className="h-3 w-3" /> {bank.question_count} questions</Badge>
                    <Badge variant="secondary" className="gap-1"><ClipboardList className="h-3 w-3" /> {bank.exam_count} exam{bank.exam_count !== 1 ? "s" : ""}</Badge>
                    <div className="flex items-center gap-1 ml-auto sm:ml-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(bank)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-500 hover:text-red-600"
                        onClick={() => handleDelete(bank)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                      <Link href={`/question-banks/${bank.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}>
                        <Settings className="h-3.5 w-3.5" /> Manage
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
