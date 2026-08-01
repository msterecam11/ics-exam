"use client"

// Module-scoped AI chat. The agent already knows this module's content, so
// instructions can be about meaning ("this module is too text-heavy, split
// slide 3") rather than mechanics. Small safe edits apply immediately;
// anything structural or destructive comes back as a proposal the user
// previews and approves.

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Sparkles, Send, Loader2, Check, X, AlertTriangle } from "lucide-react"
import type { CanvasElement } from "@/lib/course-gen/primitives"

interface Msg { role: "user" | "assistant"; content: string }

export interface Proposal {
  summary: string
  ops: any[]
  warnings: string[]
  compiled: Record<string, CanvasElement[]>
  auto_applied: boolean
}

interface Props {
  moduleId: string
  openPageIndex: number
  /** Apply the agent's ops locally so the change is visible immediately. */
  onApplied: () => void
  /** Show a live preview of a proposal on the stage (null clears it). */
  onPreview: (p: Proposal | null) => void
}

const SUGGESTIONS = [
  "Make this slide less text-heavy",
  "Add a knowledge check after this slide",
  "Restructure this as a comparison",
]

export default function ChatPanel({ moduleId, openPageIndex, onApplied, onPreview }: Props) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<Proposal | null>(null)
  const [applying, setApplying] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  function scrollDown() {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e6, behavior: "smooth" }))
  }

  async function send(text?: string) {
    const instruction = (text ?? input).trim()
    if (!instruction || busy) return
    setInput("")
    setProposal(null)
    onPreview(null)
    setMessages(m => [...m, { role: "user", content: instruction }])
    setBusy(true)
    scrollDown()

    try {
      const res = await fetch(`/api/course-gen/modules/${moduleId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          open_page_index: openPageIndex,
          history: messages.slice(-6),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "The assistant could not respond")

      setMessages(m => [...m, { role: "assistant", content: data.summary }])

      if (data.ops?.length) {
        if (data.auto_applied) {
          // Small, non-destructive edits were pre-approved — commit them now.
          await commit(data)
        } else {
          setProposal(data)
          onPreview(data)
        }
      }
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", content: `⚠ ${e.message}` }])
    } finally {
      setBusy(false)
      scrollDown()
    }
  }

  async function commit(p: Proposal) {
    setApplying(true)
    try {
      const res = await fetch(`/api/course-gen/modules/${moduleId}/chat/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ops: p.ops, compiled: p.compiled }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error ?? "Could not apply the changes")
      }
      const { applied } = await res.json()
      toast.success(`Applied ${applied} change${applied === 1 ? "" : "s"}`)
      setProposal(null)
      onPreview(null)
      onApplied()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setApplying(false)
    }
  }

  function discard() {
    setProposal(null)
    onPreview(null)
    setMessages(m => [...m, { role: "assistant", content: "Discarded — nothing was changed." }])
    scrollDown()
  }

  return (
    <div className="flex flex-col h-full border-l border-slate-200 bg-white w-80 shrink-0">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2 shrink-0">
        <Sparkles className="h-4 w-4 text-[#0C72C6]" />
        <p className="text-sm font-semibold text-slate-800">AI Assistant</p>
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400">this module</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 leading-relaxed">
              I know every slide in this module — ask for changes in plain language and I&apos;ll work out what to edit.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:border-[#0C72C6] hover:text-[#0C72C6] transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`text-xs leading-relaxed rounded-xl px-3 py-2 ${
            m.role === "user"
              ? "bg-[#0C72C6] text-white ml-6"
              : "bg-slate-100 text-slate-700 mr-2"
          }`}>
            {m.content}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-slate-400 px-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
          </div>
        )}

        {/* Proposal — preview is already rendered on the stage */}
        {proposal && (
          <div className="rounded-xl border-2 border-[#0C72C6]/30 bg-[#0C72C6]/5 p-3 space-y-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#0C72C6]">Proposed changes</p>
            <ul className="space-y-1">
              {proposal.ops.map((o, i) => (
                <li key={i} className="text-[11px] text-slate-600 flex gap-1.5">
                  <span className="text-[#0C72C6]">•</span>
                  <span>{describeOp(o)}</span>
                </li>
              ))}
            </ul>
            {proposal.warnings.length > 0 && (
              <div className="space-y-1">
                {proposal.warnings.map((w, i) => (
                  <p key={i} className="text-[11px] text-amber-700 flex gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" /> {w}
                  </p>
                ))}
              </div>
            )}
            <p className="text-[10px] text-slate-400">Preview shown on the slide — nothing is saved until you apply.</p>
            <div className="flex gap-2">
              <button onClick={() => commit(proposal)} disabled={applying}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-lg py-1.5">
                {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Apply
              </button>
              <button onClick={discard} disabled={applying}
                className="flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3">
                <X className="h-3.5 w-3.5" /> Discard
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-100 shrink-0">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Instruct an edit…"
            disabled={busy}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-[#0C72C6]/30 disabled:bg-slate-50"
          />
          <button onClick={() => send()} disabled={busy || !input.trim()}
            className="px-3 rounded-lg bg-[#0C72C6] text-white disabled:opacity-40 hover:bg-[#0a63ab] transition-colors">
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}

function describeOp(o: any): string {
  switch (o.op) {
    case "rewrite_slide":  return `Rewrite slide #${o.page_index + 1}${o.title ? ` — "${o.title}"` : ""}`
    case "add_slide":      return `Add "${o.title}" after slide #${o.after_index + 1}`
    case "delete_slide":   return `Delete slide #${o.page_index + 1}`
    case "reorder_slide":  return `Move slide #${o.page_index + 1} to position ${o.to_index + 1}`
    case "update_element": return `Edit an element on slide #${o.page_index + 1}`
    case "add_element":    return `Add an element to slide #${o.page_index + 1}`
    case "delete_element": return `Remove an element from slide #${o.page_index + 1}`
    default:               return o.op
  }
}
