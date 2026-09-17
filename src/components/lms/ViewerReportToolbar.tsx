"use client"

import Link from "next/link"
import { ArrowLeft, ChevronRight, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"

// Read-only toolbar for the viewer portal: breadcrumb + print (no admin
// actions, no server-side PDF).
export default function ViewerReportToolbar({ studentName, courseTitle, crumbs, backHref = "/viewer" }: {
  studentName?: string
  courseTitle?: string
  crumbs?: { label: string; href?: string }[]
  backHref?: string
}) {
  const items = crumbs ?? [
    ...(studentName ? [{ label: studentName }] : []),
    ...(courseTitle ? [{ label: courseTitle }] : []),
  ]
  return (
    <div className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 flex-wrap bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-2.5 mb-4">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate-500 min-w-0 flex-wrap">
        <Link href={backHref} aria-label="Back" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /></Link>
        {items.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5 min-w-0">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
            {c.href
              ? <Link href={c.href} className="hover:text-[#1B4F8A] hover:underline truncate max-w-[220px]">{c.label}</Link>
              : <span className="font-medium text-slate-800 truncate max-w-[260px]">{c.label}</span>}
          </span>
        ))}
      </nav>
      <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5 text-xs">
        <Printer className="h-3.5 w-3.5" /> Print / Save as PDF
      </Button>
    </div>
  )
}
