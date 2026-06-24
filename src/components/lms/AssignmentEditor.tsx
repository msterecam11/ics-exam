"use client"

import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import UnderlineExt from "@tiptap/extension-underline"
import LinkExt from "@tiptap/extension-link"
import { useState, useRef, useCallback, useEffect } from "react"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  GripVertical, Plus, Trash2, ChevronDown, ChevronUp,
  Loader2, CheckCircle2, Bold, Italic, Underline,
  Heading2, Heading3, List, ListOrdered, Link as LinkIcon,
  Undo2, Redo2, Bot, Award, FileText, Calendar, RefreshCw, X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ── Types ─────────────────────────────────────────────────────────
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

export interface RubricCriterion {
  id:          string
  criterion:   string   // name/title
  description: string   // what the AI looks for
  points:      number
}


// ─────────────────────────────────────────────────────────────────
// BRIEF EDITOR (TipTap — light toolbar)
// ─────────────────────────────────────────────────────────────────

function ToolBtn({
  onClick, active, title, disabled, children,
}: { onClick: () => void; active?: boolean; title: string; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      disabled={disabled}
      title={title}
      className={cn(
        "h-7 w-7 flex items-center justify-center rounded text-sm transition-colors shrink-0",
        active   ? "bg-[#1B4F8A] text-white"       : "text-slate-600 hover:bg-slate-100",
        disabled && "opacity-30 cursor-not-allowed",
      )}
    >
      {children}
    </button>
  )
}
function Sep() { return <div className="w-px h-5 bg-slate-200 mx-0.5 shrink-0" /> }

function BriefEditor({
  moduleId,
  initialHtml,
  onSave,
}: {
  moduleId:    string
  initialHtml: string | null
  onSave:      (status: "saving" | "saved" | "unsaved") => void
}) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      UnderlineExt,
      LinkExt.configure({ openOnClick: false }),
    ],
    content: initialHtml ?? "<p></p>",
    onUpdate: ({ editor: e }) => {
      onSave("unsaved")
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        onSave("saving")
        const res = await fetch("/api/lms/modules", {
          method:  "PATCH",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ id: moduleId, assignment_brief_html: e.getHTML() }),
        })
        onSave(res.ok ? "saved" : "unsaved")
        if (!res.ok) toast.error("Brief auto-save failed")
      }, 1500)
    },
    editorProps: {
      attributes: {
        class: [
          "outline-none min-h-[220px] prose prose-slate max-w-none text-sm",
          "prose-headings:font-bold prose-headings:text-slate-900",
          "prose-h2:text-xl prose-h2:mt-4 prose-h2:mb-2",
          "prose-h3:text-base prose-h3:mt-3 prose-h3:mb-1.5",
          "prose-p:text-slate-700 prose-p:leading-relaxed prose-p:my-1.5",
          "prose-li:text-slate-700 prose-li:my-0.5",
          "prose-strong:text-slate-900 prose-a:text-[#1B4F8A] prose-a:underline",
        ].join(" "),
      },
    },
  })

  // Set initial content once on mount
  useEffect(() => {
    if (editor && initialHtml) editor.commands.setContent(initialHtml)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes("link").href as string ?? ""
    const url  = window.prompt("URL", prev)
    if (url === null) return
    if (!url) { editor.chain().focus().unsetLink().run(); return }
    editor.chain().focus().setLink({ href: url }).run()
  }, [editor])

  if (!editor) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
    </div>
  )

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Toolbar */}
      <div className="flex items-center flex-wrap gap-0.5 px-3 py-2 border-b border-slate-100 bg-slate-50 sticky top-[48px] z-10">
        <ToolBtn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <Sep />
        <ToolBtn title="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="h-3.5 w-3.5" />
        </ToolBtn>
        <Sep />
        <ToolBtn title="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline className="h-3.5 w-3.5" />
        </ToolBtn>
        <Sep />
        <ToolBtn title="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List className="h-3.5 w-3.5" />
        </ToolBtn>
        <ToolBtn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolBtn>
        <Sep />
        <ToolBtn title="Link" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolBtn>
      </div>

      {/* Content area */}
      <div className="px-6 py-5 relative">
        {!editor.getText().trim() && (
          <p className="absolute text-slate-300 text-sm pointer-events-none select-none mt-0.5">
            Describe the assignment task, context, objectives, and any specific instructions for students…
          </p>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// RUBRIC CRITERION CARD (sortable)
// ─────────────────────────────────────────────────────────────────

function SortableCriterion({
  c, index, onChange, onDelete,
}: {
  c: RubricCriterion; index: number
  onChange: (c: RubricCriterion) => void; onDelete: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: c.id })
  const [open, setOpen] = useState(true)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "bg-white border rounded-2xl overflow-hidden transition-all",
        isDragging
          ? "shadow-2xl border-[#1B4F8A]/40 z-50 rotate-[0.3deg]"
          : "border-slate-200 shadow-sm"
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-3">
        {/* Drag handle */}
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors shrink-0"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Number */}
        <span className="w-7 h-7 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0">
          {index + 1}
        </span>

        {/* Criterion name */}
        <input
          type="text"
          value={c.criterion}
          onChange={e => onChange({ ...c, criterion: e.target.value })}
          placeholder="Criterion name (e.g. Understanding of Concepts)"
          className="flex-1 px-3 h-9 text-sm font-semibold border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:bg-white transition-all min-w-0"
        />

        {/* Points */}
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="number" min="1" max="999" step="1"
            value={c.points}
            onChange={e => onChange({ ...c, points: Math.max(1, Number(e.target.value)) })}
            className="w-16 px-2 h-9 text-sm font-bold text-[#1B4F8A] text-center border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
          />
          <span className="text-xs text-slate-400">pts</span>
        </div>

        {/* Delete */}
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        {/* Collapse */}
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="p-1 rounded text-slate-300 hover:text-slate-500 transition-colors shrink-0"
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Description (AI grading instructions) */}
      {open && (
        <div className="border-t border-slate-100 px-4 pb-3 pt-3 bg-slate-50/40">
          <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
            AI Grading Instructions
          </label>
          <textarea
            value={c.description}
            onChange={e => onChange({ ...c, description: e.target.value })}
            placeholder={`What should the AI look for in this criterion?\n\nExample: "Award full points if the student correctly identifies all key factors and supports each with evidence. Deduct points proportionally for missing factors or unsupported claims."`}
            rows={3}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 resize-none transition-all"
          />
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// SUBMISSION SETTINGS PANEL
// ─────────────────────────────────────────────────────────────────

interface AssignmentConfig {
  submission_types: string[]
  due_date: string | null
  max_attempts: number
}

function SubmissionSettings({
  config, onChange,
}: { config: AssignmentConfig; onChange: (c: AssignmentConfig) => void }) {
  const [open, setOpen] = useState(false)

  function toggleType(type: string) {
    const current = config.submission_types
    const next    = current.includes(type)
      ? current.filter((t: string) => t !== type)
      : [...current, type]
    if (!next.length) return // must keep at least one
    onChange({ ...config, submission_types: next })
  }

  const typeLabels: Record<string, string> = {
    pdf:  "PDF (.pdf)",
    docx: "Word Document (.docx)",
  }
  const summary = [
    config.submission_types.map((t: string) => typeLabels[t] ?? t).join(", "),
    config.due_date ? `Due ${new Date(config.due_date).toLocaleDateString()}` : null,
    `${config.max_attempts} attempt${config.max_attempts !== 1 ? "s" : ""}`,
  ].filter(Boolean).join(" · ")

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText className="h-4 w-4 text-[#1B4F8A] shrink-0" />
          <span className="text-sm font-semibold text-slate-800 shrink-0">Submission Settings</span>
          <span className="text-xs text-slate-400 truncate">{summary}</span>
        </div>
        <ChevronDown className={cn("h-4 w-4 text-slate-400 transition-transform shrink-0 ml-3", open && "rotate-180")} />
      </button>

      {open && (
        <div className="border-t border-slate-100 px-5 py-5 space-y-5">

          {/* Accepted file types */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Accepted File Types
            </label>
            <div className="flex items-center gap-4">
              {Object.entries(typeLabels).map(([type, label]) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer group">
                  <div className={cn(
                    "w-4 h-4 rounded border-2 flex items-center justify-center transition-all",
                    config.submission_types.includes(type)
                      ? "bg-[#1B4F8A] border-[#1B4F8A]"
                      : "border-slate-300 group-hover:border-[#1B4F8A]/50"
                  )}>
                    {config.submission_types.includes(type) && (
                      <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 12 12">
                        <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={config.submission_types.includes(type)}
                    onChange={() => toggleType(type)}
                  />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Due date */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Due Date (optional)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={config.due_date ? config.due_date.slice(0, 16) : ""}
                onChange={e => onChange({ ...config, due_date: e.target.value ? e.target.value + ":00Z" : null })}
                className="px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
              />
              {config.due_date && (
                <button
                  type="button"
                  onClick={() => onChange({ ...config, due_date: null })}
                  className="p-2 rounded text-slate-400 hover:text-red-400 transition-colors"
                  title="Clear due date"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Max attempts */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3" /> Max Attempts
            </label>
            <input
              type="number" min="1" max="99"
              value={config.max_attempts}
              onChange={e => onChange({ ...config, max_attempts: Math.max(1, Number(e.target.value)) })}
              className="w-24 px-3 h-9 text-sm border border-slate-200 rounded-lg bg-slate-50 outline-none focus:ring-2 focus:ring-[#1B4F8A]/20"
            />
          </div>

          {/* AI grading info */}
          <div className="flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-xl p-4">
            <Bot className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
            <div className="text-sm text-violet-800">
              <p className="font-semibold mb-0.5">AI Evaluation</p>
              <p className="text-xs text-violet-600 leading-relaxed">
                When a student submits their file, Groq AI reads the document and evaluates it
                against each rubric criterion, assigning a score and providing written feedback
                per criterion. The instructor can review and override the AI grade.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// MAIN: AssignmentEditor
// ─────────────────────────────────────────────────────────────────

export default function AssignmentEditor({
  moduleId,
  initialBriefHtml,
  initialRubric,
}: {
  moduleId:         string
  initialBriefHtml: string | null
  initialRubric:    RubricCriterion[] | null
}) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const sensors   = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const [rubric,     setRubric]     = useState<RubricCriterion[]>(
    initialRubric?.length ? initialRubric : [
      { id: uid(), criterion: "", description: "", points: 25 },
      { id: uid(), criterion: "", description: "", points: 25 },
      { id: uid(), criterion: "", description: "", points: 25 },
      { id: uid(), criterion: "", description: "", points: 25 },
    ]
  )
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")

  const totalPoints = rubric.reduce((s, c) => s + c.points, 0)

  // ── Auto-save rubric + config ─────────────────────────────────
  const scheduleAutoSave = useCallback((r: RubricCriterion[]) => {
    setSaveStatus("unsaved")
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving")
      const res = await fetch("/api/lms/modules", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ id: moduleId, assignment_rubric: r }),
      })
      setSaveStatus(res.ok ? "saved" : "unsaved")
      if (!res.ok) toast.error("Auto-save failed")
    }, 1500)
  }, [moduleId])

  function applyRubric(next: RubricCriterion[]) {
    setRubric(next)
    scheduleAutoSave(next)
  }
  function addCriterion() {
    applyRubric([...rubric, { id: uid(), criterion: "", description: "", points: 10 }])
  }
  function deleteCriterion(id: string) {
    if (rubric.length <= 1) { toast.error("Need at least one criterion"); return }
    applyRubric(rubric.filter(c => c.id !== id))
  }
  function updateCriterion(updated: RubricCriterion) {
    applyRubric(rubric.map(c => c.id === updated.id ? updated : c))
  }
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const from = rubric.findIndex(c => c.id === active.id)
    const to   = rubric.findIndex(c => c.id === over.id)
    applyRubric(arrayMove(rubric, from, to))
  }

  return (
    <div className="max-w-3xl mx-auto pb-20 space-y-6">

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="pb-5 border-b border-slate-100">
        <p className="text-xs font-bold text-[#1B4F8A] uppercase tracking-wider mb-2">
          📋 Assignment
        </p>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-5 text-xs text-slate-400">
            <span>
              <span className="font-bold text-slate-700 text-sm">{rubric.length}</span> criteria
            </span>
            <span>
              <span className="font-bold text-slate-700 text-sm">{totalPoints}</span> total pts
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-400 shrink-0">
            {saveStatus === "saving"  && <><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>}
            {saveStatus === "saved"   && <><CheckCircle2 className="h-3 w-3 text-emerald-500" /> Auto-saved</>}
            {saveStatus === "unsaved" && <span className="text-amber-500">Unsaved</span>}
          </div>
        </div>
      </div>

      {/* ── Section 1: Assignment Brief ───────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-[#1B4F8A] text-white text-xs font-bold flex items-center justify-center shrink-0">1</span>
          <div>
            <p className="text-sm font-semibold text-slate-800">Assignment Brief</p>
            <p className="text-xs text-slate-400">Describe the task, context, and instructions for students</p>
          </div>
        </div>
        <BriefEditor
          moduleId={moduleId}
          initialHtml={initialBriefHtml}
          onSave={setSaveStatus}
        />
      </div>

      {/* ── Section 2: Grading Rubric ─────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-[#1B4F8A] text-white text-xs font-bold flex items-center justify-center shrink-0">2</span>
            <div>
              <p className="text-sm font-semibold text-slate-800">Grading Rubric</p>
              <p className="text-xs text-slate-400">AI evaluates each criterion independently and assigns partial scores</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Award className="h-3.5 w-3.5 text-[#1B4F8A]" />
            <span className="text-sm font-bold text-[#1B4F8A]">{totalPoints} pts total</span>
          </div>
        </div>

        {/* AI info banner */}
        <div className="flex items-start gap-3 bg-violet-50 border border-violet-100 rounded-2xl p-4">
          <Bot className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
          <div className="text-xs text-violet-700 leading-relaxed">
            <span className="font-semibold">How AI grading works: </span>
            Students upload their work (PDF / Word). Groq AI reads the document, scores each
            criterion against your instructions, and writes feedback. Instructors review and
            can override any score before it&apos;s finalised.
          </div>
        </div>

        {/* Criteria list */}
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={rubric.map(c => c.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {rubric.map((c, i) => (
                <SortableCriterion
                  key={c.id}
                  c={c}
                  index={i}
                  onChange={updateCriterion}
                  onDelete={() => deleteCriterion(c.id)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>

        {/* Points bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Points</span>
          <span className="text-lg font-bold text-[#1B4F8A]">{totalPoints}</span>
        </div>

        {/* Add criterion */}
        <button
          onClick={addCriterion}
          className="flex items-center gap-2 px-4 py-2.5 w-full border-2 border-dashed border-slate-200 rounded-2xl text-sm text-slate-500 hover:border-[#1B4F8A]/40 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/2 transition-all"
        >
          <Plus className="h-4 w-4" /> Add Criterion
        </button>
      </div>

    </div>
  )
}
