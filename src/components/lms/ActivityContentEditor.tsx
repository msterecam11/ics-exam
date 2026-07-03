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
  { value: "fill_blank",    label: "Fill in the Blank" },
  { value: "word_scramble", label: "Word Scramble" },
  { value: "acronym",       label: "Acronym Explainer" },
  { value: "scenario",      label: "Scenario" },
  { value: "concept_sorter",label: "Concept Sorter" },
  { value: "rapid_fire",    label: "Rapid Fire" },
  { value: "short_answer",  label: "Short Answer (AI-scored)" },
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
    case "fill_blank":    return { sentence: "", blanks: [] }
    case "word_scramble": return { word: "", hint: "" }
    case "acronym":       return { acronym: "", letters: [] }
    case "scenario":      return { situation: "", choices: [{ text: "", is_correct: true, consequence: "" }, { text: "", is_correct: false, consequence: "" }] }
    case "concept_sorter":return { categories: [{ name: "" }, { name: "" }], items: [{ text: "", category: "" }] }
    case "rapid_fire":    return { time_per_question_s: 10, questions: [{ question: "", options: [{ text: "", is_correct: true }, { text: "", is_correct: false }] }] }
    case "short_answer":  return { question: "", rubric: "" }
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

// ── Gap Fill / Fill in the Blank (shared [BLANK_n] token editor) ──
// The players split the text on [BLANK_1], [BLANK_2]… tokens and match
// each answer by position. Answer fields derive from the tokens present,
// so they always stay in sync. `field` is "paragraph" (gap_fill) or
// "sentence" (fill_blank).
function BlankTokenEdit({ field, content, onChange }: { field: "paragraph" | "sentence"; content: Content; onChange: (c: Content) => void }) {
  const text: string = content[field] ?? ""
  const blanks: { answer: string }[] = content.blanks ?? []
  const tokenCount = (text.match(/\[BLANK_\d+\]/g) ?? []).length

  const setText = (t: string) => {
    const count = (t.match(/\[BLANK_\d+\]/g) ?? []).length
    const next = Array.from({ length: count }, (_, i) => blanks[i] ?? { answer: "" })
    onChange({ ...content, [field]: t, blanks: next })
  }
  const insertToken = () =>
    setText(`${text}${text && !text.endsWith(" ") ? " " : ""}[BLANK_${tokenCount + 1}]`)
  const setAnswer = (i: number, answer: string) =>
    onChange({ ...content, blanks: blanks.map((b, j) => j === i ? { answer } : b) })

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className={labelCls}>{field === "sentence" ? "Sentence" : "Paragraph"}</label>
          <button type="button" onClick={insertToken}
            className="text-xs font-medium text-[#1B4F8A] hover:underline">+ Insert blank</button>
        </div>
        <textarea value={text} rows={4}
          onChange={e => setText(e.target.value)}
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

// ── Word Scramble ────────────────────────────────────────────────
function WordScrambleEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Word (letters get scrambled for the student)</label>
        <input value={content.word ?? ""} onChange={e => onChange({ ...content, word: e.target.value })}
          className={inputCls} placeholder="e.g. RUNWAY" />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Hint</label>
        <input value={content.hint ?? ""} onChange={e => onChange({ ...content, hint: e.target.value })}
          className={inputCls} placeholder="A clue to help unscramble the word" />
      </div>
    </div>
  )
}

// ── Acronym Explainer (letter rows derive from the acronym) ──────
function AcronymEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const acronym: string = content.acronym ?? ""
  const letters: { letter: string; expansion: string }[] = content.letters ?? []
  const chars = acronym.replace(/\s/g, "").toUpperCase().split("")

  const setAcronym = (raw: string) => {
    const a = raw.toUpperCase()
    const ch = a.replace(/\s/g, "").split("")
    const next = ch.map((c, i) => ({ letter: c, expansion: letters[i]?.expansion ?? "" }))
    onChange({ ...content, acronym: a, letters: next })
  }
  const setExpansion = (i: number, expansion: string) =>
    onChange({ ...content, letters: chars.map((c, j) => ({ letter: c, expansion: j === i ? expansion : (letters[j]?.expansion ?? "") })) })

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Acronym</label>
        <input value={acronym} onChange={e => setAcronym(e.target.value)}
          className={cn(inputCls, "font-bold tracking-widest uppercase")} placeholder="e.g. ICAO" />
      </div>
      <div className="space-y-2">
        <label className={labelCls}>What each letter stands for</label>
        {chars.length === 0 ? (
          <p className="text-xs text-slate-400 italic">Type an acronym above to add its letters.</p>
        ) : chars.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-lg bg-[#E65100]/10 text-[#E65100] font-black flex items-center justify-center shrink-0">{c}</span>
            <input value={letters[i]?.expansion ?? ""} onChange={e => setExpansion(i, e.target.value)}
              className={inputCls} placeholder={`What does "${c}" stand for?`} />
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Scenario (single correct choice) ─────────────────────────────
function ScenarioEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const choices: { text: string; is_correct: boolean; consequence: string }[] = content.choices ?? []
  const setChoice = (i: number, patch: Partial<{ text: string; consequence: string }>) =>
    onChange({ ...content, choices: choices.map((c, j) => j === i ? { ...c, ...patch } : c) })
  const setCorrect = (i: number) =>
    onChange({ ...content, choices: choices.map((c, j) => ({ ...c, is_correct: j === i })) })
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Situation</label>
        <textarea value={content.situation ?? ""} rows={3}
          onChange={e => onChange({ ...content, situation: e.target.value })}
          className={inputCls} placeholder="Describe the scenario the student must respond to…" />
      </div>
      <div className="space-y-2">
        <label className={labelCls}>Choices — mark the best course of action</label>
        {choices.map((c, i) => (
          <div key={i} className="flex items-start gap-2 p-2 rounded-lg border border-slate-100">
            <button type="button" onClick={() => setCorrect(i)} title="Mark correct"
              className={cn("w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors",
                c.is_correct ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-400")}>
              <Check className="h-3.5 w-3.5" />
            </button>
            <div className="flex-1 space-y-1.5">
              <input value={c.text} onChange={e => setChoice(i, { text: e.target.value })}
                className={inputCls} placeholder={`Choice ${i + 1}`} />
              <input value={c.consequence} onChange={e => setChoice(i, { consequence: e.target.value })}
                className={cn(inputCls, "text-xs")} placeholder="Consequence / feedback shown after choosing (optional)" />
            </div>
            <RowDelete onClick={() => onChange({ ...content, choices: choices.filter((_, j) => j !== i) })} disabled={choices.length <= 2} />
          </div>
        ))}
        <AddButton label="Add choice" onClick={() => onChange({ ...content, choices: [...choices, { text: "", is_correct: false, consequence: "" }] })} />
      </div>
    </div>
  )
}

// ── Concept Sorter (categories + items assigned to a category) ───
function ConceptSorterEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const categories: { name: string }[] = content.categories ?? []
  const items: { text: string; category: string }[] = content.items ?? []
  const catNames = categories.map(c => c.name).filter(Boolean)

  const setCat = (i: number, name: string) => {
    const old = categories[i]?.name
    const nextCats = categories.map((c, j) => j === i ? { name } : c)
    // keep item assignments pointing at the renamed category
    const nextItems = items.map(it => it.category === old ? { ...it, category: name } : it)
    onChange({ ...content, categories: nextCats, items: nextItems })
  }
  const setItem = (i: number, patch: Partial<{ text: string; category: string }>) =>
    onChange({ ...content, items: items.map((it, j) => j === i ? { ...it, ...patch } : it) })

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className={labelCls}>Categories</label>
        {categories.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={c.name} onChange={e => setCat(i, e.target.value)} className={inputCls} placeholder={`Category ${i + 1}`} />
            <RowDelete onClick={() => onChange({ ...content, categories: categories.filter((_, j) => j !== i) })} disabled={categories.length <= 2} />
          </div>
        ))}
        <AddButton label="Add category" onClick={() => onChange({ ...content, categories: [...categories, { name: "" }] })} />
      </div>
      <div className="space-y-2">
        <label className={labelCls}>Items — assign each to its correct category</label>
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            <input value={it.text} onChange={e => setItem(i, { text: e.target.value })} className={inputCls} placeholder={`Item ${i + 1}`} />
            <select value={it.category} onChange={e => setItem(i, { category: e.target.value })}
              className="text-sm rounded-lg border border-slate-200 px-2 py-2 outline-none focus:border-[#1B4F8A] bg-white shrink-0 max-w-[45%]">
              <option value="">— category —</option>
              {catNames.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
            <RowDelete onClick={() => onChange({ ...content, items: items.filter((_, j) => j !== i) })} disabled={items.length <= 1} />
          </div>
        ))}
        <AddButton label="Add item" onClick={() => onChange({ ...content, items: [...items, { text: "", category: "" }] })} />
      </div>
    </div>
  )
}

// ── Rapid Fire (timed mini-MCQs, single correct each) ────────────
function RapidFireEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  const questions: { question: string; options: { text: string; is_correct: boolean }[] }[] = content.questions ?? []
  const timePerQ: number = content.time_per_question_s ?? 10

  const setQ = (qi: number, patch: Partial<{ question: string; options: any[] }>) =>
    onChange({ ...content, questions: questions.map((q, j) => j === qi ? { ...q, ...patch } : q) })
  const setOpt = (qi: number, oi: number, text: string) =>
    setQ(qi, { options: questions[qi].options.map((o, j) => j === oi ? { ...o, text } : o) })
  const setCorrect = (qi: number, oi: number) =>
    setQ(qi, { options: questions[qi].options.map((o, j) => ({ ...o, is_correct: j === oi })) })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <label className={labelCls}>Seconds per question</label>
        <input type="number" min={3} max={60} value={timePerQ}
          onChange={e => onChange({ ...content, time_per_question_s: Math.max(3, Number(e.target.value) || 10) })}
          className="w-20 px-2 py-1.5 text-sm rounded-lg border border-slate-200 outline-none focus:border-[#1B4F8A]" />
      </div>
      {questions.map((q, qi) => (
        <div key={qi} className="space-y-2 p-3 rounded-xl border border-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 shrink-0">Q{qi + 1}</span>
            <input value={q.question} onChange={e => setQ(qi, { question: e.target.value })} className={inputCls} placeholder="Question" />
            <RowDelete onClick={() => onChange({ ...content, questions: questions.filter((_, j) => j !== qi) })} disabled={questions.length <= 1} />
          </div>
          <div className="pl-6 space-y-1.5">
            {(q.options ?? []).map((o, oi) => (
              <div key={oi} className="flex items-center gap-2">
                <button type="button" onClick={() => setCorrect(qi, oi)} title="Mark correct"
                  className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                    o.is_correct ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent hover:border-emerald-400")}>
                  <Check className="h-3 w-3" />
                </button>
                <input value={o.text} onChange={e => setOpt(qi, oi, e.target.value)} className={inputCls} placeholder={`Option ${oi + 1}`} />
                <RowDelete onClick={() => setQ(qi, { options: q.options.filter((_, j) => j !== oi) })} disabled={q.options.length <= 2} />
              </div>
            ))}
            {(q.options?.length ?? 0) < 4 && (
              <AddButton label="Add option" onClick={() => setQ(qi, { options: [...q.options, { text: "", is_correct: false }] })} />
            )}
          </div>
        </div>
      ))}
      <AddButton label="Add question"
        onClick={() => onChange({ ...content, questions: [...questions, { question: "", options: [{ text: "", is_correct: true }, { text: "", is_correct: false }] }] })} />
    </div>
  )
}

// ── Short Answer (AI-scored) ─────────────────────────────────────
function ShortAnswerEdit({ content, onChange }: { content: Content; onChange: (c: Content) => void }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelCls}>Question / prompt</label>
        <textarea value={content.question ?? ""} rows={3}
          onChange={e => onChange({ ...content, question: e.target.value })}
          className={inputCls} placeholder="What should the student write about?" />
      </div>
      <div className="space-y-1.5">
        <label className={labelCls}>Model answer / grading rubric (used by the AI to score)</label>
        <textarea value={content.rubric ?? ""} rows={4}
          onChange={e => onChange({ ...content, rubric: e.target.value })}
          className={inputCls} placeholder="Describe what a correct answer must include. The more specific, the more consistent the AI grading." />
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
    case "gap_fill":      return <BlankTokenEdit   field="paragraph" content={content} onChange={onChange} />
    case "fill_blank":    return <BlankTokenEdit   field="sentence"  content={content} onChange={onChange} />
    case "word_scramble": return <WordScrambleEdit content={content} onChange={onChange} />
    case "acronym":       return <AcronymEdit      content={content} onChange={onChange} />
    case "scenario":      return <ScenarioEdit     content={content} onChange={onChange} />
    case "concept_sorter":return <ConceptSorterEdit content={content} onChange={onChange} />
    case "rapid_fire":    return <RapidFireEdit    content={content} onChange={onChange} />
    case "short_answer":  return <ShortAnswerEdit  content={content} onChange={onChange} />
    default:
      return (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Manual editing for <span className="font-semibold">{type}</span> activities isn&apos;t available yet —
          use the Generate tab, or switch the type above to a manually-editable one.
        </div>
      )
  }
}
