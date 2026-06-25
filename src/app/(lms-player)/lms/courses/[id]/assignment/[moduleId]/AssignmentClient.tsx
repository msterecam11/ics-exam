"use client"

import { useState, useRef } from "react"
import { toast } from "sonner"
import {
  Upload, FileText, CheckCircle2, Clock, Award,
  Loader2, X, AlertCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"

export interface RubricCriterion {
  id: string; criterion: string; description: string; points: number
}

export interface Submission {
  id:           string
  attempt_no:   number
  status:       "submitted" | "graded"
  score:        number | null
  max_score:    number | null
  passed:       boolean
  answers:      { file_url?: string; file_name?: string; file_size?: number; text_response?: string }
  ai_feedback:  { overall_comment?: string; criteria_scores?: { criterion: string; score: number; max: number; comment: string }[] }
  submitted_at: string
}

interface Props {
  moduleId:         string
  courseId:         string
  briefHtml:        string | null
  rubric:           RubricCriterion[]
  submissionTypes:  string[]
  dueDate:          string | null
  maxAttempts:      number
  existing:         Submission | null
}

function formatSize(bytes: number) {
  if (bytes < 1024)       return `${bytes} B`
  if (bytes < 1048576)    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1048576).toFixed(1)} MB`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  })
}

export default function AssignmentClient({
  moduleId, courseId, briefHtml, rubric, submissionTypes,
  dueDate, maxAttempts, existing,
}: Props) {
  const [submission,    setSubmission]    = useState<Submission | null>(existing)
  const [file,          setFile]          = useState<File | null>(null)
  const [textResponse,  setTextResponse]  = useState("")
  const [uploading,     setUploading]     = useState(false)
  const [dragOver,      setDragOver]      = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const totalPoints = rubric.reduce((s, c) => s + c.points, 0)
  const isPastDue   = dueDate ? new Date() > new Date(dueDate) : false
  const canSubmit   = !isPastDue && (submission ? submission.attempt_no < maxAttempts : true)

  const acceptStr = submissionTypes.flatMap(t => {
    if (t === "pdf")  return [".pdf"]
    if (t === "docx") return [".doc", ".docx"]
    return []
  }).join(",")

  function pickFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? ""
    const okExts = submissionTypes.flatMap(t => {
      if (t === "pdf")  return ["pdf"]
      if (t === "docx") return ["doc", "docx"]
      return []
    })
    if (!okExts.includes(ext)) {
      toast.error(`File type not allowed. Accepted: ${submissionTypes.join(", ").toUpperCase()}`)
      return
    }
    setFile(f)
  }

  async function handleSubmit() {
    if (!file && !textResponse.trim()) {
      toast.error("Provide a file or a written response")
      return
    }

    setUploading(true)
    try {
      let fileUrl: string | undefined
      let fileName: string | undefined
      let fileSize: number | undefined

      // 1. Upload file if provided
      if (file) {
        const form = new FormData()
        form.append("file",           file)
        form.append("module_id",      moduleId)
        form.append("allowed_types",  submissionTypes.join(","))

        const upRes = await fetch("/api/lms/student-upload", { method: "POST", body: form })
        if (!upRes.ok) {
          const d = await upRes.json()
          toast.error(d.error ?? "Upload failed")
          return
        }
        const up = await upRes.json()
        fileUrl = up.url; fileName = up.name; fileSize = up.size
      }

      // 2. Save submission (AI grading runs server-side)
      const subRes = await fetch("/api/lms/module-assignment", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          module_id:     moduleId,
          course_id:     courseId,
          file_url:      fileUrl,
          file_name:     fileName,
          file_size:     fileSize,
          text_response: textResponse.trim() || undefined,
        }),
      })
      if (!subRes.ok) {
        const d = await subRes.json()
        toast.error(d.error ?? "Submission failed")
        return
      }
      const saved = await subRes.json()
      setSubmission(saved)
      setFile(null)
      setTextResponse("")
      toast.success(saved.status === "graded" ? "Submitted and AI-graded!" : "Assignment submitted!")
    } catch {
      toast.error("Connection error — please try again")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-8">

      {/* ── Assignment brief ───────────────────────────────────── */}
      {briefHtml && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#1B4F8A]" />
            <h2 className="text-sm font-semibold text-slate-800">Assignment Brief</h2>
          </div>
          <div
            className="
              px-6 py-5
              prose prose-slate max-w-none text-sm
              [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-900 [&_h2]:mt-4 [&_h2]:mb-2
              [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-800 [&_h3]:mt-3 [&_h3]:mb-1.5
              [&_p]:text-slate-700 [&_p]:leading-relaxed [&_p]:my-2
              [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1
              [&_strong]:font-bold [&_a]:text-[#1B4F8A] [&_a]:underline
            "
            dangerouslySetInnerHTML={{ __html: briefHtml }}
          />
        </div>
      )}

      {/* ── Rubric ─────────────────────────────────────────────── */}
      {rubric.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-4 w-4 text-[#1B4F8A]" />
              <h2 className="text-sm font-semibold text-slate-800">Grading Rubric</h2>
            </div>
            <span className="text-xs font-bold text-slate-400">{totalPoints} pts total</span>
          </div>
          <div className="divide-y divide-slate-50">
            {rubric.map((c, i) => (
              <div key={c.id} className="px-6 py-4 flex items-start gap-4">
                <span className="w-7 h-7 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">{c.criterion || "—"}</p>
                  {c.description && (
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{c.description}</p>
                  )}
                </div>
                <span className="text-sm font-bold text-[#1B4F8A] shrink-0">{c.points} pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Existing submission ─────────────────────────────────── */}
      {submission && (
        <div className={cn(
          "rounded-2xl border overflow-hidden",
          submission.status === "graded"
            ? submission.passed ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
            : "border-blue-200 bg-blue-50"
        )}>
          <div className="px-6 py-4 flex items-center gap-3">
            {submission.status === "graded" ? (
              submission.passed
                ? <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                : <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            ) : (
              <Clock className="h-5 w-5 text-blue-600 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={cn("text-sm font-semibold",
                submission.status === "graded"
                  ? submission.passed ? "text-emerald-800" : "text-red-800"
                  : "text-blue-800"
              )}>
                {submission.status === "graded"
                  ? submission.passed ? "Passed (AI graded)" : "Not passed (AI graded)"
                  : "Submitted — awaiting instructor review"}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                Submitted {formatDate(submission.submitted_at)}
                {" · "}{submission.answers.file_name ?? "file"}
                {submission.answers.file_size != null
                  ? ` · ${formatSize(submission.answers.file_size)}` : ""}
              </p>
            </div>
            {submission.status === "graded" && submission.score != null && submission.max_score != null && (
              <div className="text-right shrink-0">
                <p className={cn("text-xl font-bold",
                  submission.passed ? "text-emerald-700" : "text-red-600"
                )}>
                  {submission.score}/{submission.max_score}
                </p>
                <p className="text-xs text-slate-500">pts</p>
              </div>
            )}
          </div>
          {submission.ai_feedback?.criteria_scores && submission.ai_feedback.criteria_scores.length > 0 && (
            <div className="border-t border-slate-200 px-6 py-4 space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">AI Rubric Feedback</p>
              {submission.ai_feedback.criteria_scores.map((c, i) => (
                <div key={i} className={cn(
                  "rounded-xl border px-4 py-3 text-sm",
                  c.score >= c.max * 0.5 ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
                )}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-slate-800 text-xs">{c.criterion}</span>
                    <span className={cn("text-xs font-bold", c.score >= c.max * 0.5 ? "text-emerald-700" : "text-red-600")}>
                      {c.score}/{c.max}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{c.comment}</p>
                </div>
              ))}
            </div>
          )}
          {submission.answers.file_url && (
            <div className="border-t border-slate-200 px-6 py-3 flex justify-end">
              <a href={submission.answers.file_url} target="_blank" rel="noreferrer"
                className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1">
                View submitted file
              </a>
            </div>
          )}
        </div>
      )}

      {/* ── Upload area ────────────────────────────────────────── */}
      {canSubmit && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Upload className="h-4 w-4 text-[#1B4F8A]" />
              <h2 className="text-sm font-semibold text-slate-800">
                {submission ? "Resubmit" : "Submit Assignment"}
              </h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400">
              {dueDate && (
                <span className={cn(isPastDue && "text-red-500")}>
                  Due {formatDate(dueDate)}
                </span>
              )}
              {maxAttempts < 99 && (
                <span>
                  {submission ? submission.attempt_no : 0}/{maxAttempts} submissions
                </span>
              )}
            </div>
          </div>

          <div className="px-6 py-6 space-y-4">
            {/* Drop zone */}
            <div
              onClick={() => inputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault(); setDragOver(false)
                const f = e.dataTransfer.files[0]
                if (f) pickFile(f)
              }}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all",
                dragOver
                  ? "border-[#1B4F8A] bg-[#1B4F8A]/5"
                  : file
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 hover:border-[#1B4F8A]/40 hover:bg-slate-50"
              )}
            >
              {file ? (
                <>
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-800">{file.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{formatSize(file.size)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); setFile(null) }}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 transition-colors"
                  >
                    <X className="h-3 w-3" /> Remove
                  </button>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center">
                    <Upload className="h-6 w-6 text-[#1B4F8A]" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-semibold text-slate-700">
                      Drop your file here, or click to browse
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Accepted formats: {submissionTypes.map(t => t.toUpperCase()).join(", ")} · Max 50 MB
                    </p>
                  </div>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept={acceptStr}
              className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f) }}
            />

            {/* Written response — for AI grading */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-600">
                Written response <span className="text-slate-400">(AI will grade this against the rubric)</span>
              </label>
              <textarea
                rows={5}
                className="w-full text-sm border border-slate-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/30 placeholder:text-slate-300"
                placeholder="Type your response here…"
                value={textResponse}
                onChange={e => setTextResponse(e.target.value)}
              />
            </div>

            <button
              onClick={handleSubmit}
              disabled={(!file && !textResponse.trim()) || uploading}
              className={cn(
                "w-full flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold transition-all",
                (file || textResponse.trim()) && !uploading
                  ? "bg-[#1B4F8A] text-white hover:bg-[#163f6e] shadow-sm"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              {uploading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Submitting &amp; grading…</>
              ) : (
                <><Upload className="h-4 w-4" /> {submission ? "Resubmit" : "Submit"}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Past due / no attempts left */}
      {!canSubmit && !submission && (
        <div className="bg-red-50 border border-red-200 rounded-2xl px-6 py-5 text-center">
          <p className="text-sm font-semibold text-red-700">
            {isPastDue ? "Submission deadline has passed" : "No submissions remaining"}
          </p>
        </div>
      )}
    </div>
  )
}
