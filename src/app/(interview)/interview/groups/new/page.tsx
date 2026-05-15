"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Loader2 } from "lucide-react"
import { toast } from "sonner"

export default function NewGroupPage() {
  const router = useRouter()
  const [configs, setConfigs] = useState<any[]>([])
  const [form, setForm] = useState({ name: "", config_id: "", location: "", scheduled_date: "" })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch("/api/interview/configs")
      .then(r => r.json())
      .then(d => setConfigs(Array.isArray(d) ? d : []))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.config_id) return
    setLoading(true)

    const res = await fetch("/api/interview/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { toast.error(data.error ?? "Failed to create group"); return }
    toast.success("Group created")
    router.push(`/interview/groups/${data.id}`)
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/interview/groups">
          <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h2 className="text-xl font-bold">New Interview Group</h2>
          <p className="text-sm text-muted-foreground">Set up a cohort session, then add candidates and assessors.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Group Details</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Group Name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. ATC Batch 12 — May 2026"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Assessment Config <span className="text-red-500">*</span></Label>
              {configs.length === 0
                ? <p className="text-sm text-muted-foreground">No configs yet. <Link href="/interview/configs/new" className="text-[#1B4F8A] underline">Create one first.</Link></p>
                : (
                  <select
                    className="w-full border border-input rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-[#1B4F8A]"
                    value={form.config_id}
                    onChange={e => setForm(f => ({ ...f, config_id: e.target.value }))}
                    required
                  >
                    <option value="">Select a config…</option>
                    {configs.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )
              }
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Location <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
                <Input
                  placeholder="e.g. Dubai, Online"
                  value={form.location}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Scheduled Date <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
                <Input
                  type="date"
                  value={form.scheduled_date}
                  onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
              disabled={loading || !form.name.trim() || !form.config_id}
            >
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : "Create Group →"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
