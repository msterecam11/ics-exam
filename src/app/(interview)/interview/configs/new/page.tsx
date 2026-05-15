"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { toast } from "sonner"

export default function NewConfigPage() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setLoading(true)

    const res = await fetch("/api/interview/configs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), description: description.trim() }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      toast.error(data.error ?? "Failed to create config")
      return
    }

    toast.success("Config created")
    router.push(`/interview/configs/${data.id}`)
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/interview/configs">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-xl font-bold">New Assessment Config</h2>
          <p className="text-sm text-muted-foreground">Give it a name, then add pillars and competencies.</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Basic Info</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Config Name <span className="text-red-500">*</span></Label>
              <Input
                placeholder="e.g. ATCO Competency Framework 2025"
                value={name}
                onChange={e => setName(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Description <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Brief description of this framework…"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            <Button
              type="submit"
              className="w-full bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
              disabled={loading || !name.trim()}
            >
              {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating…</> : "Create Config →"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
