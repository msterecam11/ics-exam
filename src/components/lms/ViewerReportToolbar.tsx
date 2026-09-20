"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"

// Read-only toolbar for the viewer portal: a Back button, nothing else.
//
// No print or PDF button either: PDFs of a client's reports are produced and
// sent by ICS, not pulled from the portal.
//
// Deliberately NOT a breadcrumb. A client opens exactly the report they were
// given a link to, and nothing in the chrome should invite them one level up —
// a trail of links advertises reports they may not be granted, and a 404 on
// click tells them those reports exist. One Back button, to the portal.
export default function ViewerReportToolbar({ studentName, courseTitle, crumbs, backHref = "/viewer" }: {
  studentName?: string
  courseTitle?: string
  /** Kept so callers stay unchanged; only the last entry is shown, as plain text. */
  crumbs?: { label: string; href?: string }[]
  backHref?: string
}) {
  const title = crumbs?.length
    ? crumbs[crumbs.length - 1].label
    : [studentName, courseTitle].filter(Boolean).join(" · ")

  return (
    <div className="no-print sticky top-0 z-20 flex items-center justify-between gap-3 flex-wrap bg-white/90 backdrop-blur border-b border-slate-200 px-4 py-2.5 mb-4">
      <div className="flex items-center gap-2 text-sm text-slate-500 min-w-0">
        <Link href={backHref}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-slate-100 text-slate-500 hover:text-slate-800 shrink-0">
          <ArrowLeft className="h-4 w-4" /> <span className="text-xs font-medium">Back</span>
        </Link>
        {title && <span className="font-medium text-slate-800 truncate">{title}</span>}
      </div>
    </div>
  )
}
