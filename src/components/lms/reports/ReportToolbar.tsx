"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronRight, Download, FileSpreadsheet, Loader2, Printer, RefreshCw, BrainCircuit, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

// Toolbar for the paged reports (RP-2 breadcrumb, RP-15 exports, RP-16
// client-ready PDF options, RP-18 last updated + refresh).
export default function ReportToolbar({
  crumbs, builtAt, refreshHref, pdfHref, pdfName, excelHref, aiEndpoint, hasAi, clientPdf = true, children,
}: {
  crumbs: { label: string; href?: string }[]
  builtAt?: string | null
  refreshHref?: string
  pdfHref: string
  pdfName: string
  excelHref?: string
  aiEndpoint?: string
  hasAi?: boolean
  /** Offer the client-ready variant (cover with client logo, internal notes left out). */
  clientPdf?: boolean
  children?: React.ReactNode
}) {
  const router = useRouter()
  const [dialog, setDialog] = useState(false)
  const [audience, setAudience] = useState<"client" | "internal">(clientPdf ? "client" : "internal")
  const [includeComments, setIncludeComments] = useState(false)
  const [includeInternal, setIncludeInternal] = useState(false)
  const [busy, setBusy] = useState<"" | "pdf" | "xlsx" | "ai">("")

  async function download(href: string, name: string, kind: "pdf" | "xlsx") {
    setBusy(kind)
    if (kind === "pdf") toast.info("Generating PDF, this can take a few seconds…")
    try {
      const res = await fetch(href)
      if (!res.ok) { const d = await res.json().catch(() => ({})); toast.error(d.error ?? "Export failed"); return }
      const blob = await res.blob(); const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url; a.download = name
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      toast.success(kind === "pdf" ? "PDF downloaded" : "Excel downloaded")
    } catch { toast.error("Export failed") }
    finally { setBusy("") }
  }

  function pdf() {
    const q = new URLSearchParams()
    q.set("audience", audience)
    if (audience === "client") {
      if (includeComments) q.set("comments", "1")
      if (includeInternal) q.set("internal", "1")
    }
    setDialog(false)
    download(`${pdfHref}${pdfHref.includes("?") ? "&" : "?"}${q}`, pdfName.replace(/\.pdf$/, audience === "client" ? " (client).pdf" : ".pdf"), "pdf")
  }

  async function generate() {
    if (!aiEndpoint) return
    setBusy("ai")
    try {
      const res = await fetch(aiEndpoint, { method: "POST" })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? "Could not generate"); return }
      toast.success("Expert summary generated"); router.refresh()
    } catch { toast.error("Could not generate") }
    finally { setBusy("") }
  }

  return (
    <>
      <div className="no-print sticky top-0 z-20 bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-2.5 mb-4 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-sm text-slate-500 min-w-0 flex-wrap">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1 min-w-0">
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                {c.href ? <Link href={c.href} className="hover:text-[#1B4F8A] hover:underline truncate max-w-[220px]">{c.label}</Link>
                  : <span className="font-medium text-slate-800 truncate max-w-[260px]">{c.label}</span>}
              </span>
            ))}
          </nav>
          <div className="flex items-center gap-2 flex-wrap">
            {aiEndpoint && (
              <Button size="sm" variant={hasAi ? "outline" : "default"} onClick={generate} disabled={busy === "ai"}
                className={hasAi ? "gap-1.5 text-xs" : "gap-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white"}>
                {busy === "ai" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : hasAi ? <RefreshCw className="h-3.5 w-3.5" /> : <BrainCircuit className="h-3.5 w-3.5" />}
                {hasAi ? "Regenerate summary" : "Expert summary"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5 text-xs"><Printer className="h-3.5 w-3.5" /> Print</Button>
            {excelHref && (
              <Button size="sm" variant="outline" onClick={() => download(excelHref, pdfName.replace(/\.pdf$/, ".xlsx"), "xlsx")} disabled={busy === "xlsx"} className="gap-1.5 text-xs">
                {busy === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Excel
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => clientPdf ? setDialog(true) : download(`${pdfHref}${pdfHref.includes("?") ? "&" : "?"}audience=internal`, pdfName, "pdf")} disabled={busy === "pdf"} className="gap-1.5 text-xs">
              {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
            </Button>
          </div>
        </div>
        {(children || builtAt) && (
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">{children}</div>
            {builtAt && (
              <p className="text-[11px] text-slate-400">
                Updated {new Date(builtAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                {refreshHref && <> · <a href={refreshHref} className="text-[#1B4F8A] hover:underline">Refresh</a></>}
              </p>
            )}
          </div>
        )}
      </div>

      {dialog && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={e => e.target === e.currentTarget && setDialog(false)}>
          <div role="dialog" aria-modal="true" aria-label="PDF options" className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <p className="font-bold text-slate-800">Download PDF</p>
              <button onClick={() => setDialog(false)} aria-label="Close" className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"><X className="h-4 w-4" /></button>
            </div>
            {([
              ["client", "Client-ready", "Cover with the client's logo, summary, track results and student list. Internal notes (students needing support, expert summary) are left out."],
              ["internal", "Internal", "Everything, including students needing support, the expert summary and all comments."],
            ] as const).map(([v, label, hint]) => (
              <label key={v} className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer ${audience === v ? "border-[#1B4F8A] bg-[#1B4F8A]/5" : "border-slate-200 hover:bg-slate-50"}`}>
                <input type="radio" name="audience" checked={audience === v} onChange={() => setAudience(v)} className="mt-0.5 accent-[#1B4F8A]" />
                <span><span className="text-sm font-medium text-slate-800">{label}</span><span className="block text-xs text-slate-500 mt-0.5">{hint}</span></span>
              </label>
            ))}
            {audience === "client" && (
              <div className="space-y-2 pl-1">
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={includeComments} onChange={e => setIncludeComments(e.target.checked)} className="mt-1 accent-[#1B4F8A]" />
                  <span>Include feedback comments<span className="block text-xs text-slate-400">Otherwise comments appear only when every answer was anonymous. Breakdowns always need 3+ responses.</span></span>
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={includeInternal} onChange={e => setIncludeInternal(e.target.checked)} className="mt-1 accent-[#1B4F8A]" />
                  <span>Include internal notes<span className="block text-xs text-slate-400">Students needing support and the expert summary.</span></span>
                </label>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setDialog(false)}>Cancel</Button>
              <Button size="sm" onClick={pdf} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-1.5"><Download className="h-3.5 w-3.5" /> Download</Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
