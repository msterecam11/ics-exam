"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import {
  ArrowLeft, ChevronLeft, ChevronRight, CheckCircle2,
  Download, Loader2, ExternalLink, AlertCircle,
  PlayCircle, Pause, Volume2, VolumeX, Maximize,
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

// ── Save progress debounced ───────────────────────────────────
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

// ── Video Player ──────────────────────────────────────────────
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

// ── PPT / Slide Player ────────────────────────────────────────
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
          <span className="mx-1 text-slate-300">·</span>
          <button onClick={() => go(total)} className="text-xs text-[#1B4F8A] hover:underline">Jump to end</button>
        </span>
        <Button variant="outline" size="sm" onClick={() => go(slide + 1)} disabled={slide >= total}>
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

// ── PDF Viewer ────────────────────────────────────────────────
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

  const pdfUrl = `${url}#page=${page}`

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

// ── Text / Rich Content ───────────────────────────────────────
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

// ── Link / Embed ──────────────────────────────────────────────
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

// ── Steps ─────────────────────────────────────────────────────
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

// ── Main ContentPlayer ────────────────────────────────────────
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
      toast.success("✅ Item completed!")
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
          <div className="flex-1 min-w-0 hidden sm:block">
            <p className="text-xs text-white/50 truncate">{courseTitle} / {moduleTitle}</p>
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

        {/* Fallback for unrenderable types */}
        {["quiz","assignment"].includes(item.type) && (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-400 mx-auto" />
            <p className="text-slate-600 font-medium">
              {item.type === "quiz" ? "Quiz" : "Assignment"} — coming soon
            </p>
            <p className="text-sm text-slate-400">Interactive {item.type}s will be available in the next update.</p>
          </div>
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
                {item.is_mandatory ? "Mandatory item" : "Optional item"} — mark complete when done.
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
