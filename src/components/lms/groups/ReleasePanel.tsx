"use client"

import { useCallback, useEffect, useState } from "react"
import { Eye, EyeOff, Loader2, FileText } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Files handed out in class: uploaded as "Hidden until a trainer releases it",
// released here for this group when the class reaches them. Used on the group
// page (Materials) and on each day's attendance screen, so a facilitator can
// release too.

type F = { id: string; title: string; file_name: string; module: string | null; group_only: boolean; everyone: boolean; released: boolean; released_at: string | null; released_by: string | null }

export default function ReleasePanel({ groupId, compact = false }: { groupId: string; compact?: boolean }) {
  const [files, setFiles] = useState<F[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const load = useCallback(async () => {
    const res = await fetch(`/api/lms/materials/release?group_id=${groupId}`)
    const j = await res.json().catch(() => ({}))
    setFiles(res.ok ? j.files ?? [] : [])
  }, [groupId])
  useEffect(() => { load() }, [load])

  async function toggle(f: F) {
    if (f.released && !confirm(`Hide "${f.title}" again? Participants who downloaded it keep their copy.`)) return
    setBusy(f.id)
    const res = await fetch("/api/lms/materials/release", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ material_id: f.id, group_id: groupId, released: !f.released }) })
    setBusy(null)
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? "Could not change it"); return }
    toast.success(f.released ? "Hidden again" : "Released — participants can download it now")
    load()
  }

  if (!files) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>
  if (!files.length) return compact ? null : (
    <p className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">No files to release in class. Upload one with <b>Available: Hidden until a trainer releases it</b> to hand it out at the right moment.</p>
  )
  const left = files.filter(f => !f.released).length

  return (
    <div className="bg-white border border-slate-200 rounded-xl">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-800">Hand out in class</p>
        <p className="text-xs text-slate-500">{left ? `${left} of ${files.length} still hidden.` : "All released."} Release a file when the class reaches it — only this group sees it.</p>
      </div>
      <div className="divide-y divide-slate-100">
        {files.map(f => (
          <div key={f.id} className="flex items-center gap-3 px-4 py-2.5">
            <FileText className={cn("h-4 w-4 shrink-0", f.released ? "text-[#1B4F8A]" : "text-slate-300")} />
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm truncate", f.released ? "text-slate-800" : "text-slate-600")}>{f.title}</p>
              <p className="text-xs text-slate-400 truncate">{[f.module, f.group_only ? "this group only" : null,
                f.everyone ? "released for everyone" : f.released && f.released_at ? `released ${new Date(f.released_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${f.released_by ? ` by ${f.released_by}` : ""}` : "hidden"].filter(Boolean).join(" · ")}</p>
            </div>
            {f.everyone ? <span className="text-xs text-slate-400">Everyone</span> : (
              <Button size="sm" variant={f.released ? "outline" : "default"} disabled={busy === f.id} onClick={() => toggle(f)}
                className={cn("gap-1.5 h-8", !f.released && "bg-emerald-600 hover:bg-emerald-700 text-white")}>
                {busy === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : f.released ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {f.released ? "Hide" : "Release"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
