"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Printer, Eye } from "lucide-react"
import { toast } from "sonner"

interface Props {
  groupId: string
}

export default function GroupReportButton({ groupId }: Props) {
  function openPrint() {
    const win = window.open(`/print/group/${groupId}?autoprint=1`, "_blank")
    if (!win) {
      toast.error("Pop-up blocked — please allow pop-ups for this site")
      return
    }
    toast.info("Print dialog will open automatically — choose 'Save as PDF'")
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
        onClick={openPrint}
        className="gap-2 border-[#1B4F8A] text-[#1B4F8A] hover:bg-blue-50"
      >
        <Printer className="h-4 w-4" />
        Save as PDF
      </Button>
    </div>
  )
}
