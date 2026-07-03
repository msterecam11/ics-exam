"use client"

// ─── Manual editor for interactive activity content ──────────────
// Edits the `content` object of a package "activity" item, per type.
// Covers the common types; unsupported types fall back to a notice.
// The shapes here MUST match what ActivityPlayer renders.

import { Plus, Trash2, Check } from "lucide-react"
import { cn } from "@/lib/utils"

type Content = Record<string, any>
const uid = () => Math.random().toString(36).slice(2, 10)

// Activity types this editor can author by hand
export const EDITABLE_ACTIVITY_TYPES: { value: string; label: string }[] = [
  { value: "mcq",           label: "Multiple Choice" },
  { value: "true_false",    label: "True / False" },
  { value: "flashcard",     label: "Flashcards" },
  { value: "ordering",      label: "Ordering" },
  { value: "drag_match",    label: "Matching Pairs" },
  { value: "error_spotter", label: "Error Spotter" },
  { value: "gap_fill",      label: "Gap Fill" },
]

export function isEditableActivityType(t: string) {
  return EDITABLE_ACTIVITY_TYPES.some(x => x.value === t)
}

// Blank starting template for manual authoring
export function blankActivityContent(type: string): Content {
  switch (type) {
    case "mcq":           return { question: "", options: [{ text: "", is_correct: true }, { text: "", is_correct: false }], explanation: "" }
    case "true_false":    return { statement: "", answer: true, explanation: "" }
    case "flashcard":     return { cards: [{ front: "", back: "" }] }
    case "ordering":      return { question: "Arrange in the correct order:", items: [{ id: uid(), text: "" }, { id: uid(), text: "" }] }
    case "drag_match":    return { pairs: [{ left: "", right: "" }] }
    case "error_spotter": return { text: "", errors: [{ wrong: "", correct: "" }] }
    case "gap_fill":      return { paragraph: "", blanks: [] }
    default:              return {}
  }
}

// ── Small shared field bits ──────────────────────────────────────
const inputCls = "w-full px-3 py-2 text-sm rounded-lg border border-slate-200 focus:border-[#1B4F8A] focus:ring-1 focus:ring-[#1B4F8A] outline-none"
const labelCls = "text-xs font-semibold text-slate-500 uppercase tracking-wide"

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick}
      className="flex items-center gap-1.5 text-xs font-medium text-[#1B4F8A] hover:bg-[#1B4F8A]/5 px-3 py-1.5 rounded-lg border border-dashed border-[#1B4F8A]/30 transition-colors">
      <Plus className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

function RowDelete({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="shrink-0 p-1.5 text-slate-300 hover:text-red-500 disabled:opacity-30 disabled:hover:text-slate-300 transition-colors">
      <Trash2 className="h-4 w-4" />
    </button>
  )
}

// ── MCQ (single correct) ─────────────────────────────────────────
function McqEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const options: { text: string; is_correct: boolean }[] = content.options ?? []
  const setOpt = (i: number, patch: Partial<{ text: string; is_correct: boolean }>) =>
    onChange({ ...content, options: options.map((o, j) => j === i ? { ...o, ...patch } : o) })
  const setCorrect = (i: number) =>
    onChange({ ...content, options: options.map((o, j) => ({ ...o, is_correct: j === i })) })

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Question</label>
        <textarea value={content.question ?? ""} rows={2}
          onChange={e => onChange({ ...content, question: e.target.value })}
          className={inputCls} placeholder="Enter the question…" />
      </div>
      <div className="space-y-2">
        <label className={labelCls}>Options — click the circle to mark the correct answer</label>
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <button type="button" onClick={() => setCorrect(i)} title="Mark correct"
              className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                opt.is_correct ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-400")}>
              <Check className="h-3.5 w-3.5" />
            </button>
            <input value={opt.text} onChange={e => setOpt(i, { text: e.target.value })}
              className={inputCls} placeholder={`Option ${i + 1}`} />
            <RowDelete onClick={() => onChange({ ...content, options: options.filter((_, j) => j !== i) })}
              disabled={options.length <= 2} />
          </div>
        ))}
        {options.length < 6 && (
          <AddButton label="Add option" onClick={() => onChange({ ...content, options: [...options, { text: "", is_correct: false }] })} />
        )}
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Explanation (shown after answering)</label>
        <textarea value={content.explanation ?? ""} rows={2}
          onChange={e => onChange({ ...content, explanation: e.target.value })}
          className={inputCls} placeholder="Why is this the correct answer? (optional)" />
      </div>
    </div>
  )
}

// ── True / False ─────────────────────────────────────────────────
function TrueFalseEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const answer = content.answer ?? true
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Statement</label>
        <textarea value={content.statement ?? ""} rows={2}
          onChange={e => onChange({ ...content, statement: e.target.value })}
          className={inputCls} placeholder="Enter a statement that is true or false…" />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Correct answer</label>
        <div className="flex gap-2">
          {[true, false].map(v => (
            <button key={String(v)} type="button" onClick={() => onChange({ ...content, answer: v })}
              className={cn("flex-1 py-2 rounded-lg text-sm font-semibold border-2 transition-colors",
                answer === v ? "border-[#1B4F8A] bg-[#E6F1FB] text-[#1B4F8A]" : "border-slate-200 text-slate-500 hover:border-slate-300")}>
              {v ? "True" : "False"}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Explanation</label>
        <textarea value={content.explanation ?? ""} rows={2}
          onChange={e => onChange({ ...content, explanation: e.target.value })}
          className={inputCls} placeholder="Why? (optional)" />
      </div>
    </div>
  )
}

// ── Flashcards ───────────────────────────────────────────────────
function FlashcardEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const cards: { front: string; back: string }[] = content.cards ?? []
  const setCard = (i: number, patch: Partial<{ front: string; back: string }>) =>
    onChange({ ...content, cards: cards.map((c, j) => j === i ? { ...c, ...patch } : c) })
  return (
    <div className="space-y-3">
      <label className={labelCls}>Cards (front → back)</label>
      {cards.map((card, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-xs font-bold text-slate-300 mt-2.5 w-5 shrink-0">{i + 1}</span>
          <div className="flex-1 grid grid-cols-2 gap-2">
            <input value={card.front} onChange={e => setCard(i, { front: e.target.value })} className={inputCls} placeholder="Front (term)" />
            <input value={card.back}  onChange={e => setCard(i, { back: e.target.value })}  className={inputCls} placeholder="Back (definition)" />
          </div>
          <RowDelete onClick={() => onChange({ ...content, cards: cards.filter((_, j) => j !== i) })} disabled={cards.length <= 1} />
        </div>
      ))}
      <AddButton label="Add card" onClick={() => onChange({ ...content, cards: [...cards, { front: "", back: "" }] })} />
    </div>
  )
}

// ── Ordering (items listed in the correct order) ─────────────────
function OrderingEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const items: { id: string; text: string }[] = content.items ?? []
  const sync = (next: { id: string; text: string }[]) =>
    onChange({ ...content, items: next, correct_order: next.map(i => i.id) })
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label className={labelCls}>Prompt</label>
        <input value={content.question ?? ""} onChange={e => onChange({ ...content, question: e.target.value })}
          className={inputCls} placeholder="Arrange in the correct order:" />
      </div>
      <label className={labelCls}>Steps — enter them in the CORRECT order (students see them shuffled)</label>
      {items.map((it, i) => (
        <div key={it.id} className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
          <input value={it.text} onChange={e => sync(items.map((x, j) => j === i ? { ...x, text: e.target.value } : x))}
            className={inputCls} placeholder={`Step ${i + 1}`} />
          <RowDelete onClick={() => sync(items.filter((_, j) => j !== i))} disabled={items.length <= 2} />
        </div>
      ))}
      <AddButton label="Add step" onClick={() => sync([...items, { id: uid(), text: "" }])} />
    </div>
  )
}

// ── Matching pairs (drag_match) ──────────────────────────────────
function MatchingEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const pairs: { left: string; right: string }[] = content.pairs ?? []
  const setPair = (i: number, patch: Partial<{ left: string; right: string }>) =>
    onChange({ ...content, pairs: pairs.map((p, j) => j === i ? { ...p, ...patch } : p) })
  return (
    <div className="space-y-3">
      <label className={labelCls}>Pairs (left matches right)</label>
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <input value={p.left}  onChange={e => setPair(i, { left: e.target.value })}  className={inputCls} placeholder="Left" />
          <span className="text-slate-300 shrink-0">↔</span>
          <input value={p.right} onChange={e => setPair(i, { right: e.target.value })} className={inputCls} placeholder="Right" />
          <RowDelete onClick={() => onChange({ ...content, pairs: pairs.filter((_, j) => j !== i) })} disabled={pairs.length <= 1} />
        </div>
      ))}
      <AddButton label="Add pair" onClick={() => onChange({ ...content, pairs: [...pairs, { left: "", right: "" }] })} />
    </div>
  )
}

// ── Error Spotter ────────────────────────────────────────────────
function ErrorSpotterEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const errors: { wrong: string; correct: string }[] = content.errors ?? []
  const setErr = (i: number, patch: Partial<{ wrong: string; correct: string }>) =>
    onChange({ ...content, errors: errors.map((e, j) => j === i ? { ...e, ...patch } : e) })
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Passage (must contain the wrong words below, verbatim)</label>
        <textarea value={content.text ?? ""} rows={4}
          onChange={e => onChange({ ...content, text: e.target.value })}
          className={inputCls} placeholder="Write a passage that includes the incorrect words students must spot…" />
      </div>
      <div className="space-y-2">
        <label className={labelCls}>Errors — the wrong word as written, and its correction</label>
        {errors.map((err, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={err.wrong}   onChange={e => setErr(i, { wrong: e.target.value })}   className={inputCls} placeholder="Wrong word (as in passage)" />
            <span className="text-slate-300 shrink-0">→</span>
            <input value={err.correct} onChange={e => setErr(i, { correct: e.target.value })} className={inputCls} placeholder="Correction" />
            <RowDelete onClick={() => onChange({ ...content, errors: errors.filter((_, j) => j !== i) })} disabled={errors.length <= 1} />
          </div>
        ))}
        <AddButton label="Add error" onClick={() => onChange({ ...content, errors: [...errors, { wrong: "", correct: "" }] })} />
      </div>
    </div>
  )
}

// ── Gap Fill ─────────────────────────────────────────────────────
// The player splits the paragraph on [BLANK_1], [BLANK_2]… tokens and
// matches each answer by position. The answer fields below are derived
// from the tokens present in the paragraph, so they always stay in sync.
function GapFillEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const paragraph: string = content.paragraph ?? ""
  const blanks: { answer: string }[] = content.blanks ?? []
  const tokenCount = (paragraph.match(/\[BLANK_\d+\]/g) ?? []).length

  const setParagraph = (p: string) => {
    const count = (p.match(/\[BLANK_\d+\]/g) ?? []).length
    // Resize answers to match the number of tokens, preserving existing ones
    const next = Array.from({ length: count }, (_, i) => blanks[i] ?? { answer: "" })
    onChange({ ...content, paragraph: p, blanks: next })
  }
  const insertToken = () =>
    setParagraph(`${paragraph}${paragraph && !paragraph.endsWith(" ") ? " " : ""}[BLANK_${tokenCount + 1}]`)
  const setAnswer = (i: number, answer: string) =>
    onChange({ ...content, blanks: blanks.map((b, j) => j === i ? { answer } : b) })

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className={labelCls}>Paragraph</label>
          <button type="button" onClick={insertToken}
            className="text-xs font-medium text-[#1B4F8A] hover:underline">+ Insert blank</button>
        </div>
        <textarea value={paragraph} rows={4}
          onChange={e => setParagraph(e.target.value)}
          className={inputCls}
          placeholder="Runway edge lights are [BLANK_1] and threshold lights are [BLANK_2]." />
        <p className="text-[11px] text-slate-400">
          Put <code className="bg-slate-100 px-1 rounded">[BLANK_1]</code>,
          <code className="bg-slate-100 px-1 rounded ml-1">[BLANK_2]</code>… where each answer goes.
        </p>
      </div>
      <div className="space-y-2">
        <label className={labelCls}>Answers ({tokenCount} blank{tokenCount === 1 ? "" : "s"} detected)</label>
        {tokenCount === 0 ? (
          <p className="text-xs text-slate-400 italic">Add a [BLANK_n] token above to create an answer field.</p>
        ) : (
          Array.from({ length: tokenCount }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] font-mono text-slate-400">BLANK_{i + 1}</span>
              <input value={blanks[i]?.answer ?? ""} onChange={e => setAnswer(i, e.target.value)}
                className={inputCls} placeholder="Correct answer" />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Dispatcher ───────────────────────────────────────────────────
export default function ActivityContentEditor({
  type, content, onChange,
}: {
  type: string
  content: Content
  onChange: (c: Content) => void
}) {
  switch (type) {
    case "mcq":           return <McqEdit          content={content} onChange={onChange} />
    case "true_false":    return <TrueFalseEdit    content={content} onChange={onChange} />
    case "flashcard":     return <FlashcardEdit    content={content} onChange={onChange} />
    case "ordering":      return <OrderingEdit     content={content} onChange={onChange} />
    case "drag_match":    return <MatchingEdit     content={content} onChange={onChange} />
    case "error_spotter": return <ErrorSpotterEdit content={content} onChange={onChange} />
    case "gap_fill":      return <GapFillEdit      content={content} onChange={onChange} />
    default:
      return (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Manual editing for <span className="font-semibold">{type}</span> activities isn&apos;t available yet —
          use the Generate tab, or switch the type above to a manually-editable one.
        </div>
      )
  }
}
