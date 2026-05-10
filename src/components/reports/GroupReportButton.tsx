"use client"

import Link from "next/link"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Download, Eye, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  groupId: string
}

export default function GroupReportButton({ groupId }: Props) {
  const [downloading, setDownloading] = useState(false)

  async function downloadPDF() {
    setDownloading(true)
    toast.info("Generating PDF — this may take a few seconds…")
    try {
      const res = await fetch(`/api/reports/group/${groupId}/pdf`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.error ?? "PDF generation failed. Please try again.")
        return
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i)
      a.download = match ? decodeURIComponent(match[1]) : "Group-Report.pdf"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("PDF downloaded successfully")
    } catch {
      toast.error("Failed to download PDF. Please try again.")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Link href={`/reports/group/${groupId}`}>
        <Button size="sm" className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
          <Eye className="h-4 w-4" />
          View Report
        </Button>
      </Link>

      <Button
        size="sm"
        variant="outline"
        onClick={downloadPDF}
        disabled={downloading}
        className="gap-2 border-[#1B4F8A] text-[#1B4F8A] hover:bg-blue-50"
      >
        {downloading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        {downloading ? "Generating…" : "Download PDF"}
      </Button>
    </div>
  )
}
