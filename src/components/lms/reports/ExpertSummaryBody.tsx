import { SECTION } from "@/components/lms/reports/ReportChrome"

type Assessment = { executive_summary?: string; strengths?: string[]; improvements?: string[]; recommendations?: string[] }

// The body of an "Expert Summary" report page (AI, generated from the report's numbers).
export default function ExpertSummaryBody({ assessment }: { assessment: Assessment }) {
  return (
    <div className="px-12 py-7 space-y-5">
      <div className="avoid-break bg-[#1B4F8A]/5 border border-[#1B4F8A]/10 rounded-xl p-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] mb-2">Executive Summary</p>
        <p className="text-sm text-slate-700 leading-relaxed">{assessment.executive_summary}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 avoid-break">
        <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-wider text-emerald-700 mb-2">Strengths</p>
          {(assessment.strengths ?? []).map((t, i) => <p key={i} className="text-[11px] text-emerald-800 leading-relaxed mb-1.5">· {t}</p>)}
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <p className="text-[9px] font-bold uppercase tracking-wider text-amber-700 mb-2">Areas to improve</p>
          {(assessment.improvements ?? []).map((t, i) => <p key={i} className="text-[11px] text-amber-800 leading-relaxed mb-1.5">· {t}</p>)}
        </div>
      </div>
      <div className="avoid-break">
        <p className={`${SECTION} mb-3`}>Recommendations</p>
        <div className="space-y-2.5">
          {(assessment.recommendations ?? []).map((t, i) => (
            <div key={i} className="flex items-start gap-3 p-3 border border-slate-100 rounded-xl bg-slate-50/80">
              <div className="w-7 h-7 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white text-xs font-bold shrink-0">{i + 1}</div>
              <p className="flex-1 text-xs text-slate-600 leading-relaxed pt-0.5">{t}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
