"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react"
import dynamic from "next/dynamic"

const CandidateReportCanvas = dynamic(
  () => import("@/components/interview/reports/CandidateReportCanvas"),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
    </div>
  )}
)

export default function ViewerCandidateReportPage() {
  const { groupId, candidateId } = useParams<{ groupId: string; candidateId: string }>()
  const router = useRouter()

  const [data,    setData]    = useState<any>(null)
  const [aiCache, setAiCache] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/viewer/interview-report/${groupId}/${candidateId}`).then(r => r.json()),
      fetch(`/api/interview/reports/${groupId}/ai-cache?candidate_id=${candidateId}`).then(r => r.json().catch(() => ({}))),
    ])
      .then(([d, cache]) => {
        if (d.error) { setError(d.error); return }
        setData(d)
        setAiCache(cache ?? {})
      })
      .catch(() => setError("Failed to load report"))
      .finally(() => setLoading(false))
  }, [groupId, candidateId])

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Back bar */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-3 shadow-sm">
        <button
          onClick={() => router.push("/viewer")}
          className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
        {data?.candidate && (
          <span className="text-slate-300 select-none">·</span>
        )}
        {data?.candidate && (
          <span className="text-sm text-slate-500">{data.candidate.full_name}</span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-500" />
        </div>
      ) : error || !data ? (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <AlertCircle className="h-8 w-8 text-red-400" />
          <p className="text-slate-600 text-sm">{error ?? "Report not available"}</p>
          <button
            onClick={() => router.push("/viewer")}
            className="text-sm font-medium text-indigo-600 hover:underline">
            Return to Dashboard
          </button>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
          <CandidateReportCanvas
            group={data.group}
            candidate={data.candidate}
            assessors={data.assessors}
            assessor_pillar_weights={data.assessor_pillar_weights}
            snapshot={data.snapshot}
            report={data.report}
            aiCache={aiCache}
          />
        </div>
      )}
    </div>
  )
}
