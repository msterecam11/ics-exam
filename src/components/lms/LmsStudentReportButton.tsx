"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  studentId: string
  courseId: string
  studentName: string
  courseTitle: string
}

export default function LmsStudentReportButton({ studentId, courseId, studentName, courseTitle }: Props) {
  const [downloading, setDownloading] = useState(false)

  async function downloadPDF() {
    setDownloading(true)
    toast.info("Generating student report PDF…")
    try {
      const res = await fetch(`/api/lms/reports/student/${studentId}/${courseId}/pdf`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? "PDF generation failed. Please try again.")
        return
      }
      const blob = await res.blob()
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement("a")
      a.href     = url
      const cd   = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)
      a.download  = match ? decodeURIComponent(match[1]) : `${studentName} - ${courseTitle} - Report.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("PDF downloaded")
    } catch {
      toast.error("Failed to download PDF")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex items-center gap-1">
      <Link href={`/print/lms/student/${studentId}/${courseId}`} target="_blank">
        <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title="View report">
          <Eye className="h-4 w-4" />
        </Button>
      </Link>
      <Button
        size="icon"
        variant="ghost"
        className="h-8 w-8 text-[#1B4F8A] hover:bg-blue-50"
        onClick={downloadPDF}
        disabled={downloading}
        title="Download PDF"
      >
        {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </Button>
    </div>
  )
}
