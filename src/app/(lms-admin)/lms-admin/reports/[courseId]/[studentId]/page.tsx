"use client"

import { use, useEffect, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Printer, Download, BrainCircuit, RefreshCw, Loader2,
  CheckCircle2, ShieldAlert,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import type { CourseReport } from "@/lib/lms-course-report"
import StudentCourseReportPages from "@/components/lms/StudentCourseReportPages"

export default function StudentCourseReportView({ params }: { params: Promise<{ courseId: string; studentId: string }> }) {
  const { courseId, studentId } = use(params)
  const [report, setReport] = useState<CourseReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [showOptIn, setShowOptIn] = useState(true)
  const [includeSecurity, setIncludeSecurity] = useState(false)

  useEffect(() => {
    fetch(`/api/lms/reports/student/${studentId}/${courseId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { setReport(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [studentId, courseId])

  async function generateAssessment() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/lms/reports/student/${studentId}/${courseId}/expert-assessment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ includeSecurity }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed to generate"); return }
      // re-fetch so per-module AI is attached server-side
      const fresh = await fetch(`/api/lms/reports/student/${studentId}/${courseId}`).then(r => r.json())
      setReport(fresh)
      toast.success("Expert assessment generated")
    } catch { toast.error("Failed to generate") }
    finally { setGenerating(false) }
  }

  async function downloadPDF() {
    setDownloading(true)
    toast.info("Generating PDF…")
    try {
      const res = await fetch(`/api/lms/reports/student/${studentId}/${courseId}/pdf?includeSecurity=${includeSecurity}`)
      if (!res.ok) { toast.error("PDF generation failed"); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a"); a.href = url
      a.download = `${report?.student.name ?? "Student"} - ${report?.course.title ?? "Course"} - Report.pdf`
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
      toast.success("PDF downloaded")
    } catch { toast.error("Failed to download PDF") }
    finally { setDownloading(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
  if (!report) return (
    <div className="max-w-3xl mx-auto py-16 text-center text-slate-400">
      <p>Report not found for this student.</p>
      <Link href={`/lms-admin/reports/${courseId}`} className="text-sm text-[#1B4F8A] underline mt-3 inline-block">← Back to course report</Link>
    </div>
  )

  const { student, course, assessment } = report

  return (
    <>
      {/* ── Report options popup ── */}
      {showOptIn && (
        <div className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md p-6">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="h-5 w-5 text-[#1B4F8A]" />
              <p className="font-bold text-slate-800 text-base">Report options</p>
            </div>
            <p className="text-sm text-slate-500 mb-4">Choose what to include before viewing the report.</p>
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors">
              <input type="checkbox" checked={includeSecurity} onChange={e => setIncludeSecurity(e.target.checked)} className="mt-0.5 accent-[#1B4F8A]" />
              <div>
                <p className="text-sm font-medium text-slate-700">Include security &amp; integrity analysis</p>
                <p className="text-xs text-slate-400 mt-0.5">Adds the final-exam behavioral events (tab switches, fullscreen exits, right-clicks, copy attempts) and an AI integrity assessment.</p>
              </div>
            </label>
            <div className="flex justify-end gap-2 mt-5">
              <Button size="sm" onClick={() => setShowOptIn(false)} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-1.5">
                <CheckCircle2 className="h-4 w-4" /> View report
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 flex-wrap bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-2.5 mb-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Link href={`/lms-admin/reports/${courseId}`} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
          <span className="font-medium text-slate-800">{student.name}</span>
          <span className="text-slate-300">·</span>
          <span className="truncate max-w-[240px]">{course.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {assessment ? (
            <Button size="sm" variant="outline" onClick={generateAssessment} disabled={generating} className="gap-1.5 text-xs">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Regenerate
            </Button>
          ) : (
            <Button size="sm" onClick={generateAssessment} disabled={generating} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <BrainCircuit className="h-4 w-4" />}
              {generating ? "Generating…" : "Generate Expert Report"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5 text-xs"><Printer className="h-3.5 w-3.5" /> Print</Button>
          <Button size="sm" variant="outline" onClick={downloadPDF} disabled={downloading} className="gap-1.5 text-xs">
            {downloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} PDF
          </Button>
        </div>
      </div>

      {/* ── Report — same component the PDF route and Viewer Portal render,
           so what you see here is exactly what gets downloaded ── */}
      <div style={{ boxShadow: "0 0 0 1px #e2e8f0" }}>
        <StudentCourseReportPages report={report} includeSecurity={includeSecurity} />
      </div>
    </>
  )
}
