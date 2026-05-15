"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Pencil, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface Props {
  exam: any
}

export default function ExamEditModal({ exam }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title          : exam.title ?? "",
    description    : exam.description ?? "",
    duration_minutes: exam.duration_minutes ?? 60,
    passing_score  : exam.passing_score ?? 70,
    password       : exam.password ?? "",
    show_results   : exam.show_results ?? "immediate",
    language       : exam.language ?? "en",
  })

  function set(key: string, value: any) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.title.trim()) { toast.error("Title is required"); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/exams/${exam.id}`, {
        method : "PUT",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify(form),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? "Failed to save")
      }
      toast.success("Exam updated successfully")
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
        <Pencil className="h-4 w-4" /> Edit Exam
      </Button>

      {open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">Edit Exam</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
            </div>

            {/* Form */}
            <div className="p-6 space-y-4">
              {/* Title */}
              <div>
                <label className="text-sm font-medium block mb-1">Exam Title <span className="text-red-500">*</span></label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium block mb-1">Description</label>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 resize-none"
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Duration */}
                <div>
                  <label className="text-sm font-medium block mb-1">Duration (minutes)</label>
                  <input
                    type="number" min={1} max={480}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30"
                    value={form.duration_minutes}
                    onChange={(e) => set("duration_minutes", Number(e.target.value))}
                  />
                </div>

                {/* Passing score */}
                <div>
                  <label className="text-sm font-medium block mb-1">Passing Score (%)</label>
                  <input
                    type="number" min={1} max={100}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30"
                    value={form.passing_score}
                    onChange={(e) => set("passing_score", Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-sm font-medium block mb-1">Access Password</label>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value.toUpperCase())}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Results release */}
                <div>
                  <label className="text-sm font-medium block mb-1">Results Release</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30"
                    value={form.show_results}
                    onChange={(e) => set("show_results", e.target.value)}
                  >
                    <option value="immediate">Immediately</option>
                    <option value="admin_release">Admin Release</option>
                  </select>
                </div>

                {/* Language */}
                <div>
                  <label className="text-sm font-medium block mb-1">Language</label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30"
                    value={form.language}
                    onChange={(e) => set("language", e.target.value)}
                  >
                    <option value="en">English</option>
                    <option value="fr">French</option>
                    <option value="ar">Arabic</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Footer */}
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
                {saving ? "Saving…" : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
