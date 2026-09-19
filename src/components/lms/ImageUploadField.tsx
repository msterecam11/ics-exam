"use client"

import { useRef, useState } from "react"
import { ImagePlus, Loader2, X } from "lucide-react"
import { toast } from "sonner"

// Pick an image from the computer; it uploads straight away and the field keeps its URL.
export default function ImageUploadField({ value, onChange, kind, label = "Image", contain = false }: {
  value: string; onChange: (url: string) => void; kind: "category" | "company"; label?: string; contain?: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function upload(file: File) {
    setBusy(true)
    const fd = new FormData(); fd.append("file", file); fd.append("kind", kind)
    const res = await fetch("/api/lms/uploads/image", { method: "POST", body: fd })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok || !d.url) { toast.error(d.error ?? "Upload failed"); return }
    onChange(d.url)
  }

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <div className="flex items-center gap-3">
        <div className="w-20 h-20 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
          {value
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={value} alt="" className={contain ? "w-full h-full object-contain p-1.5 bg-white" : "w-full h-full object-cover"} />
            : <ImagePlus className="h-6 w-6 text-slate-300" />}
        </div>
        <div className="flex flex-col gap-1.5">
          <button type="button" onClick={() => input.current?.click()} disabled={busy}
            className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 flex items-center gap-2">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} {value ? "Change image" : "Upload image"}
          </button>
          {value && (
            <button type="button" onClick={() => onChange("")} className="h-7 px-2 rounded-lg text-xs text-slate-500 hover:text-red-600 flex items-center gap-1 w-fit">
              <X className="h-3 w-3" /> Remove
            </button>
          )}
          <p className="text-[11px] text-slate-400">JPEG, PNG, WebP, GIF or SVG · max 5 MB</p>
        </div>
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f) }} />
    </div>
  )
}
