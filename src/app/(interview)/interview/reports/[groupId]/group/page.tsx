"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { Loader2, FileDown, ArrowLeft, Sparkles, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { downloadPdf } from "@/lib/downloadPdf"
import GroupReportCanvas from "@/components/interview/reports/GroupReportCanvas"
import type { CandidateReportData, GroupStatsData } from "@/lib/interview-scoring"

export default function GroupReportPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const [data,         setData]         = useState<any>(null)
  const [aiCache,      setAiCache]      = useState<Record<string, string>>({})
  const [loading,      setLoading]      = useState(true)
  const [generating,   setGenerating]   = useState(false)
  const [downloading,  setDownloading]  = useState(false)

  useEffect(() => {
    Promise.all([
      fetch(`/api/interview/reports/${groupId}`).then(r => r.json().catch(() => ({ error: "Invalid response" }))),
      fetch(`/api/interview/reports/${groupId}/ai-cache`).then(r => r.json().catch(() => ({}))),
    ]).then(([d, cache]) => {
      if (d.error) { toast.error(d.error); return }
      setData(d)
      setAiCache(cache ?? {})
    }).catch(() => toast.error("Failed to load group report"))
      .finally(() => setLoading(false))
  }, [groupId])

  async function generateExpert() {
    setGenerating(true)
    toast.info("Generating Expert Report — please wait 30–60 seconds…")
    try {
      const res    = await fetch(`/api/interview/reports/${groupId}/generate`, { method: "POST" })
      const result = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(result.error ?? "Generation failed"); return }
      toast.success(result.message ?? "Expert Report generated!")
      const cache = await fetch(`/api/interview/reports/${groupId}/ai-cache`).then(r => r.json()).catch(() => ({}))
      setAiCache(cache && typeof cache === "object" && !cache.error ? cache : {})
    } catch (e: any) {
      toast.error("Network error: " + (e?.message ?? "unknown"))
    } finally {
      setGenerating(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-screen bg-slate-100">
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A] mx-auto" />
        <p className="text-sm text-slate-500">Loading report…</p>
      </div>
    </div>
  )
  if (!data) return null

  const { group, candidates, assessors, reports, group_stats, snapshot } = data as {
    group:       any
    candidates:  any[]
    assessors:   any[]
    reports:     CandidateReportData[]
    group_stats: GroupStatsData
    snapshot:    any
  }

  const hasExpert = Object.keys(aiCache).length > 0

  async function savePdf() {
    setDownloading(true)
    toast.info("Generating PDF — please wait…")
    try {
      await downloadPdf(
        `/api/interview/reports/${groupId}/pdf`,
        `Interview Report - Group Report.pdf`,
      )
      toast.success("PDF downloaded!")
    } catch (e: any) {
      toast.error("PDF generation failed: " + (e?.message ?? "unknown"))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-40 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
        <Link href={`/interview/reports/${groupId}`}>
          <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        </Link>
        <div className="flex items-center gap-2">
          {!hasExpert ? (
            <Button size="sm" onClick={generateExpert} disabled={generating}
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {generating ? "Generating…" : "Generate Expert Report"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={generateExpert} disabled={generating} className="gap-2 text-xs">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Regenerate Expert
            </Button>
          )}
          <Button
            size="sm"
            className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
            onClick={savePdf}
            disabled={downloading}
          >
            {downloading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <FileDown className="h-4 w-4" />}
            {downloading ? "Generating…" : "Save as PDF"}
          </Button>
        </div>
      </div>

      {/* ── Report preview ── */}
      <div className="bg-slate-300 min-h-screen py-8 flex justify-center">
        <GroupReportCanvas
          group={group}
          candidates={candidates}
          assessors={assessors}
          reports={reports}
          group_stats={group_stats}
          snapshot={snapshot}
          aiCache={aiCache}
          generating={generating}
          onGenerate={generateExpert}
        />
      </div>
    </>
  )
}
