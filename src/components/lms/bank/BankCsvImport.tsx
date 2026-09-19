"use client"

import { useRef, useState } from "react"
import { X, Upload, Download, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

// Bulk-add questions to a set from a CSV (one row per question). The browser
// reads and checks the file; the server checks every row again and saves all
// of them or none.

const OPTION_COLS = 6
const HEADER = ["type", "question", "points", "difficulty", "topic", "tags", ...Array.from({ length: OPTION_COLS }, (_, i) => `option_${i + 1}`), "correct", "rubric", "explanation"]
const TYPE_ALIAS: Record<string, string> = {
  mcq_single: "mcq_single", single: "mcq_single", mcq: "mcq_single",
  mcq_multiple: "mcq_multiple", multiple: "mcq_multiple",
  open_ended: "open_ended", open: "open_ended", written: "open_ended",
  ordering: "ordering", order: "ordering",
  match_pair: "match_pair", matching: "match_pair", match: "match_pair",
}
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const TEMPLATE_ROWS = [
  ["mcq_single", "Which document defines the aerodrome's certification basis?", "1", "easy", "Certification", "GACAR;Part 139", "Aerodrome Manual", "NOTAM", "AIP Supplement", "Flight plan", "", "", "A", "", "The Aerodrome Manual is the certification basis."],
  ["mcq_multiple", "Which are elements of an SMS? (choose all that apply)", "2", "medium", "SMS", "SMS", "Safety policy", "Safety risk management", "Catering standards", "Safety assurance", "", "", "A;B;D", "", ""],
  ["open_ended", "Explain how a runway condition report (GRF) is produced.", "4", "hard", "GRF", "Runway", "", "", "", "", "", "", "", "Mentions RCAM assessment, RWYCC per third, reporting via SNOWTAM", ""],
  ["ordering", "Put the emergency response steps in order.", "2", "medium", "Emergency", "", "Alert", "Respond", "Contain", "Recover", "", "", "", "", "Options are written in the correct order."],
  ["match_pair", "Match each light to its colour.", "2", "medium", "Visual aids", "", "Runway edge | White", "Taxiway edge | Blue", "Threshold | Green", "", "", "", "", "", "Write each pair as left | right."],
]

/** RFC 4180-style parser: quotes, escaped quotes, commas and line breaks inside quotes, BOM. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false
  const s = text.replace(/^﻿/, "")
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++ } else q = false }
      else cell += c
    } else if (c === '"') q = true
    else if (c === ",") { row.push(cell); cell = "" }
    else if (c === "\n" || c === "\r") { if (c === "\r" && s[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = "" }
    else cell += c
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row) }
  return rows.filter(r => r.some(x => x.trim() !== ""))
}

type Parsed = { row: number; question: any; difficulty: string; tags: string[]; topic: string } | { row: number; error: string }

function toQuestion(get: (k: string) => string, rowNo: number): Parsed {
  const type = TYPE_ALIAS[get("type").toLowerCase()]
  if (!type) return { row: rowNo, error: `Unknown type "${get("type")}"` }
  const text = get("question")
  if (!text) return { row: rowNo, error: "The question text is empty" }
  const points = get("points") ? Number(get("points")) : 1
  if (!Number.isFinite(points) || points <= 0) return { row: rowNo, error: "Points must be a positive number" }
  const opts = Array.from({ length: OPTION_COLS }, (_, i) => get(`option_${i + 1}`)).filter(Boolean)
  const q: any = { type, text, points, ...(get("explanation") ? { explanation: get("explanation") } : {}) }

  if (type === "mcq_single" || type === "mcq_multiple") {
    if (opts.length < 2) return { row: rowNo, error: "Give at least two options" }
    const picks = get("correct").split(/[;,\s]+/).filter(Boolean).map(x => /^\d+$/.test(x) ? Number(x) - 1 : x.toUpperCase().charCodeAt(0) - 65)
    if (!picks.length || picks.some(i => i < 0 || i >= opts.length)) return { row: rowNo, error: `"correct" must name options, e.g. A or 2${type === "mcq_multiple" ? " or A;C" : ""}` }
    if (type === "mcq_single" && picks.length !== 1) return { row: rowNo, error: "Single answer: give exactly one correct option" }
    q.options = opts.map((t, i) => ({ id: `o${i + 1}`, text: t, correct: picks.includes(i) }))
  } else if (type === "ordering") {
    if (opts.length < 2) return { row: rowNo, error: "Give at least two items, in the correct order" }
    q.items = opts.map((t, i) => ({ id: `i${i + 1}`, text: t }))
  } else if (type === "match_pair") {
    const pairs = opts.map(o => o.split(/\s*(?:\||=>)\s*/))
    if (pairs.length < 2 || pairs.some(p => p.length !== 2 || !p[0] || !p[1])) return { row: rowNo, error: 'Write each pair as "left | right" (at least two)' }
    q.pairs = pairs.map(([left, right], i) => ({ id: `p${i + 1}`, left, right }))
  } else {
    q.rubric = get("rubric")
  }
  const difficulty = ["easy", "medium", "hard"].includes(get("difficulty").toLowerCase()) ? get("difficulty").toLowerCase() : "medium"
  return { row: rowNo, question: q, difficulty, tags: get("tags").split(/[;,]/).map(t => t.trim()).filter(Boolean), topic: get("topic") }
}

export default function BankCsvImport({ setId, setName, onClose, onDone }: { setId: string; setName: string; onClose: () => void; onDone: (n: number) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [parsed, setParsed] = useState<Parsed[] | null>(null)
  const [serverErrors, setServerErrors] = useState<{ row: number; error: string }[]>([])
  const [busy, setBusy] = useState(false)

  function downloadTemplate() {
    const csv = [HEADER, ...TEMPLATE_ROWS].map(r => r.map(csvCell).join(",")).join("\r\n")
    const a = document.createElement("a")
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }))
    a.download = "question-bank-template.csv"; a.click(); URL.revokeObjectURL(a.href)
  }

  async function read(file: File) {
    setServerErrors([]); setFileName(file.name)
    const rows = parseCsv(await file.text())
    if (rows.length < 2) { setParsed([]); toast.error("The file has no question rows"); return }
    const head = rows[0].map(h => h.trim().toLowerCase())
    if (!head.includes("type") || !head.includes("question")) { setParsed([]); toast.error('The first row must be the header — download the template'); return }
    setParsed(rows.slice(1).map((r, i) => toQuestion(k => (r[head.indexOf(k)] ?? "").trim(), i + 2)))
  }

  async function doImport() {
    if (!parsed) return
    setBusy(true); setServerErrors([])
    const res = await fetch("/api/lms/bank/questions/import", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ set_id: setId, rows: parsed.filter((p): p is Exclude<Parsed, { error: string }> => !("error" in p)) }),
    })
    const d = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setServerErrors(d.errors ?? []); toast.error(d.error ?? "Import failed"); return }
    toast.success(`${d.imported} question${d.imported === 1 ? "" : "s"} added to ${setName}`)
    onDone(d.imported)
  }

  const bad = (parsed ?? []).filter((p): p is { row: number; error: string } => "error" in p)
  const good = (parsed ?? []).length - bad.length
  const byType = (parsed ?? []).reduce((m, p) => { if (!("error" in p)) m[p.question.type] = (m[p.question.type] ?? 0) + 1; return m }, {} as Record<string, number>)
  const problems = [...bad, ...serverErrors].sort((a, b) => a.row - b.row)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">Import questions from CSV · {setName}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 text-sm text-slate-600 space-y-1.5">
            <p>One row per question. Columns: <span className="font-mono text-xs">type, question, points, difficulty, topic, tags, option_1…option_6, correct, rubric, explanation</span>.</p>
            <ul className="text-xs text-slate-500 list-disc ml-4 space-y-0.5">
              <li><b>type</b>: mcq_single, mcq_multiple, open_ended, ordering, match_pair</li>
              <li><b>correct</b>: the right option letter or number — A or 2; several for multiple answers: A;C</li>
              <li><b>ordering</b>: write the options in the correct order · <b>match_pair</b>: each option as <span className="font-mono">left | right</span></li>
              <li><b>tags</b>: separated by ; · <b>difficulty</b>: easy, medium or hard (medium if empty)</li>
            </ul>
            <button onClick={downloadTemplate} className="mt-1 text-xs font-medium text-[#1B4F8A] hover:underline inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" /> Download the template (with an example of each type)</button>
          </div>

          <button onClick={() => input.current?.click()} className="w-full rounded-xl border-2 border-dashed border-slate-200 hover:border-[#1B4F8A]/40 hover:bg-slate-50 py-6 text-sm text-slate-600 flex flex-col items-center gap-1.5">
            <Upload className="h-5 w-5 text-slate-400" />
            {fileName ? <span><b>{fileName}</b> · choose another file</span> : "Choose a CSV file (save Excel sheets as CSV UTF-8)"}
          </button>
          <input ref={input} type="file" accept=".csv,text/csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ""; if (f) read(f) }} />

          {parsed && parsed.length > 0 && (
            <div className="space-y-3">
              <p className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span><b>{good}</b> question{good === 1 ? "" : "s"} ready{Object.keys(byType).length ? ` — ${Object.entries(byType).map(([t, n]) => `${n} ${t.replace("_", " ")}`).join(", ")}` : ""}</span>
              </p>
              {problems.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {problems.length} row{problems.length === 1 ? "" : "s"} to fix — nothing is imported until the file is clean</p>
                  <ul className="mt-2 text-xs text-amber-900 space-y-0.5 max-h-40 overflow-y-auto">
                    {problems.slice(0, 50).map((p, i) => <li key={i}>Row {p.row}: {p.error}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="px-5 py-3 border-t border-slate-100 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={doImport} disabled={busy || !parsed || !good || bad.length > 0} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Import {good || ""} question{good === 1 ? "" : "s"}
          </Button>
        </div>
      </div>
    </div>
  )
}
