import { CheckCircle2, XCircle, MinusCircle } from "lucide-react"
import ScoreBar from "./ScoreBar"

interface Question {
  id: string
  text: string
  type: string
  score: number
  scoreAchieved: number
}

interface Props {
  title: string
  description: string
  orderIndex: number
  questions: Question[]
  aiInsight?: string
}

function questionIcon(q: Question) {
  if (q.scoreAchieved >= q.score) return <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
  if (q.scoreAchieved > 0) return <MinusCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
  return <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
}

export default function ReportSection({ title, description, orderIndex, questions, aiInsight }: Props) {
  const totalPossible = questions.reduce((s, q) => s + q.score, 0)
  const totalEarned = questions.reduce((s, q) => s + q.scoreAchieved, 0)
  const sectionPct = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0

  return (
    <div className="break-inside-avoid space-y-4">
      {/* Section header */}
      <div className="flex items-start justify-between gap-4 pb-2 border-b-2 border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#1B4F8A] bg-blue-50 px-2 py-0.5 rounded">
              Section {orderIndex + 1}
            </span>
          </div>
          <h3 className="text-base font-bold text-slate-800 mt-1">{title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">{description}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold" style={{
            color: sectionPct >= 80 ? "#10b981" : sectionPct >= 60 ? "#f59e0b" : "#ef4444"
          }}>
            {sectionPct.toFixed(0)}%
          </p>
          <p className="text-xs text-slate-400">{totalEarned.toFixed(1)} / {totalPossible} pts</p>
        </div>
      </div>

      {/* Score bar */}
      <ScoreBar
        label={`${questions.length} question${questions.length !== 1 ? "s" : ""}`}
        score={sectionPct}
        detail={`${totalEarned.toFixed(1)} / ${totalPossible} pts`}
        showPercent={false}
      />

      {/* Question breakdown */}
      <div className="space-y-2">
        {questions.map((q, i) => (
          <div key={q.id} className="flex items-start gap-2.5 py-1.5 border-b border-slate-50 last:border-0">
            {questionIcon(q)}
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-600 line-clamp-2">{q.text}</p>
              <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{q.type.replace(/_/g, " ")}</p>
            </div>
            <div className="shrink-0 text-right">
              <span className="text-xs font-semibold text-slate-700">
                {q.scoreAchieved.toFixed(1)}<span className="text-slate-400 font-normal">/{q.score}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* AI insight */}
      {aiInsight && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider mb-1">AI Insight</p>
          <p className="text-xs text-blue-800 leading-relaxed">{aiInsight}</p>
        </div>
      )}
    </div>
  )
}
