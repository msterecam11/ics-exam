"use client"

// The generating view from the approved prototype — per-agent status beside
// a live activity log. Every value here is real: agent states are derived
// from the orchestrator's current step, and the log is the rolling history
// the worker records as it advances slide by slide.

interface Props {
  step: string | null
  progress: number
  log: string[]
  courseTitle: string
}

const AGENTS = [
  { key: "orchestrator", name: "Orchestrator", desc: "Job lifecycle · retries · outline gate" },
  { key: "content",      name: "Content Agent", desc: "Writes slide text · grounded in refs" },
  { key: "media",        name: "Media Agent",   desc: "Sources imagery & icons" },
  { key: "layout",       name: "Layout / Compiler", desc: "Places content in theme zones" },
  { key: "qa",           name: "QA / Fact check",  desc: "Overflow · contrast · claims vs cited clause" },
]

/** Map the orchestrator's human step text onto which agent is working. */
function agentState(key: string, step: string | null): "running" | "done" | "idle" {
  const s = (step ?? "").toLowerCase()
  if (key === "orchestrator") return "running"
  const order = ["content", "media", "layout", "qa"]
  // Match on several phrasings so a wording tweak in the orchestrator can
  // never silently freeze every agent at IDLE.
  const current =
    /writing content|content/.test(s) && !/quality/.test(s) ? "content" :
    /sourcing imagery|imagery|media/.test(s) ? "media" :
    /laying out|placing layout|layout|compil/.test(s) ? "layout" :
    // "checking facts" is the factual-QA step; without it here every agent
    // drops to IDLE mid-slide and the panel looks stalled.
    /quality check|qa|review|checking facts|fact/.test(s) ? "qa" : null
  if (!current) return "idle"
  const i = order.indexOf(key), c = order.indexOf(current)
  if (i === c) return "running"
  return i < c ? "done" : "idle"
}

const STATE_PILL: Record<string, string> = {
  running: "s-pill-info",
  done: "s-pill-ready",
  idle: "s-pill-neutral",
}

export default function GeneratingView({ step, progress, log, courseTitle }: Props) {
  return (
    <div className="s-fade" style={{ maxWidth: 1080, margin: "0 auto" }}>
      <div className="text-center" style={{ marginBottom: 26 }}>
        <p className="flex items-center justify-center gap-2" style={{ fontSize: 12, fontWeight: 800, color: "var(--s-primary)", letterSpacing: ".4px" }}>
          <span className="s-pulse" style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--s-primary)" }} />
          GENERATING · this honestly takes a few minutes
        </p>
        <h1 className="s-h1" style={{ marginTop: 10 }}>Building your course</h1>
        <p className="s-body" style={{ marginTop: 6 }}>{step ?? courseTitle}</p>
      </div>

      {/* Overall progress */}
      <div className="s-card" style={{ padding: "18px 22px", marginBottom: 20 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <p className="s-h3">Overall progress</p>
          <p style={{ fontSize: 15, fontWeight: 800, color: "var(--s-primary)" }}>{progress}%</p>
        </div>
        <div style={{ height: 8, borderRadius: 20, background: "var(--s-tint)", overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${Math.max(2, progress)}%`, borderRadius: 20,
            background: "linear-gradient(90deg,#0C72C6,#21B0D4)",
            transition: "width .5s ease",
          }} />
        </div>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
        {/* Agents */}
        <div className="flex flex-col gap-3">
          {AGENTS.map(a => {
            const st = agentState(a.key, step)
            return (
              <div key={a.key} className="s-card flex items-center gap-3" style={{ padding: "14px 16px" }}>
                <span className={st === "running" ? "s-pulse" : ""}
                  style={{
                    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                    background: st === "done" ? "#3FD68C" : st === "running" ? "var(--s-primary)" : "#C7D5E5",
                  }} />
                <div className="flex-1 min-w-0">
                  <p className="s-h3">{a.name}</p>
                  <p className="s-meta" style={{ fontSize: 11.5, marginTop: 1 }}>{a.desc}</p>
                </div>
                <span className={`s-pill ${STATE_PILL[st]}`} style={{ fontSize: 10, padding: "3px 9px" }}>
                  {st.toUpperCase()}
                </span>
              </div>
            )
          })}
        </div>

        {/* Live log */}
        <div style={{ background: "#0B2B45", borderRadius: "var(--s-r)", padding: "16px 18px", minHeight: 300, maxHeight: 420, overflowY: "auto" }}>
          <p style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".6px", color: "#7FA8CE" }}>LIVE LOG</p>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 7 }}>
            {log.length === 0 && (
              <p style={{ fontSize: 12, color: "#7FA8CE", fontFamily: "ui-monospace, monospace" }}>waiting for the first step…</p>
            )}
            {log.map((line, i) => (
              <p key={i} style={{
                fontSize: 12, color: i === log.length - 1 ? "#BFE3F5" : "#8FB4D6",
                fontFamily: "ui-monospace, SFMono-Regular, monospace", lineHeight: 1.5,
              }}>
                <span style={{ color: "#21B0D4" }}>›</span> {line}
              </p>
            ))}
          </div>
        </div>
      </div>

      <p className="s-meta text-center" style={{ marginTop: 20, fontSize: 12 }}>
        QA runs a vision check on each rendered slide — contrast, wrapping and alignment — before the deck reaches you.
      </p>
    </div>
  )
}
