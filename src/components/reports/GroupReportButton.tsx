"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Download, Loader2, Eye } from "lucide-react"
import { toast } from "sonner"

interface Props {
  groupId: string
}

export default function GroupReportButton({ groupId }: Props) {
  const [downloading, setDownloading] = useState(false)

  async function downloadPDF() {
    setDownloading(true)
    toast.info("Generating PDF… this takes a few seconds")
    try {
      const res = await fetch(`/api/reports/group/${groupId}/pdf`)
      if (!res.ok) throw new Error(await res.text())

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const cd = res.headers.get("Content-Disposition") ?? ""
      const match = cd.match(/filename="(.+)"/)
      a.href = url
      a.download = match?.[1] ?? "group-report.pdf"
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Group report downloaded!")
    } catch {
      toast.error("PDF generation failed — try again")
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
