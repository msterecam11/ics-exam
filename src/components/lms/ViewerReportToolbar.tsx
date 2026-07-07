"use client"

import Link from "next/link"
import { ArrowLeft, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function ViewerReportToolbar({ studentName, courseTitle }: { studentName: string; courseTitle: string }) {
  return (
    <div className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 flex-wrap bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-2.5 mb-4">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Link href="/viewer" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
        <span className="font-medium text-slate-800">{studentName}</span>
        <span className="text-slate-300">·</span>
        <span className="truncate max-w-[240px]">{courseTitle}</span>
      </div>
      <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5 text-xs">
        <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
      </Button>
    </div>
  )
}
