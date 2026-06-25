import { getStudentSession } from "@/lib/lms-auth"
import { db } from "@/lib/db"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import Image from "next/image"
import { ArrowLeft, Download, File, BookOpen } from "lucide-react"
import { cn } from "@/lib/utils"

// â”€â”€ HubCraft block types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface HCBlock {
  id: string; type: string; html?: string
  fileId?: string; fileName?: string; fileUrl?: string; fileMime?: string
  url?: string; caption?: string; icon?: string; color?: string
}

const CALLOUT_STYLES: Record<string, { bg: string; border: string }> = {
  blue:   { bg: "bg-blue-50",   border: "border-blue-200"   },
  green:  { bg: "bg-green-50",  border: "border-green-200"  },
  yellow: { bg: "bg-amber-50",  border: "border-amber-200"  },
  red:    { bg: "bg-red-50",    border: "border-red-200"    },
  purple: { bg: "bg-violet-50", border: "border-violet-200" },
}

function toEmbed(url: string) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vm = url.match(/vimeo\.com\/(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return url
}

function BlockRenderer({ block }: { block: HCBlock }) {
  switch (block.type) {
    case "text":
      return (
        <div
          className="
            prose prose-slate max-w-none
            [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-slate-900 [&_h1]:my-3
            [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-800 [&_h2]:my-2
            [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-slate-700 [&_h3]:my-2
            [&_p]:text-slate-700 [&_p]:leading-relaxed [&_p]:my-2
            [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
            [&_li]:text-slate-700 [&_li]:my-1
            [&_strong]:font-bold [&_em]:italic
            [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:text-pink-600
            [&_a]:text-[#1B4F8A] [&_a]:underline
            [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-500
          "
          dangerouslySetInnerHTML={{ __html: block.html || "" }}
        />
      )
    case "pdf":
      if (!block.fileUrl) return null
      return (
        <div className="space-y-2">
          <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height: 620 }}>
            <iframe src={block.fileUrl} className="w-full h-full border-0" title={block.fileName ?? "PDF"} />
          </div>
          {block.caption && <p className="text-xs text-center text-slate-400">{block.caption}</p>}
        </div>
      )
    case "video": {
      const src = block.fileUrl ?? block.url ?? ""
      if (!src) return null
      const isDirect = block.fileMime?.startsWith("video/") || /\.(mp4|webm|ogg)(\?|$)/i.test(src)
      return (
        <div className="space-y-2">
          <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video">
            {isDirect
              ? <video src={src} controls className="w-full h-full" />
              : <iframe src={toEmbed(src)} className="w-full h-full border-0" allow="fullscreen" allowFullScreen />
            }
          </div>
          {block.caption && <p className="text-xs text-center text-slate-400">{block.caption}</p>}
        </div>
      )
    }
    case "image": {
      const src = block.fileUrl ?? block.url ?? ""
      if (!src) return null
      return (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={block.caption ?? block.fileName ?? ""}
            className="w-full rounded-xl object-cover max-h-[500px]" />
          {block.caption && <p className="text-xs text-center text-slate-400">{block.caption}</p>}
        </div>
      )
    }
    case "embed":
      if (!block.url) return null
      return (
        <div className="rounded-xl overflow-hidden border border-slate-200" style={{ height: 420 }}>
          <iframe src={block.url} className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" />
        </div>
      )
    case "file":
      if (!block.fileUrl) return null
      return (
        <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
            <File className="h-5 w-5 text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-slate-800 truncate">{block.fileName ?? "File"}</p>
          </div>
          <a href={block.fileUrl} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1B4F8A] text-white text-xs font-medium rounded-lg hover:bg-[#163f6f] transition-colors shrink-0">
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </div>
      )
    case "callout": {
      const style = CALLOUT_STYLES[block.color ?? "blue"] ?? CALLOUT_STYLES.blue
      return (
        <div className={cn("flex gap-3 p-4 rounded-xl border", style.bg, style.border)}>
          <span className="text-xl shrink-0">{block.icon ?? "ðŸ’¡"}</span>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{block.html}</p>
        </div>
      )
    }
    case "divider":
      return <hr className="border-slate-200" />
    default:
      return null
  }
}

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default async function HubCraftViewerPage({
  params,
}: {
  params: Promise<{ id: string; moduleId: string }>
}) {
  const { id: courseId, moduleId } = await params

  const student = await getStudentSession()
  if (!student) redirect("/lms/login")

  // Verify enrollment
  const { data: enrollment } = await db
    .from("lms_enrollments")
    .select("id")
    .eq("student_id", student.id)
    .eq("course_id", courseId)
    .single()
  if (!enrollment) notFound()

  // Fetch module
  const { data: module } = await db
    .from("lms_modules")
    .select("id, title, description, content_body")
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .single()
  if (!module || !["hubcraft"].includes("hubcraft")) notFound()
  if (!module) notFound()

  // Fetch course for header
  const { data: course } = await db
    .from("lms_courses")
    .select("id, title")
    .eq("id", courseId)
    .single()

  const blocks: HCBlock[] = (() => {
    const cb = module.content_body as Record<string, unknown> | null
    if (cb && Array.isArray(cb.blocks)) return cb.blocks as HCBlock[]
    return []
  })()

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-[#1B4F8A] text-white sticky top-0 z-30 shadow">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href={`/lms/courses/${courseId}`}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <Image src="/logo/logo-white.png" alt="ICS" width={90} height={24} className="object-contain" />
          <span className="text-white/60 text-sm truncate">
            / {course?.title} / {module.title}
          </span>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 py-8">
          {/* Module title */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-slate-900">{module.title}</h1>
            {module.description && (
              <p className="text-slate-500 mt-1 text-sm">{module.description}</p>
            )}
          </div>

          {/* Blocks */}
          {blocks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center text-slate-400">
              <BookOpen className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">This module has no content yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {blocks.map(block => (
                <BlockRenderer key={block.id} block={block} />
              ))}
            </div>
          )}

          {/* Back link */}
          <div className="mt-12 pt-6 border-t border-slate-200">
            <Link href={`/lms/courses/${courseId}`}
              className="inline-flex items-center gap-2 text-sm text-[#1B4F8A] hover:underline">
              <ArrowLeft className="h-4 w-4" /> Back to course
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}


