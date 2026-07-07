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
import { Plus, Loader2, Library, FileQuestion, ClipboardList, Settings } from "lucide-react"
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

  async function handleCreate() {
    if (!form.name.trim()) return
    setSaving(true)
    const res = await fetch("/api/question-banks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    setSaving(false)
    if (res.ok) {
      toast.success("Question bank created")
      setDialogOpen(false)
      setForm({ name: "", description: "" })
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? "Failed to create bank")
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
          <DialogTrigger render={<Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2" />}>
            <Plus className="h-4 w-4" /> New Bank
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Create Question Bank</DialogTitle>
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
                <Button onClick={handleCreate} disabled={saving || !form.name.trim()} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create Bank"}
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
                    <Link href={`/question-banks/${bank.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5 ml-auto sm:ml-0")}>
                      <Settings className="h-3.5 w-3.5" /> Manage
                    </Link>
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
