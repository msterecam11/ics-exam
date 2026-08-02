"use client"

// What the Reference Agent understood — the indexed clauses an agent can
// retrieve, so the scan is inspectable rather than a black box.

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, FileText, Check, ExternalLink, Search } from "lucide-react"

export default function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>()
  const [data, setData] = useState<any>(null)
  const [q, setQ] = useState("")

  const load = useCallback(async () => {
    const d = await fetch(`/api/course-gen/documents/${documentId}`).then(r => r.json())
    setData(d)
  }, [documentId])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!["queued", "scanning"].includes(data?.document?.scan_status)) return
    const t = setInterval(load, 3000)
    return () => clearInterval(t)
  }, [data?.document?.scan_status, load])

  if (!data) {
    return <div className="flex justify-center" style={{ padding: 60 }}>
      <div className="s-spin" style={{ width: 44, height: 44, borderRadius: "50%", border: "4px solid var(--s-line)", borderTopColor: "var(--s-primary)" }} />
    </div>
  }
  if (data.error) return <p className="s-body text-center" style={{ padding: 60 }}>{data.error}</p>

  const doc = data.document
  const sections: any[] = data.sections ?? []
  const filtered = q.trim()
    ? sections.filter(s =>
        [s.clause, s.heading, s.summary, ...(s.topics ?? [])].join(" ").toLowerCase().includes(q.toLowerCase()))
    : sections

  return (
    <div className="s-fade" style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div className="flex items-start gap-4 flex-wrap" style={{ marginBottom: 18 }}>
        <Link href="/studio/library" style={{ color: "var(--s-muted)", marginTop: 6 }}><ArrowLeft className="h-5 w-5" /></Link>
        <div className="flex-1 min-w-0">
          {doc.scan_status === "ready" && (
            <span className="s-pill s-pill-ready" style={{ marginBottom: 8 }}>
              <Check className="h-3 w-3" /> Indexed · {doc.section_count} sections
            </span>
          )}
          <h1 className="s-h1">{doc.title}</h1>
          <p className="s-body" style={{ marginTop: 4 }}>
            {[doc.authority, doc.doc_reference, doc.edition, doc.page_count ? `${doc.page_count} pages` : null]
              .filter(Boolean).join(" · ")}
          </p>
        </div>
        <a href={doc.file_url} target="_blank" rel="noreferrer" className="s-btn s-btn-ghost">
          <ExternalLink className="h-3.5 w-3.5" /> Open PDF
        </a>
      </div>

      {doc.summary?.overview && (
        <div className="s-card" style={{ padding: "16px 18px", marginBottom: 16 }}>
          <p className="s-label" style={{ marginBottom: 7 }}>What this document covers</p>
          <p className="s-body" style={{ lineHeight: 1.65 }}>{doc.summary.overview}</p>
          {doc.summary.top_topics?.length > 0 && (
            <div className="flex gap-1.5 flex-wrap" style={{ marginTop: 12 }}>
              {doc.summary.top_topics.slice(0, 18).map((t: string) => (
                <span key={t} className="s-pill s-pill-neutral" style={{ fontSize: 10.5, padding: "2px 9px" }}>{t}</span>
              ))}
            </div>
          )}
          {doc.summary.requirement_count > 0 && (
            <p className="s-meta" style={{ fontSize: 11.5, marginTop: 10 }}>
              {doc.summary.requirement_count} sections state an obligation (must / shall / is required to).
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-3" style={{ marginBottom: 12 }}>
        <p className="s-label flex-1">Indexed sections</p>
        <div className="relative" style={{ width: 260 }}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--s-muted)" }} />
          <input className="s-input" style={{ paddingLeft: 32 }} placeholder="Filter clauses…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="s-card" style={{ padding: 32, textAlign: "center" }}>
          <p className="s-body">
            {sections.length === 0
              ? doc.scan_status === "ready" ? "No sections were indexed." : "Sections appear here as the scan progresses."
              : "Nothing matches that filter."}
          </p>
        </div>
      ) : (
        <div className="s-card overflow-hidden">
          {filtered.slice(0, 300).map((s, i) => (
            <div key={s.id} className="flex items-start gap-3"
              style={{ padding: "11px 16px", borderBottom: i === filtered.length - 1 ? "none" : "1px solid var(--s-line-soft)" }}>
              <FileText className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--s-muted)", marginTop: 2 }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {s.clause && (
                    <span className="s-pill s-pill-info" style={{ fontSize: 10, padding: "1px 7px", fontFamily: "ui-monospace, monospace" }}>
                      {s.clause}
                    </span>
                  )}
                  <span className="s-h3" style={{ fontSize: 12.5 }}>{s.heading ?? "(untitled section)"}</span>
                  {s.requirement && (
                    <span className="s-pill s-pill-warn" style={{ fontSize: 9.5, padding: "1px 7px" }}>REQUIREMENT</span>
                  )}
                </div>
                {s.summary && <p className="s-body" style={{ fontSize: 12, marginTop: 3 }}>{s.summary}</p>}
                {s.topics?.length > 0 && (
                  <p className="s-meta" style={{ fontSize: 10.5, marginTop: 3 }}>{s.topics.join(" · ")}</p>
                )}
              </div>
              <span className="s-meta shrink-0" style={{ fontSize: 10.5 }}>p.{s.page_from}</span>
            </div>
          ))}
          {filtered.length > 300 && (
            <p className="s-meta" style={{ padding: "10px 16px" }}>Showing the first 300 of {filtered.length}.</p>
          )}
        </div>
      )}
    </div>
  )
}
