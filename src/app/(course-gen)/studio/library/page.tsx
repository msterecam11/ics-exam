"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  Library, Plus, Loader2, FileText, Check, AlertTriangle,
  ScanLine, X, Upload, ChevronRight, RefreshCw,
} from "lucide-react"

const SCAN_PILL: Record<string, { label: string; cls: string }> = {
  uploaded: { label: "Uploaded",  cls: "s-pill-neutral" },
  queued:   { label: "Queued",    cls: "s-pill-info" },
  scanning: { label: "Scanning",  cls: "s-pill-info" },
  ready:    { label: "Indexed",   cls: "s-pill-ready" },
  failed:   { label: "Failed",    cls: "s-pill-danger" },
}

export default function StudioLibraryPage() {
  const [docs, setDocs] = useState<any[] | null>(null)
  const [ocrAvailable, setOcrAvailable] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const d = await fetch("/api/course-gen/documents").then(r => r.json()).catch(() => ({ documents: [] }))
    setDocs(d.documents ?? [])
    setOcrAvailable(d.ocr_available !== false)
  }, [])

  useEffect(() => { load() }, [load])

  // Poll while anything is scanning — a 300-page regulation takes a while.
  useEffect(() => {
    if (!docs?.some(d => ["queued", "scanning"].includes(d.scan_status))) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [docs, load])

  if (docs === null) {
    return <div className="flex justify-center" style={{ padding: 60 }}>
      <div className="s-spin" style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid var(--s-line)", borderTopColor: "var(--s-primary)" }} />
    </div>
  }

  const indexed = docs.filter(d => d.scan_status === "ready")
  const sections = indexed.reduce((s, d) => s + (d.section_count ?? 0), 0)

  return (
    <div className="s-fade" style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div className="flex items-start gap-4 flex-wrap" style={{ marginBottom: 20 }}>
        <div className="flex-1 min-w-0">
          <h1 className="s-h1">Reference Library</h1>
          <p className="s-body" style={{ marginTop: 4, maxWidth: 760 }}>
            Regulations and manuals are scanned <strong>once</strong> and reused by every course that selects them.
            The Reference Agent reads each document end to end, splits it into clauses, and indexes what each one covers —
            so agents can cite the right clause instead of skimming the opening pages.
          </p>
        </div>
        <button className="s-btn s-btn-primary" onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add document
        </button>
      </div>

      {docs.length > 0 && (
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", marginBottom: 20 }}>
          <Stat label="Documents" value={docs.length} />
          <Stat label="Indexed" value={indexed.length} sub={indexed.length < docs.length ? `${docs.length - indexed.length} pending` : "all ready"} />
          <Stat label="Sections indexed" value={sections.toLocaleString()} />
          <Stat label="Pages read" value={indexed.reduce((s, d) => s + (d.page_count ?? 0), 0).toLocaleString()} />
        </div>
      )}

      {docs.length === 0 ? (
        <div className="s-card flex flex-col items-center text-center"
          style={{ padding: "52px 30px", borderStyle: "dashed", borderColor: "#A9CFF0" }}>
          <Library className="h-7 w-7" style={{ color: "var(--s-primary)" }} />
          <p className="s-h2" style={{ marginTop: 14 }}>No documents yet</p>
          <p className="s-body" style={{ marginTop: 6, maxWidth: 460 }}>
            Add GACAR, GACA, ICAO Annexes or your own manuals. Each one is scanned once — after that every course can
            draw on it, and generated content can cite it precisely.
          </p>
          <button className="s-btn s-btn-primary" style={{ marginTop: 18 }} onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add your first document
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {docs.map(d => <DocumentRow key={d.id} doc={d} ocrAvailable={ocrAvailable} onChange={load} />)}
        </div>
      )}

      {adding && <AddDocumentDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); load() }} />}
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="s-card" style={{ padding: "14px 16px" }}>
      <p className="s-meta" style={{ fontSize: 12 }}>{label}</p>
      <p style={{ fontSize: 24, fontWeight: 800, color: "var(--s-ink)", lineHeight: 1.2, marginTop: 2 }}>{value}</p>
      {sub && <p className="s-meta" style={{ fontSize: 11, marginTop: 2 }}>{sub}</p>}
    </div>
  )
}

function DocumentRow({ doc, ocrAvailable, onChange }: { doc: any; ocrAvailable: boolean; onChange: () => void }) {
  const pill = SCAN_PILL[doc.scan_status] ?? SCAN_PILL.uploaded
  const scanning = ["queued", "scanning"].includes(doc.scan_status)
  // "Needs OCR" only while it still does; once the scan succeeded those pages
  // were read, so the pill says so instead of nagging.
  const scannedPdf = doc.text_status === "needs_ocr" || doc.text_status === "partial"
  const wasOcrd = scannedPdf && doc.scan_status === "ready"
  const needsOcr = scannedPdf && !wasOcrd && !ocrAvailable

  async function rescan() {
    const res = await fetch(`/api/course-gen/documents/${doc.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rescan: true }),
    })
    if (!res.ok) { toast.error("Could not re-queue the scan"); return }
    toast.success("Re-scanning"); onChange()
  }

  async function remove() {
    if (!confirm(`Remove "${doc.title}" from the library?`)) return
    const res = await fetch(`/api/course-gen/documents/${doc.id}`, { method: "DELETE" })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      toast.error(e.error ?? "Could not delete"); return
    }
    toast.success("Document removed"); onChange()
  }

  return (
    <div className="s-card" style={{ padding: "14px 18px" }}>
      <div className="flex items-start gap-3">
        <span className="shrink-0 flex items-center justify-center"
          style={{ width: 36, height: 36, borderRadius: 9, background: "var(--s-tint)" }}>
          <FileText className="h-4 w-4" style={{ color: "var(--s-primary)" }} />
        </span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link href={`/studio/library/${doc.id}`} className="s-h3 truncate">{doc.title}</Link>
            <span className={`s-pill ${pill.cls}`} style={{ fontSize: 10, padding: "2px 8px" }}>
              {scanning && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              {doc.scan_status === "ready" && <Check className="h-2.5 w-2.5" />}
              {pill.label}
            </span>
            {needsOcr && (
              <span className="s-pill s-pill-warn" style={{ fontSize: 10, padding: "2px 8px" }}>
                <ScanLine className="h-2.5 w-2.5" /> Needs OCR
              </span>
            )}
            {wasOcrd && (
              <span className="s-pill s-pill-info" style={{ fontSize: 10, padding: "2px 8px" }}>
                <ScanLine className="h-2.5 w-2.5" /> OCR{"’"}d {doc.ocr_pages ?? 0} page{doc.ocr_pages === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <p className="s-meta" style={{ fontSize: 11.5, marginTop: 3 }}>
            {[doc.authority, doc.doc_reference, doc.edition,
              doc.page_count ? `${doc.page_count} pages` : null,
              doc.section_count ? `${doc.section_count} sections` : null,
              doc.used_by ? `used by ${doc.used_by} course${doc.used_by === 1 ? "" : "s"}` : null,
            ].filter(Boolean).join(" · ") || doc.file_name}
          </p>

          {scanning && (
            <div style={{ marginTop: 9 }}>
              <div style={{ height: 5, borderRadius: 20, background: "var(--s-tint)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", width: `${Math.max(3, doc.scan_progress ?? 0)}%`, borderRadius: 20,
                  background: "linear-gradient(90deg,#0C72C6,#21B0D4)", transition: "width .6s ease",
                }} />
              </div>
              <p className="s-meta" style={{ fontSize: 11, marginTop: 5 }}>
                {doc.scan_step ?? "Working…"} · {doc.scan_progress ?? 0}%
              </p>
            </div>
          )}

          {doc.scan_status === "failed" && (
            <p style={{ fontSize: 11.5, color: "#C05252", marginTop: 6, lineHeight: 1.5 }}>
              <AlertTriangle className="h-3 w-3 inline mr-1" />
              {doc.scan_error ?? "Scan failed."}
              {scannedPdf && !ocrAvailable && " Set GOOGLE_VISION_API_KEY to enable OCR, then rescan — or upload a text-based version."}
            </p>
          )}

          {doc.scan_status === "ready" && doc.summary?.overview && (
            <p className="s-body" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.55 }}>
              {doc.summary.overview}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!scanning && (
            <button onClick={rescan} title="Re-scan" className="s-btn s-btn-ghost" style={{ padding: 7 }}>
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          )}
          <Link href={`/studio/library/${doc.id}`} className="s-btn s-btn-ghost" style={{ padding: 7 }} title="Open">
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
          <button onClick={remove} title="Remove" className="s-btn s-btn-ghost" style={{ padding: 7 }}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function AddDocumentDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState("")
  const [authority, setAuthority] = useState("")
  const [reference, setReference] = useState("")
  const [edition, setEdition] = useState("")
  const [language, setLanguage] = useState("en")
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function submit() {
    if (!file) { toast.error("Choose a PDF first"); return }
    setBusy(true)
    const fd = new FormData()
    fd.append("file", file)
    if (title.trim()) fd.append("title", title.trim())
    if (authority.trim()) fd.append("authority", authority.trim())
    if (reference.trim()) fd.append("doc_reference", reference.trim())
    if (edition.trim()) fd.append("edition", edition.trim())
    fd.append("language", language)

    const res = await fetch("/api/course-gen/documents", { method: "POST", body: fd })
    setBusy(false)
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      toast.error(e.error ?? "Upload failed"); return
    }
    toast.success("Added — scanning has started in the background")
    onDone()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(11,43,69,.55)" }} onClick={onClose}>
      <div className="s-card s-fade" style={{ maxWidth: 560, width: "100%", padding: 22 }} onClick={e => e.stopPropagation()}>
        <p className="s-h2">Add a document</p>
        <p className="s-body" style={{ marginTop: 6, lineHeight: 1.6 }}>
          The Reference Agent reads it once, end to end — however long that takes — and indexes every clause.
          Courses then select it, and generated slides can cite it exactly.
        </p>

        <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden"
          onChange={e => {
            const f = e.target.files?.[0] ?? null
            setFile(f)
            if (f && !title.trim()) setTitle(f.name.replace(/\.pdf$/i, ""))
          }} />

        <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center gap-2 w-full"
          style={{ border: "1.5px dashed #A9CFF0", borderRadius: 8, padding: "20px 12px", marginTop: 16, fontSize: 12.5, color: "var(--s-body-2)" }}>
          <Upload className="h-4 w-4" />
          {file ? file.name : "Choose a PDF…"}
        </button>

        <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 14 }}>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="s-label block">Title</label>
            <input className="s-input" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Aerodrome Certification Regulations" />
          </div>
          <div>
            <label className="s-label block">Authority</label>
            <input className="s-input" value={authority} onChange={e => setAuthority(e.target.value)} placeholder="GACA · ICAO · IATA" />
          </div>
          <div>
            <label className="s-label block">Reference</label>
            <input className="s-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="GACAR Part-139" />
          </div>
          <div>
            <label className="s-label block">Edition</label>
            <input className="s-input" value={edition} onChange={e => setEdition(e.target.value)} placeholder="Rev 4, 2024" />
          </div>
          <div>
            <label className="s-label block">Language</label>
            <select className="s-input" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="en">English</option>
              <option value="ar">Arabic</option>
            </select>
          </div>
        </div>

        <p className="s-meta" style={{ fontSize: 11, marginTop: 12, lineHeight: 1.5 }}>
          Reference and authority are optional, but they become the citation shown on generated slides — worth filling in.
        </p>

        <div className="flex gap-2" style={{ marginTop: 16 }}>
          <button className="s-btn s-btn-primary flex-1" onClick={submit} disabled={busy || !file}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Add &amp; scan
          </button>
          <button className="s-btn s-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
