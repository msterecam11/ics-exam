"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2,
  Download, Loader2, ExternalLink, AlertCircle,
  PlayCircle, Pause, Volume2, VolumeX, Maximize,
  Shield, AlertTriangle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ContentItem {
  id:               string
  title:            string
  type:             string
  content:          Record<string, any>
  download_allowed: boolean
  is_mandatory:     boolean
  completion_rule:  { type: string; threshold?: number }
}

interface Props {
  courseId:       string
  courseTitle:    string
  item:           ContentItem
  moduleTitle:    string
  studentId:      string
  studentName:    string
  resumePosition: Record<string, any> | null
  resumeStatus:   string | null
  nextItem:       { id: string; title: string; type: string } | null
}

// â”€â”€ Save progress debounced â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function useSaveProgress(
  courseId: string, item: ContentItem, moduleId: string
) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const save = useCallback(async (
    status: string,
    position: Record<string, any>,
    timeSpent?: number
  ) => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        await fetch("/api/lms/progress", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            content_item_id: item.id,
            module_id:       moduleId,
            course_id:       courseId,
            status,
            position,
            ...(timeSpent !== undefined ? { time_spent: timeSpent } : {}),
          }),
        })
      } catch (_) { /* silent */ }
    }, 1500)
  }, [courseId, item.id, moduleId])

  return save
}

// â”€â”€ Video Player â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function VideoPlayer({
  url, resumeSecond, onProgress, onComplete, downloadAllowed, studentName,
}: {
  url: string; resumeSecond: number | null
  onProgress: (second: number) => void
  onComplete: () => void
  downloadAllowed: boolean; studentName: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [completed,  setCompleted]  = useState(false)
  const [muted,      setMuted]      = useState(false)

  useEffect(() => {
    if (resumeSecond && videoRef.current) {
      videoRef.current.currentTime = resumeSecond
    }
  }, [resumeSecond])

  function handleTimeUpdate() {
    const v = videoRef.current
    if (!v) return
    const second = Math.floor(v.currentTime)
    onProgress(second)
    if (!completed && v.duration > 0 && v.currentTime / v.duration >= 0.9) {
      setCompleted(true)
      onComplete()
    }
  }

  return (
    <div className="relative w-full bg-black rounded-xl overflow-hidden group">
      <video
        ref={videoRef}
        src={url}
        controls
        muted={muted}
        className="w-full max-h-[70vh] object-contain"
        onTimeUpdate={handleTimeUpdate}
        onContextMenu={downloadAllowed ? undefined : e => e.preventDefault()}
        controlsList={downloadAllowed ? undefined : "nodownload"}
      />

      {/* Watermark when download disabled */}
      {!downloadAllowed && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.07] rotate-[-20deg] text-white text-4xl font-bold select-none">
          {studentName}
        </div>
      )}
    </div>
  )
}

// â”€â”€ PPT / Slide Player â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PptPlayer({
  url, slideCount, resumeSlide, onProgress, onComplete, downloadAllowed, studentName,
}: {
  url: string; slideCount: number | null; resumeSlide: number | null
  onProgress: (slide: number) => void
  onComplete: () => void
  downloadAllowed: boolean; studentName: string
}) {
  const total = slideCount ?? 1
  const [slide, setSlide] = useState(resumeSlide ?? 1)
  const [done,  setDone]  = useState(false)

  function go(n: number) {
    const next = Math.max(1, Math.min(total, n))
    setSlide(next)
    onProgress(next)
    if (!done && next >= total) {
      setDone(true)
      onComplete()
    }
  }

  // Try to render via Google Slides viewer for .pptx URLs
  const isGdrive = url.includes("docs.google.com") || url.includes("drive.google.com")
  const viewerUrl = isGdrive
    ? url
    : `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}&slide=${slide}`

  return (
    <div className="space-y-3">
      <div
        className="relative w-full rounded-xl overflow-hidden border border-slate-200 bg-white"
        style={{ paddingBottom: "56.25%" }}
        onContextMenu={downloadAllowed ? undefined : e => e.preventDefault()}
      >
        <iframe
          src={viewerUrl}
          className="absolute inset-0 w-full h-full"
          frameBorder="0"
          allowFullScreen
          title="Slide viewer"
        />
        {!downloadAllowed && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.06] rotate-[-20deg] text-slate-800 text-5xl font-bold select-none">
            {studentName}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => go(slide - 1)} disabled={slide <= 1}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <span className="text-sm text-slate-500">
          Slide {slide} / {total}
          <span className="mx-1 text-slate-300">Â·</span>
          <button onClick={() => go(total)} className="text-xs text-[#1B4F8A] hover:underline">Jump to end</button>
        </span>
        <Button variant="outline" size="sm" onClick={() => go(slide + 1)} disabled={slide >= total}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// â”€â”€ PDF Viewer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function PdfViewer({
  url, pageCount, resumePage, onProgress, onComplete, downloadAllowed, studentName,
}: {
  url: string; pageCount: number | null; resumePage: number | null
  onProgress: (page: number) => void
  onComplete: () => void
  downloadAllowed: boolean; studentName: string
}) {
  const total = pageCount ?? 1
  const [page, setPage] = useState(resumePage ?? 1)
  const [done, setDone] = useState(false)

  function go(n: number) {
    const next = Math.max(1, Math.min(total, n))
    setPage(next)
    onProgress(next)
    if (!done && next >= total) {
      setDone(true)
      onComplete()
    }
  }

  const pdfUrl = downloadAllowed ? `${url}#page=${page}` : `${url}#toolbar=0&navpanes=0&page=${page}`

  return (
    <div className="space-y-3">
      <div
        className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100"
        style={{ height: "70vh" }}
        onContextMenu={downloadAllowed ? undefined : e => e.preventDefault()}
      >
        <iframe
          src={pdfUrl}
          className="w-full h-full"
          title="PDF Viewer"
        />
        {!downloadAllowed && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.05] rotate-[-20deg] text-slate-800 text-6xl font-bold select-none">
            {studentName}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => go(page - 1)} disabled={page <= 1}>
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <span className="text-sm text-slate-500">Page {page} / {total}</span>
        <Button variant="outline" size="sm" onClick={() => go(page + 1)} disabled={page >= total}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      {downloadAllowed && (
        <a href={url} download target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-[#1B4F8A] hover:underline">
          <Download className="h-4 w-4" /> Download PDF
        </a>
      )}
    </div>
  )
}

// â”€â”€ Text / Rich Content â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function TextContent({ html, onComplete }: { html: string; onComplete: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    function handleScroll() {
      if (!el || done) return
      const { scrollTop, scrollHeight, clientHeight } = el
      const pct = (scrollTop + clientHeight) / scrollHeight
      if (pct >= 0.9) { setDone(true); onComplete() }
    }
    el.addEventListener("scroll", handleScroll)
    return () => el.removeEventListener("scroll", handleScroll)
  }, [done, onComplete])

  return (
    <div
      ref={ref}
      className="bg-white rounded-xl border border-slate-200 p-6 max-h-[70vh] overflow-y-auto prose prose-slate max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

// â”€â”€ Link / Embed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LinkContent({ url, openInTab, onComplete }: { url: string; openInTab: boolean; onComplete: () => void }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-4">
      <ExternalLink className="h-12 w-12 text-slate-300 mx-auto" />
      <p className="text-slate-600">This item links to an external resource.</p>
      <a
        href={url}
        target={openInTab ? "_blank" : "_self"}
        rel="noreferrer"
        onClick={onComplete}
        className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1B4F8A] text-white rounded-xl text-sm font-medium hover:bg-[#163f6e] transition-colors"
      >
        Open Link <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  )
}

// â”€â”€ Steps â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StepsContent({
  steps, resumeStep, onProgress, onComplete,
}: {
  steps: { title: string; body: string; image_url?: string }[]
  resumeStep: number | null
  onProgress: (step: number) => void
  onComplete: () => void
}) {
  const [step, setStep] = useState(resumeStep ?? 0)
  const [done, setDone] = useState(false)
  const current = steps[step]

  function go(n: number) {
    const next = Math.max(0, Math.min(steps.length - 1, n))
    setStep(next)
    onProgress(next)
    if (!done && next >= steps.length - 1) { setDone(true); onComplete() }
  }

  if (!steps.length) return <p className="text-slate-400 text-center py-12">No steps defined.</p>

  return (
    <div className="space-y-4">
      {/* Progress dots */}
      <div className="flex items-center gap-2 flex-wrap">
        {steps.map((_, i) => (
          <button key={i} onClick={() => go(i)}
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-all",
              i === step ? "bg-[#1B4F8A] scale-125" : i < step ? "bg-[#1B4F8A]/40" : "bg-slate-200"
            )}
          />
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#1B4F8A] bg-[#1B4F8A]/10 px-2 py-0.5 rounded-full">
            Step {step + 1} of {steps.length}
          </span>
          <h2 className="text-lg font-semibold text-slate-900">{current.title}</h2>
        </div>
        {current.image_url && (
          <Image src={current.image_url} alt={current.title} width={700} height={400}
            className="rounded-lg object-cover w-full max-h-64" />
        )}
        <p className="text-slate-600 whitespace-pre-line">{current.body}</p>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => go(step - 1)} disabled={step <= 0}>
          <ChevronLeft className="h-4 w-4" /> Previous
        </Button>
        {step < steps.length - 1
          ? <Button size="sm" onClick={() => go(step + 1)} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          : <Button size="sm" onClick={onComplete} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <CheckCircle2 className="h-4 w-4" /> Complete
            </Button>}
      </div>
    </div>
  )
}

// â”€â”€ Final Exam Shell (anti-cheating wrapper) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FinalExamShell({ title, children }: { title: string; children: React.ReactNode }) {
  const [started, setStarted] = useState(false)
  const [tabWarn, setTabWarn] = useState(false)
  const [fsWarn,  setFsWarn]  = useState(false)
  const tabLeft = useRef<number | null>(null)

  useEffect(() => {
    if (!started) return

    function onVis() {
      if (document.visibilityState === "hidden") {
        tabLeft.current = Date.now()
      } else if (tabLeft.current) {
        tabLeft.current = null
        setTabWarn(true)
        setTimeout(() => setTabWarn(false), 4000)
      }
    }
    function onFs() {
      if (!document.fullscreenElement) setFsWarn(true)
      else setFsWarn(false)
    }
    function onCtx(e: MouseEvent)       { e.preventDefault() }
    function onCopy(e: ClipboardEvent)  { e.preventDefault() }
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && ["c","x","v","a"].includes(e.key.toLowerCase())) e.preventDefault()
    }

    document.addEventListener("visibilitychange", onVis)
    document.addEventListener("fullscreenchange",  onFs)
    document.addEventListener("contextmenu",       onCtx)
    document.addEventListener("copy",              onCopy)
    document.addEventListener("cut",               onCopy)
    document.addEventListener("paste",             onCopy)
    document.addEventListener("keydown",           onKey)
    return () => {
      document.removeEventListener("visibilitychange", onVis)
      document.removeEventListener("fullscreenchange",  onFs)
      document.removeEventListener("contextmenu",       onCtx)
      document.removeEventListener("copy",              onCopy)
      document.removeEventListener("cut",               onCopy)
      document.removeEventListener("paste",             onCopy)
      document.removeEventListener("keydown",           onKey)
    }
  }, [started])

  // Intro screen (renders inline, not fullscreen)
  if (!started) {
    return (
      <div className="max-w-2xl space-y-5">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">ðŸ†</span>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{title}</h2>
              <p className="text-sm text-amber-700 font-medium">Final Examination</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-slate-700">
            <Shield className="h-4 w-4 text-[#1B4F8A]" /> Exam Rules
          </div>
          <ul className="space-y-1.5 text-sm text-slate-600">
            {[
              "Exam runs in fullscreen â€” exiting is recorded",
              "Tab switching is monitored and logged",
              "Copy, paste, and right-click are disabled",
              "Do not refresh or close this tab during the exam",
            ].map((r, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-[#1B4F8A] font-bold shrink-0 mt-0.5">â€º</span>{r}
              </li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => {
            document.documentElement.requestFullscreen?.().catch(() => {})
            setStarted(true)
          }}
          className="w-full py-3.5 bg-[#1B4F8A] text-white font-bold rounded-xl text-sm hover:bg-[#163f6f] transition-colors flex items-center justify-center gap-2"
        >
          <Maximize className="h-4 w-4" /> Begin Exam
        </button>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-white z-50 flex flex-col"
      style={{ userSelect: "none", WebkitUserSelect: "none" } as React.CSSProperties}
    >
      {tabWarn && (
        <div className="bg-amber-500 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2 shrink-0">
          <AlertTriangle className="h-4 w-4" /> Warning: Tab switching has been recorded.
        </div>
      )}
      {fsWarn && (
        <div className="bg-red-600 text-white text-sm font-medium text-center py-2 px-4 flex items-center justify-center gap-2 shrink-0">
          <AlertTriangle className="h-4 w-4" />
          You exited fullscreen â€” this has been recorded.
          <button onClick={() => document.documentElement.requestFullscreen?.()} className="underline ml-2 font-bold">
            Return to fullscreen
          </button>
        </div>
      )}
      <header className="bg-[#1B4F8A] text-white shrink-0 px-4 py-3 shadow">
        <p className="text-xs text-white/60">Final Exam</p>
        <p className="text-sm font-semibold truncate">{title}</p>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {children}
        </div>
      </div>
    </div>
  )
}

// â”€â”€ Quiz Player â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type QuizState = "loading" | "ready" | "submitting" | "result" | "error"

interface QuizQuestion {
  id:          string
  text_en:     string
  type:        string
  score:       number
  difficulty:  string
  lms_question_choices: { id: string; text_en: string; order_index: number }[]
}

interface QuizData {
  id:                string
  title:             string
  pass_score:        number
  time_limit_minutes: number | null
  max_attempts:      number | null
  show_answers_after: boolean
  lms_quiz_questions: { question_id: string; order_index: number; lms_questions: QuizQuestion }[]
}

function QuizPlayer({
  quizId, contentItemId, courseId, moduleId, onComplete, alreadyCompleted,
}: {
  quizId: string; contentItemId: string; courseId: string; moduleId: string
  onComplete: () => void; alreadyCompleted: boolean
}) {
  const [state,    setState]    = useState<QuizState>("loading")
  const [quiz,     setQuiz]     = useState<QuizData | null>(null)
  const [answers,  setAnswers]  = useState<Record<string, string[]>>({})
  const [result,   setResult]   = useState<{
    pct: number; passed: boolean; score: number; total_score: number;
    scored?: { question_id: string; correct: boolean; earned: number; max: number; correct_choices?: string[] }[]
  } | null>(null)
  const [attempts, setAttempts] = useState<{ id: string; pct: number; passed: boolean; submitted_at: string }[]>([])
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function load() {
      const [quizRes, attRes] = await Promise.all([
        fetch(`/api/lms/quizzes?quiz_id=${quizId}`),
        fetch(`/api/lms/quiz-attempt?quiz_id=${quizId}`),
      ])
      if (!quizRes.ok) { setState("error"); return }
      const quizData = await quizRes.json()
      const attData  = attRes.ok ? await attRes.json() : []
      setQuiz(quizData)
      setAttempts(Array.isArray(attData) ? attData.map((a: any) => ({
        id: a.id, pct: a.total_score > 0 ? Math.round(a.score / a.total_score * 100) : 0,
        passed: a.passed, submitted_at: a.submitted_at,
      })) : [])
      // Init answers
      const init: Record<string, string[]> = {}
      for (const qq of quizData.lms_quiz_questions ?? []) {
        init[qq.lms_questions.id] = []
      }
      setAnswers(init)
      setState("ready")

      // Timer
      if (quizData.time_limit_minutes) {
        setTimeLeft(quizData.time_limit_minutes * 60)
      }
    }
    load()
  }, [quizId])

  // Timer countdown
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 1) {
          clearInterval(timerRef.current!)
          handleSubmit()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft !== null && state === "ready"])

  function toggleChoice(questionId: string, choiceId: string, single: boolean) {
    setAnswers(prev => {
      const current = prev[questionId] ?? []
      if (single) {
        return { ...prev, [questionId]: [choiceId] }
      }
      const has = current.includes(choiceId)
      return {
        ...prev,
        [questionId]: has ? current.filter(c => c !== choiceId) : [...current, choiceId],
      }
    })
  }

  async function handleSubmit() {
    if (!quiz) return
    setState("submitting")

    const answersArr = Object.entries(answers).map(([question_id, choice_ids]) => ({
      question_id, choice_ids,
    }))

    const res = await fetch("/api/lms/quiz-attempt", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        quiz_id:         quizId,
        content_item_id: contentItemId,
        course_id:       courseId,
        answers:         answersArr,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setState("error"); toast.error(data.error ?? "Submission failed"); return }

    setResult(data)
    setState("result")
    if (data.passed) onComplete()
  }

  const questions = (quiz?.lms_quiz_questions ?? [])
    .sort((a, b) => a.order_index - b.order_index)
    .map(qq => qq.lms_questions)

  const answered = Object.values(answers).filter(a => a.length > 0).length
  const total    = questions.length

  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`

  if (state === "loading") return (
    <div className="flex justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-[#1B4F8A]" />
    </div>
  )

  if (state === "error") return (
    <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
      <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
      <p className="text-slate-600">Failed to load quiz. Please refresh.</p>
    </div>
  )

  if (state === "result" && result) {
    const scored = result.scored ?? []
    return (
      <div className="space-y-4">
        {/* Score card */}
        <div className={cn(
          "rounded-2xl border p-8 text-center",
          result.passed ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
        )}>
          <div className={cn(
            "w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl font-bold",
            result.passed ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"
          )}>
            {result.pct}%
          </div>
          <h3 className={cn("text-2xl font-bold mb-1", result.passed ? "text-emerald-700" : "text-red-600")}>
            {result.passed ? "Passed! ðŸŽ‰" : "Not Passed"}
          </h3>
          <p className="text-slate-600">
            You scored {result.score} / {result.total_score} points
            &nbsp;Â·&nbsp;Pass mark: {quiz?.pass_score}%
          </p>

          {!result.passed && quiz?.max_attempts && (
            <p className="text-sm text-slate-500 mt-2">
              {attempts.length} / {quiz.max_attempts} attempts used
            </p>
          )}
        </div>

        {/* Answer review */}
        {scored.length > 0 && quiz?.show_answers_after && (
          <div className="space-y-3">
            <h4 className="font-semibold text-slate-800">Answer Review</h4>
            {questions.map(q => {
              const s = scored.find(sc => sc.question_id === q.id)
              if (!s) return null
              return (
                <div key={q.id} className={cn(
                  "bg-white rounded-xl border p-4 space-y-2",
                  s.correct ? "border-emerald-200" : "border-red-200"
                )}>
                  <div className="flex items-start gap-2">
                    {s.correct
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      : <AlertCircle  className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />}
                    <p className="text-sm font-medium text-slate-900">{q.text_en}</p>
                  </div>
                  <div className="ml-6 space-y-1">
                    {q.lms_question_choices.map(c => {
                      const selected = answers[q.id]?.includes(c.id)
                      const correct  = s.correct_choices?.includes(c.id)
                      return (
                        <div key={c.id} className={cn(
                          "text-xs px-2 py-1 rounded flex items-center gap-1.5",
                          correct   ? "bg-emerald-50 text-emerald-700 font-medium" :
                          selected  ? "bg-red-50 text-red-600" :
                          "text-slate-500"
                        )}>
                          {correct ? "âœ“" : selected ? "âœ—" : "â—‹"} {c.text_en}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Actions */}
        {!result.passed && (!quiz?.max_attempts || attempts.length < quiz.max_attempts) && (
          <Button
            onClick={() => {
              const init: Record<string, string[]> = {}
              for (const q of questions) init[q.id] = []
              setAnswers(init)
              setResult(null)
              setState("ready")
              if (quiz?.time_limit_minutes) setTimeLeft(quiz.time_limit_minutes * 60)
            }}
            className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2"
          >
            Retry Quiz
          </Button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Quiz header */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{quiz?.title}</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {total} questions Â· Pass: {quiz?.pass_score}%
            {quiz?.max_attempts && ` Â· ${quiz.max_attempts} attempt(s)`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {timeLeft !== null && (
            <div className={cn(
              "font-mono text-sm font-bold px-3 py-1.5 rounded-lg",
              timeLeft < 60 ? "bg-red-100 text-red-600" : "bg-slate-100 text-slate-700"
            )}>
              â± {fmtTime(timeLeft)}
            </div>
          )}
          <div className="text-xs text-slate-500">{answered}/{total} answered</div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#1B4F8A] rounded-full transition-all"
          style={{ width: total > 0 ? `${(answered / total) * 100}%` : "0%" }}
        />
      </div>

      {/* Past attempts */}
      {attempts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
          Previous attempts: {attempts.map((a, i) => (
            <span key={a.id}>
              {i > 0 && " Â· "}
              {a.pct}% {a.passed ? "âœ“" : "âœ—"}
            </span>
          ))}
          {quiz?.max_attempts && ` (${attempts.length}/${quiz.max_attempts} used)`}
        </div>
      )}

      {/* Questions */}
      {questions.map((q, qi) => {
        const isSingle = q.type === "mcq_single"
        return (
          <div key={q.id} className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-start gap-3">
              <span className="shrink-0 w-7 h-7 rounded-full bg-[#1B4F8A]/10 text-[#1B4F8A] font-bold text-sm flex items-center justify-center">
                {qi + 1}
              </span>
              <div>
                <p className="font-medium text-slate-900">{q.text_en}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {isSingle ? "Single answer" : "Multiple answers"} Â· {q.score} pt{q.score !== 1 ? "s" : ""}
                </p>
              </div>
            </div>

            <div className="space-y-2 ml-10">
              {q.lms_question_choices.map(c => {
                const selected = answers[q.id]?.includes(c.id) ?? false
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleChoice(q.id, c.id, isSingle)}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-xl border text-sm transition-all",
                      selected
                        ? "border-[#1B4F8A] bg-[#1B4F8A]/5 text-[#1B4F8A] font-medium"
                        : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    <span className={cn(
                      "inline-flex items-center justify-center w-5 h-5 rounded mr-2 border text-xs shrink-0",
                      selected
                        ? "bg-[#1B4F8A] border-[#1B4F8A] text-white"
                        : "border-slate-300"
                    )}>
                      {isSingle ? (selected ? "â—" : "") : (selected ? "âœ“" : "")}
                    </span>
                    {c.text_en}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      {/* Submit */}
      <div className="sticky bottom-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-lg flex items-center justify-between gap-4">
          <p className="text-sm text-slate-500">
            {answered < total
              ? `${total - answered} question${total - answered !== 1 ? "s" : ""} unanswered`
              : "All questions answered â€” ready to submit!"}
          </p>
          <Button
            onClick={handleSubmit}
            disabled={state === "submitting" || answered === 0}
            className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2 shrink-0"
          >
            {state === "submitting"
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Submittingâ€¦</>
              : "Submit Quiz"}
          </Button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€ Assignment Player â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type AssignState = "loading" | "idle" | "submitting" | "submitted"

function AssignmentPlayer({
  contentItemId, courseId, content, onComplete, alreadyCompleted,
}: {
  contentItemId: string; courseId: string
  content: Record<string, any>
  onComplete: () => void; alreadyCompleted: boolean
}) {
  const [state,       setState]       = useState<AssignState>("loading")
  const [existing,    setExisting]    = useState<any>(null)
  const [textInput,   setTextInput]   = useState("")
  const [file,        setFile]        = useState<File | null>(null)
  const [uploading,   setUploading]   = useState(false)
  const [showGrading, setShowGrading] = useState(false)

  const instructions  = content?.instructions?.trim() || null
  const maxScore      = content?.max_score   ?? null
  const allowText     = content?.allow_text  !== false
  const allowFile     = content?.allow_file  !== false

  useEffect(() => {
    fetch(`/api/lms/assignments?content_item_id=${contentItemId}`)
      .then(r => r.json())
      .then(data => {
        if (data) { setExisting(data); setTextInput(data.text_response ?? "") }
        setState(data ? "submitted" : "idle")
      })
  }, [contentItemId])

  async function submit() {
    if (!textInput.trim() && !file)
      return toast.error("Add a text response or attach a file")
    setState("submitting")

    let fileUrl  = null
    let fileName = null
    let fileSize = null

    // Upload file if provided
    if (file) {
      setUploading(true)
      const fd = new FormData()
      fd.append("file", file)
      fd.append("folder_id", "assignments")
      const upRes = await fetch("/api/lms/library/files", { method: "POST", body: fd })
      if (!upRes.ok) { toast.error("File upload failed"); setState("idle"); setUploading(false); return }
      const upData = await upRes.json()
      fileUrl  = upData.public_url
      fileName = upData.name
      fileSize = file.size
      setUploading(false)
    }

    const res = await fetch("/api/lms/assignments", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        content_item_id: contentItemId,
        course_id:       courseId,
        text_response:   textInput.trim() || null,
        file_url:        fileUrl,
        file_name:       fileName,
        file_size:       fileSize,
      }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Submission failed"); setState("idle"); return }
    setExisting(data)
    setState("submitted")
    toast.success("Assignment submitted!")
    onComplete()
  }

  if (state === "loading") return (
    <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-[#1B4F8A]" /></div>
  )

  // â”€â”€ Graded result view â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (existing?.status === "graded" || existing?.status === "returned") {
    const pct = existing.max_score > 0 ? Math.round(existing.score / existing.max_score * 100) : null
    return (
      <div className="space-y-4">
        <div className={cn(
          "rounded-2xl border p-6",
          pct !== null && pct >= 60 ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
        )}>
          <div className="flex items-start gap-4">
            <div className={cn(
              "w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold shrink-0",
              pct !== null && pct >= 60 ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            )}>
              {pct !== null ? `${pct}%` : "âœ“"}
            </div>
            <div>
              <p className="font-semibold text-slate-900">Assignment Graded</p>
              {existing.score !== null && (
                <p className="text-sm text-slate-600">
                  Score: {existing.score} / {existing.max_score ?? "â€”"} pts
                </p>
              )}
              <p className="text-xs text-slate-400 mt-0.5">
                Graded {existing.graded_at ? new Date(existing.graded_at).toLocaleDateString("en-GB") : ""}
              </p>
            </div>
          </div>
          {existing.feedback && (
            <div className="mt-4 pt-4 border-t border-current/10">
              <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Instructor Feedback</p>
              <p className="text-sm text-slate-700 whitespace-pre-line">{existing.feedback}</p>
            </div>
          )}
        </div>
        {/* Show original submission */}
        <details className="bg-white rounded-xl border border-slate-200 p-4">
          <summary className="text-sm font-medium text-slate-600 cursor-pointer">Your submission</summary>
          <div className="mt-3 space-y-2">
            {existing.text_response && (
              <p className="text-sm text-slate-700 whitespace-pre-line bg-slate-50 rounded-lg p-3">{existing.text_response}</p>
            )}
            {existing.file_url && (
              <a href={existing.file_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 text-sm text-[#1B4F8A] hover:underline">
                <Download className="h-3.5 w-3.5" /> {existing.file_name ?? "Attachment"}
              </a>
            )}
          </div>
        </details>
      </div>
    )
  }

  // â”€â”€ Submitted (awaiting grading) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (state === "submitted" && existing) {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-6 flex items-start gap-4">
          <CheckCircle2 className="h-8 w-8 text-blue-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-blue-900">Assignment Submitted</p>
            <p className="text-sm text-blue-700 mt-0.5">
              Submitted {new Date(existing.submitted_at).toLocaleDateString("en-GB", {
                day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
              })}
            </p>
            <p className="text-xs text-blue-600 mt-2">Your instructor will review and grade it shortly.</p>
          </div>
        </div>
        {/* Show what was submitted */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase">Your Submission</p>
          {existing.text_response && (
            <p className="text-sm text-slate-700 whitespace-pre-line bg-slate-50 rounded-lg p-3">{existing.text_response}</p>
          )}
          {existing.file_url && (
            <a href={existing.file_url} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm text-[#1B4F8A] hover:underline">
              <Download className="h-3.5 w-3.5" /> {existing.file_name ?? "Attachment"}
            </a>
          )}
        </div>
        <button onClick={() => { setState("idle") }}
          className="text-sm text-slate-400 hover:text-slate-600 underline">
          Edit submission
        </button>
      </div>
    )
  }

  // â”€â”€ Submission form â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="space-y-4">
      {/* Instructions */}
      {instructions && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Assignment Instructions</p>
          <div className="text-sm text-slate-700 whitespace-pre-line">{instructions}</div>
          {maxScore && (
            <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
              Maximum score: <span className="font-semibold text-slate-600">{maxScore} pts</span>
            </p>
          )}
        </div>
      )}

      {/* Text response */}
      {allowText && (
        <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Your Response {!allowFile && <span className="text-red-500">*</span>}
          </label>
          <textarea
            value={textInput}
            onChange={e => setTextInput(e.target.value)}
            rows={8}
            placeholder="Write your answer hereâ€¦"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:border-[#1B4F8A]/40"
          />
          <p className="text-xs text-slate-400 text-right">{textInput.length} characters</p>
        </div>
      )}

      {/* File upload */}
      {allowFile && (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-5">
          <p className="text-sm font-medium text-slate-700 mb-2">Attach a File (optional)</p>
          <input
            type="file"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
            className="text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-[#1B4F8A]/10 file:text-[#1B4F8A] hover:file:bg-[#1B4F8A]/20 cursor-pointer"
          />
          {file && (
            <p className="text-xs text-slate-500 mt-2">
              {file.name} ({(file.size / 1024).toFixed(0)} KB)
            </p>
          )}
        </div>
      )}

      <Button
        onClick={submit}
        disabled={state === "submitting" || uploading}
        className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2"
      >
        {state === "submitting" || uploading
          ? <><Loader2 className="h-4 w-4 animate-spin" /> {uploading ? "Uploadingâ€¦" : "Submittingâ€¦"}</>
          : <><CheckCircle2 className="h-4 w-4" /> Submit Assignment</>}
      </Button>
    </div>
  )
}

// â”€â”€ Main ContentPlayer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function ContentPlayer({
  courseId, courseTitle, item, moduleTitle,
  studentId, studentName, resumePosition, resumeStatus, nextItem,
}: Props) {
  const [completed,  setCompleted]  = useState(resumeStatus === "completed")
  const [saving,     setSaving]     = useState(false)
  const [timeSpent,  setTimeSpent]  = useState(0)
  const startTime = useRef(Date.now())

  // Block right-click on the whole player if download not allowed
  function handleContextMenu(e: React.MouseEvent) {
    if (!item.download_allowed) e.preventDefault()
  }

  // Block download shortcuts if download not allowed
  useEffect(() => {
    if (item.download_allowed) return
    function handleKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && ["s","p"].includes(e.key.toLowerCase())) {
        e.preventDefault()
      }
    }
    window.addEventListener("keydown", handleKey)
    return () => window.removeEventListener("keydown", handleKey)
  }, [item.download_allowed])

  // Track time spent on page
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeSpent(prev => prev + 5)
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const moduleId  = (item as any).lms_modules?.id ?? ""
  const saveProgress = useSaveProgress(courseId, item, moduleId)

  const onProgress = useCallback((position: Record<string, any>) => {
    saveProgress("in_progress", position, Math.floor((Date.now() - startTime.current) / 1000))
  }, [saveProgress])

  const onComplete = useCallback(async () => {
    if (completed) return
    setSaving(true)
    try {
      await fetch("/api/lms/progress", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          content_item_id: item.id,
          module_id:       moduleId,
          course_id:       courseId,
          status:          "completed",
          position:        {},
          time_spent:      Math.floor((Date.now() - startTime.current) / 1000),
        }),
      })
      setCompleted(true)
      toast.success("âœ… Item completed!")
    } catch {
      toast.error("Failed to save progress")
    } finally {
      setSaving(false)
    }
  }, [completed, item.id, moduleId, courseId])

  const content = item.content

  return (
    <div className="min-h-screen bg-slate-50" onContextMenu={handleContextMenu}>
      {/* Header */}
      <header className="bg-[#1B4F8A] text-white sticky top-0 z-30 shadow">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/lms/courses/${courseId}`}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Image src="/logo/logo-white.png" alt="ICS" width={80} height={22} className="object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white/50 truncate hidden sm:block">{courseTitle} / {moduleTitle}</p>
            <p className="text-sm font-medium truncate">{item.title}</p>
          </div>
          {completed && (
            <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Title */}
        <div>
          <h1 className="text-xl font-bold text-slate-900">{item.title}</h1>
          <p className="text-sm text-slate-400 mt-0.5 uppercase">{item.type}</p>
        </div>

        {/* Resume banner */}
        {resumePosition && resumeStatus === "in_progress" && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
            <PlayCircle className="h-4 w-4 shrink-0" />
            Resuming from where you left off
          </div>
        )}

        {/* Content renderer */}
        {item.type === "video" && content.url && (
          <VideoPlayer
            url={content.url}
            resumeSecond={resumePosition?.second ?? null}
            onProgress={s => onProgress({ second: s })}
            onComplete={onComplete}
            downloadAllowed={item.download_allowed}
            studentName={studentName}
          />
        )}

        {item.type === "ppt" && content.url && (
          <PptPlayer
            url={content.url}
            slideCount={content.slide_count ?? null}
            resumeSlide={resumePosition?.slide ?? null}
            onProgress={s => onProgress({ slide: s })}
            onComplete={onComplete}
            downloadAllowed={item.download_allowed}
            studentName={studentName}
          />
        )}

        {item.type === "pdf" && content.url && (
          <PdfViewer
            url={content.url}
            pageCount={content.page_count ?? null}
            resumePage={resumePosition?.page ?? null}
            onProgress={p => onProgress({ page: p })}
            onComplete={onComplete}
            downloadAllowed={item.download_allowed}
            studentName={studentName}
          />
        )}

        {item.type === "text" && (
          <TextContent
            html={content.html_en ?? ""}
            onComplete={onComplete}
          />
        )}

        {item.type === "image" && content.url && (
          <div className="space-y-2" onContextMenu={item.download_allowed ? undefined : e => e.preventDefault()}>
            <div className="relative rounded-xl overflow-hidden border border-slate-200">
              <Image
                src={content.url}
                alt={item.title}
                width={900}
                height={600}
                className="w-full object-contain max-h-[70vh]"
              />
              {!item.download_allowed && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-[0.06] rotate-[-20deg] text-slate-800 text-6xl font-bold select-none">
                  {studentName}
                </div>
              )}
            </div>
            {content.caption && <p className="text-sm text-slate-500 text-center">{content.caption}</p>}
            {!completed && (
              <Button onClick={onComplete} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
                <CheckCircle2 className="h-4 w-4" /> Mark as Viewed
              </Button>
            )}
          </div>
        )}

        {item.type === "link" && (
          <LinkContent
            url={content.url ?? "#"}
            openInTab={content.open_in_tab ?? true}
            onComplete={onComplete}
          />
        )}

        {item.type === "steps" && Array.isArray(content.steps) && (
          <StepsContent
            steps={content.steps}
            resumeStep={resumePosition?.step ?? null}
            onProgress={s => onProgress({ step: s })}
            onComplete={onComplete}
          />
        )}

        {/* Quiz / Progress Test â€” standard QuizPlayer */}
        {(item.type === "quiz" || item.type === "progress_test") && content.quiz_id && (
          <>
            {item.type === "progress_test" && (
              <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <span className="text-2xl">ðŸ“‹</span>
                <div>
                  <p className="font-semibold text-blue-800 text-sm">Progress Test</p>
                  <p className="text-xs text-blue-600">Check your understanding before continuing</p>
                </div>
              </div>
            )}
            <QuizPlayer
              quizId={content.quiz_id}
              contentItemId={item.id}
              courseId={courseId}
              moduleId={moduleId}
              onComplete={onComplete}
              alreadyCompleted={completed}
            />
          </>
        )}

        {/* Final Exam â€” anti-cheating shell around QuizPlayer */}
        {item.type === "final_exam" && content.quiz_id && (
          <FinalExamShell title={item.title}>
            <QuizPlayer
              quizId={content.quiz_id}
              contentItemId={item.id}
              courseId={courseId}
              moduleId={moduleId}
              onComplete={onComplete}
              alreadyCompleted={completed}
            />
          </FinalExamShell>
        )}

        {/* Assignment */}
        {item.type === "assignment" && (
          <AssignmentPlayer
            contentItemId={item.id}
            courseId={courseId}
            content={content}
            onComplete={onComplete}
            alreadyCompleted={completed}
          />
        )}

        {/* Completion + next */}
        <div className={cn(
          "rounded-xl border p-5 transition-all",
          completed
            ? "bg-emerald-50 border-emerald-200"
            : "bg-white border-slate-200"
        )}>
          {completed ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">Completed!</span>
              </div>
              <div className="flex gap-3 flex-wrap">
                <Link href={`/lms/courses/${courseId}`}>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ArrowLeft className="h-4 w-4" /> Back to Course
                  </Button>
                </Link>
                {nextItem && (
                  <Link href={`/lms/courses/${courseId}/content/${nextItem.id}`}>
                    <Button size="sm" className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
                      Next: {nextItem.title} <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-slate-500">
                {item.is_mandatory ? "Mandatory item" : "Optional item"} â€” mark complete when done.
              </p>
              <Button
                onClick={onComplete}
                disabled={saving}
                className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2 shrink-0"
              >
                {saving
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <><CheckCircle2 className="h-4 w-4" /> Mark Complete</>}
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

