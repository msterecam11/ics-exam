"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext, verticalListSortingStrategy, useSortable, arrayMove,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  GripVertical, Plus, Trash2, Loader2, CheckCircle2,
  FileText, Video, Image as ImageIcon,
  Link2, File, Download, Eye, X as XIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import Link from "@tiptap/extension-link"
import LibraryPicker, { type LibraryFile } from "./LibraryPicker"

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2) }

type HCBType = "text" | "pdf" | "video" | "image" | "embed" | "file" | "callout" | "divider"

interface HCBlock {
  id:        string
  type:      HCBType
  html?:     string        // text / callout content
  fileId?:   string        // library file id
  fileName?: string
  fileUrl?:  string
  fileMime?: string
  url?:      string        // video URL, embed URL, image direct URL
  caption?:  string
  icon?:     string        // callout emoji
  color?:    string        // callout color key
}

function parseBlocks(raw: unknown): HCBlock[] {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>
    if (Array.isArray(r.blocks) && r.blocks.length > 0) {
      return (r.blocks as Record<string, unknown>[]).map(b => ({
        id:       String(b.id ?? uid()),
        type:     (b.type as HCBType) || "text",
        html:     String(b.html ?? b.content ?? ""),
        fileId:   b.fileId as string | undefined,
        fileName: b.fileName as string | undefined,
        fileUrl:  b.fileUrl as string | undefined,
        fileMime: b.fileMime as string | undefined,
        url:      b.url as string | undefined,
        caption:  b.caption as string | undefined,
        icon:     b.icon as string | undefined,
        color:    b.color as string | undefined,
      }))
    }
  }
  return [{ id: uid(), type: "text", html: "" }]
}

function createBlock(type: HCBType): HCBlock {
  const b: HCBlock = { id: uid(), type }
  if (type === "callout") return { ...b, icon: "💡", color: "blue", html: "" }
  if (type === "text")    return { ...b, html: "" }
  return b
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const CALLOUT_COLORS: Record<string, { bg: string; border: string }> = {
  blue:   { bg: "bg-blue-50",   border: "border-blue-200"   },
  green:  { bg: "bg-green-50",  border: "border-green-200"  },
  yellow: { bg: "bg-amber-50",  border: "border-amber-200"  },
  red:    { bg: "bg-red-50",    border: "border-red-200"    },
  purple: { bg: "bg-violet-50", border: "border-violet-200" },
}

const BLOCK_TYPES = [
  { type: "text"    as HCBType, icon: "¶",  label: "Text",         group: "content" },
  { type: "callout" as HCBType, icon: "💡", label: "Callout",      group: "content" },
  { type: "divider" as HCBType, icon: "—",  label: "Divider",      group: "content" },
  { type: "pdf"     as HCBType, icon: "📄", label: "PDF / Slides", group: "media"   },
  { type: "video"   as HCBType, icon: "🎬", label: "Video",        group: "media"   },
  { type: "image"   as HCBType, icon: "🖼", label: "Image",        group: "media"   },
  { type: "embed"   as HCBType, icon: "🔗", label: "Embed",        group: "media"   },
  { type: "file"    as HCBType, icon: "📎", label: "File",         group: "media"   },
] as const

const LIBRARY_TYPES: Record<string, string[]> = {
  pdf:   ["pdf"],
  video: ["mp4"],
  image: ["image"],
  file:  [],
}

function toEmbed(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`
  const vm = url.match(/vimeo\.com\/(\d+)/)
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`
  return url
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SHARED UI HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function EmptyState({ icon, color, title, desc, actionLabel, onAction, extra }: {
  icon: React.ReactNode; color: string; title: string; desc?: string
  actionLabel?: string; onAction?: () => void; extra?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 border-2 border-dashed border-slate-200 rounded-xl gap-3 text-center">
      <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center", color)}>{icon}</div>
      <div>
        <p className="font-medium text-slate-700 text-sm">{title}</p>
        {desc && <p className="text-xs text-slate-400 mt-0.5">{desc}</p>}
      </div>
      {extra}
      {actionLabel && onAction && (
        <button onClick={onAction}
          className="px-4 py-2 bg-[#1B4F8A] text-white text-sm font-medium rounded-lg hover:bg-[#163f6f] transition-colors">
          {actionLabel}
        </button>
      )}
    </div>
  )
}

function FileFooter({ icon, name, changeLabel = "Change", onChange }: {
  icon: React.ReactNode; name?: string; changeLabel?: string; onChange: () => void
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
      {icon}
      <span className="flex-1 text-xs text-slate-600 truncate">{name ?? "—"}</span>
      <button onClick={onChange} className="text-xs text-[#1B4F8A] hover:underline shrink-0">{changeLabel}</button>
    </div>
  )
}

function CaptionInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <input value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder="Add caption…"
      className="w-full text-xs text-center text-slate-400 bg-transparent border-none outline-none placeholder:text-slate-300 py-0.5" />
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TEXT BLOCK (TipTap + floating toolbar)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function Tb({ active, onClick, children, mono }: {
  active?: boolean; onClick: () => void; children: React.ReactNode; mono?: boolean
}) {
  return (
    <button
      onMouseDown={e => { e.preventDefault(); onClick() }}
      className={cn(
        "px-1.5 py-0.5 rounded text-xs transition-colors",
        mono && "font-mono",
        active ? "bg-white/25" : "hover:bg-white/15",
      )}
    >{children}</button>
  )
}

function TextBlock({ block, onChange }: { block: HCBlock; onChange: (b: HCBlock) => void }) {
  const [focused, setFocused] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({ openOnClick: false }),
    ],
    content: block.html || "",
    onUpdate:  ({ editor }) => onChange({ ...block, html: editor.getHTML() }),
    onFocus:   () => setFocused(true),
    onBlur:    () => setFocused(false),
    editorProps: { attributes: { class: "outline-none min-h-[2rem] py-1" } },
  })

  if (!editor) return null

  function setLink() {
    const prev = editor?.getAttributes("link").href ?? ""
    const url  = window.prompt("URL:", prev)
    if (url === null) return
    if (!url) { editor?.chain().focus().unsetLink().run(); return }
    editor?.chain().focus().setLink({ href: url }).run()
  }

  return (
    <div>
      {/* Inline toolbar — shown when editor is focused */}
      <div className={cn(
        "flex items-center flex-wrap gap-0.5 mb-2 bg-slate-900 text-white rounded-lg px-1.5 py-1 select-none transition-all duration-150",
        focused ? "opacity-100" : "opacity-0 pointer-events-none h-0 mb-0 overflow-hidden py-0",
      )}>
        <Tb active={editor.isActive("bold")}      onClick={() => editor.chain().focus().toggleBold().run()}>B</Tb>
        <Tb active={editor.isActive("italic")}    onClick={() => editor.chain().focus().toggleItalic().run()}><em>I</em></Tb>
        <Tb active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}><u>U</u></Tb>
        <Tb active={editor.isActive("strike")}    onClick={() => editor.chain().focus().toggleStrike().run()}><s>S</s></Tb>
        <div className="w-px h-4 bg-white/20 mx-0.5" />
        <Tb active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>H1</Tb>
        <Tb active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>H2</Tb>
        <Tb active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>H3</Tb>
        <div className="w-px h-4 bg-white/20 mx-0.5" />
        <Tb active={editor.isActive("bulletList")}  onClick={() => editor.chain().focus().toggleBulletList().run()}>≡</Tb>
        <Tb active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>1.</Tb>
        <div className="w-px h-4 bg-white/20 mx-0.5" />
        <Tb active={editor.isActive("link")}  onClick={setLink}>🔗</Tb>
        <Tb active={editor.isActive("code")}  onClick={() => editor.chain().focus().toggleCode().run()} mono>{`</>`}</Tb>
      </div>

      <div className="
        [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[2rem]
        [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-slate-900 [&_h1]:my-2
        [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-800 [&_h2]:my-1.5
        [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-slate-700 [&_h3]:my-1
        [&_p]:text-slate-700 [&_p]:leading-relaxed [&_p]:my-1
        [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5
        [&_li]:text-slate-700 [&_li]:my-0.5
        [&_strong]:font-bold [&_em]:italic [&_u]:underline [&_s]:line-through
        [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono [&_code]:text-pink-600
        [&_a]:text-[#1B4F8A] [&_a]:underline
        [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-slate-500
      ">
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PDF BLOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function PdfBlock({ block, onChange, onPickFile }: {
  block: HCBlock; onChange: (b: HCBlock) => void; onPickFile: () => void
}) {
  if (!block.fileUrl) {
    return (
      <EmptyState icon={<FileText className="h-6 w-6 text-red-500" />} color="bg-red-50"
        title="No PDF selected" desc="Pick a PDF from your library to display here"
        actionLabel="Pick from Library" onAction={onPickFile} />
    )
  }

  return (
    <div className="space-y-3">
      {/* Native browser PDF viewer via iframe — works in all modern browsers */}
      <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50" style={{ height: 600 }}>
        <iframe
          src={block.fileUrl}
          className="w-full h-full border-0"
          title={block.fileName ?? "PDF"}
        />
      </div>
      <FileFooter icon={<FileText className="h-4 w-4 text-red-500 shrink-0" />}
        name={block.fileName} onChange={onPickFile} />
      <CaptionInput value={block.caption} onChange={v => onChange({ ...block, caption: v })} />
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VIDEO BLOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function VideoBlock({ block, onChange, onPickFile }: {
  block: HCBlock; onChange: (b: HCBlock) => void; onPickFile: () => void
}) {
  const [input, setInput] = useState(block.url ?? "")
  const src       = block.fileUrl ?? block.url ?? ""
  const isDirect  = !!(block.fileMime?.startsWith("video/") || /\.(mp4|webm|ogg)(\?|$)/i.test(src))
  const hasSource = !!(block.fileUrl || block.url)

  function applyUrl() {
    const v = input.trim()
    if (!v) return
    onChange({ ...block, url: v, fileId: undefined, fileUrl: undefined, fileName: undefined, fileMime: undefined })
  }

  function clear() {
    onChange({ ...block, url: undefined, fileId: undefined, fileUrl: undefined, fileName: undefined, fileMime: undefined })
  }

  if (!hasSource) {
    return (
      <EmptyState icon={<Video className="h-6 w-6 text-purple-500" />} color="bg-purple-50"
        title="Add a video"
        extra={
          <div className="flex items-center gap-2 w-full max-w-sm px-4">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyUrl()}
              placeholder="Paste YouTube / Vimeo / MP4 URL…"
              className="flex-1 px-3 h-8 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
            <button onClick={applyUrl}
              className="px-3 h-8 text-xs bg-[#1B4F8A] text-white font-medium rounded-lg hover:bg-[#163f6f]">
              Load
            </button>
          </div>
        }
        actionLabel="Pick from Library" onAction={onPickFile} />
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl overflow-hidden bg-slate-900 aspect-video">
        {isDirect
          ? <video src={src} controls className="w-full h-full" />
          : <iframe src={toEmbed(src)} className="w-full h-full border-0" allow="fullscreen" allowFullScreen />
        }
      </div>
      <FileFooter icon={<Video className="h-4 w-4 text-purple-500 shrink-0" />}
        name={block.fileName ?? src} changeLabel="Remove" onChange={clear} />
      <CaptionInput value={block.caption} onChange={v => onChange({ ...block, caption: v })} />
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IMAGE BLOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function ImageBlock({ block, onChange, onPickFile }: {
  block: HCBlock; onChange: (b: HCBlock) => void; onPickFile: () => void
}) {
  const [input, setInput] = useState(block.url ?? "")
  const src = block.fileUrl ?? block.url ?? ""

  function applyUrl() {
    const v = input.trim()
    if (!v) return
    onChange({ ...block, url: v, fileId: undefined, fileUrl: undefined, fileName: undefined, fileMime: undefined })
  }

  function clear() {
    onChange({ ...block, url: undefined, fileId: undefined, fileUrl: undefined, fileName: undefined, fileMime: undefined })
  }

  if (!src) {
    return (
      <EmptyState icon={<ImageIcon className="h-6 w-6 text-green-500" />} color="bg-green-50"
        title="Add an image"
        extra={
          <div className="flex items-center gap-2 w-full max-w-sm px-4">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && applyUrl()}
              placeholder="Or paste image URL…"
              className="flex-1 px-3 h-8 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
            <button onClick={applyUrl}
              className="px-3 h-8 text-xs bg-[#1B4F8A] text-white font-medium rounded-lg hover:bg-[#163f6f]">Load</button>
          </div>
        }
        actionLabel="Pick from Library" onAction={onPickFile} />
    )
  }

  return (
    <div className="space-y-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={block.caption ?? block.fileName ?? ""}
        className="w-full rounded-xl object-cover max-h-[480px]" />
      <FileFooter icon={<ImageIcon className="h-4 w-4 text-green-500 shrink-0" />}
        name={block.fileName ?? src} changeLabel="Remove" onChange={clear} />
      <CaptionInput value={block.caption} onChange={v => onChange({ ...block, caption: v })} />
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EMBED BLOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function EmbedBlock({ block, onChange }: { block: HCBlock; onChange: (b: HCBlock) => void }) {
  const [input, setInput] = useState(block.url ?? "")

  function apply() {
    let v = input.trim()
    if (!v) return
    if (!v.startsWith("http")) v = "https://" + v
    onChange({ ...block, url: v })
  }

  if (!block.url) {
    return (
      <EmptyState icon={<Link2 className="h-6 w-6 text-blue-500" />} color="bg-blue-50"
        title="Embed a URL" desc="Embed any webpage or interactive tool"
        extra={
          <div className="flex items-center gap-2 w-full max-w-sm px-4">
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && apply()}
              placeholder="https://…"
              className="flex-1 px-3 h-8 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1B4F8A]/20" />
            <button onClick={apply}
              className="px-3 h-8 text-xs bg-[#1B4F8A] text-white font-medium rounded-lg hover:bg-[#163f6f]">Embed</button>
          </div>
        } />
    )
  }

  return (
    <div className="space-y-3">
      <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50" style={{ height: 400 }}>
        <iframe src={block.url} className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation" />
      </div>
      <FileFooter icon={<Link2 className="h-4 w-4 text-blue-500 shrink-0" />}
        name={block.url} changeLabel="Change URL"
        onChange={() => onChange({ ...block, url: undefined })} />
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FILE BLOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function FileBlock({ block, onChange, onPickFile }: {
  block: HCBlock; onChange: (b: HCBlock) => void; onPickFile: () => void
}) {
  if (!block.fileUrl) {
    return (
      <EmptyState icon={<File className="h-6 w-6 text-slate-500" />} color="bg-slate-100"
        title="Attach a file" desc="Downloadable file from your library"
        actionLabel="Pick from Library" onAction={onPickFile} />
    )
  }

  return (
    <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
      <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0">
        <File className="h-6 w-6 text-slate-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800 truncate">{block.fileName}</p>
        <p className="text-xs text-slate-400 mt-0.5">Click to download</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <a href={block.fileUrl} target="_blank" rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-2 bg-[#1B4F8A] text-white text-xs font-medium rounded-lg hover:bg-[#163f6f] transition-colors">
          <Download className="h-3.5 w-3.5" /> Download
        </a>
        <button onClick={onPickFile} className="text-xs text-slate-400 hover:text-slate-700 transition-colors">Change</button>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CALLOUT BLOCK
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function CalloutBlock({ block, onChange }: { block: HCBlock; onChange: (b: HCBlock) => void }) {
  const colors  = Object.keys(CALLOUT_COLORS)
  const palette = CALLOUT_COLORS[block.color ?? "blue"]

  function changeIcon() {
    const e = window.prompt("Emoji:", block.icon ?? "💡")
    if (e !== null) onChange({ ...block, icon: e || "💡" })
  }

  return (
    <div className={cn("flex gap-3 p-4 rounded-xl border", palette.bg, palette.border)}>
      <button onClick={changeIcon} title="Change emoji"
        className="text-xl shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/5 transition-colors">
        {block.icon ?? "💡"}
      </button>
      <div className="flex-1 min-w-0">
        <textarea value={block.html ?? ""} onChange={e => onChange({ ...block, html: e.target.value })}
          placeholder="Type your callout text…" rows={2}
          className="w-full bg-transparent resize-none outline-none text-sm text-slate-700 leading-relaxed placeholder:text-slate-400" />
        <div className="flex gap-1.5 mt-2">
          {colors.map(c => (
            <button key={c} onMouseDown={() => onChange({ ...block, color: c })}
              className={cn(
                "w-4 h-4 rounded-full border-2 transition-all",
                CALLOUT_COLORS[c].bg,
                block.color === c ? "border-slate-500 scale-110" : "border-transparent hover:scale-110"
              )} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// BLOCK ROUTER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function BlockContent({ block, onChange, onPickFile }: {
  block: HCBlock; onChange: (b: HCBlock) => void; onPickFile: () => void
}) {
  switch (block.type) {
    case "text":    return <TextBlock    block={block} onChange={onChange} />
    case "pdf":     return <PdfBlock     block={block} onChange={onChange} onPickFile={onPickFile} />
    case "video":   return <VideoBlock   block={block} onChange={onChange} onPickFile={onPickFile} />
    case "image":   return <ImageBlock   block={block} onChange={onChange} onPickFile={onPickFile} />
    case "embed":   return <EmbedBlock   block={block} onChange={onChange} />
    case "file":    return <FileBlock    block={block} onChange={onChange} onPickFile={onPickFile} />
    case "callout": return <CalloutBlock block={block} onChange={onChange} />
    case "divider": return <hr className="border-slate-200 my-2" />
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SORTABLE BLOCK WRAPPER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function SortableBlock({ block, onChange, onDelete, onInsertAfter, onPickFile }: {
  block:         HCBlock
  onChange:      (b: HCBlock) => void
  onDelete:      () => void
  onInsertAfter: () => void
  onPickFile:    () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id })
  const [hovered, setHovered] = useState(false)

  const label = BLOCK_TYPES.find(t => t.type === block.type)?.label ?? block.type
  const isDivider = block.type === "divider"

  return (
    <div ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}>

      {/* Card */}
      <div className={cn(
        "rounded-xl border transition-all",
        isDivider ? "border-transparent" : "border-slate-200 bg-white",
        hovered && !isDivider && "border-slate-300 shadow-sm",
        isDragging && "shadow-xl ring-2 ring-[#1B4F8A]/20",
      )}>
        {/* Header (hover) */}
        {!isDivider && (
          <div className={cn(
            "flex items-center justify-between px-3 py-2 border-b border-slate-100 rounded-t-xl transition-all duration-150",
            hovered ? "opacity-100" : "opacity-0 pointer-events-none",
          )}>
            <div className="flex items-center gap-2">
              <button {...attributes} {...listeners}
                className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 transition-colors touch-none">
                <GripVertical className="h-4 w-4" />
              </button>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider select-none">{label}</span>
            </div>
            <button onClick={onDelete}
              className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Content */}
        <div className={cn(!isDivider && "px-4 py-4")}>
          <BlockContent block={block} onChange={onChange} onPickFile={onPickFile} />
        </div>
      </div>

      {/* Insert-after strip */}
      <div className={cn(
        "flex justify-center py-1 transition-opacity duration-150",
        hovered ? "opacity-100" : "opacity-0 pointer-events-none",
      )}>
        <button onClick={onInsertAfter}
          className="flex items-center gap-1 px-3 py-0.5 text-xs text-slate-400 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/5 rounded-full border border-dashed border-slate-200 hover:border-[#1B4F8A]/30 transition-all">
          <Plus className="h-3 w-3" /> Insert block
        </button>
      </div>
    </div>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ADD BLOCK PICKER PANEL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function AddBlockPicker({ open, onPick, onClose }: {
  open: boolean; onPick: (t: HCBType) => void; onClose: () => void
}) {
  if (!open) return null

  const groups = [
    { label: "Content & Layout", types: ["text", "callout", "divider"] },
    { label: "Media & Files",    types: ["pdf", "video", "image", "embed", "file"] },
  ]

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="relative z-20 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-5">
        {groups.map(g => (
          <div key={g.label}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">{g.label}</p>
            <div className="grid grid-cols-4 gap-2">
              {g.types.map(key => {
                const meta = BLOCK_TYPES.find(b => b.type === key)!
                return (
                  <button key={key} onClick={() => onPick(meta.type)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-slate-200 hover:border-[#1B4F8A]/40 hover:bg-[#1B4F8A]/5 transition-all text-center">
                    <span className="text-xl leading-none">{meta.icon}</span>
                    <span className="text-xs font-medium text-slate-700 leading-tight">{meta.label}</span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN EDITOR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export default function HubCraftEditor({ moduleId, initialTitle, initialContent }: {
  moduleId:       string
  initialTitle:   string
  initialContent: unknown
}) {
  const [blocks,     setBlocks]     = useState<HCBlock[]>(() => parseBlocks(initialContent))
  const [title,      setTitle]      = useState(initialTitle)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved">("saved")
  const [showPicker, setShowPicker] = useState(false)
  const [insertAt,   setInsertAt]   = useState<number | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerFor,  setPickerFor]  = useState<{ blockId: string; allowedTypes: string[] } | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  // ── Auto-save ──────────────────────────────────────────────────
  const scheduleSave = useCallback((t: string, b: HCBlock[]) => {
    setSaveStatus("unsaved")
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveStatus("saving")
      try {
        await fetch("/api/lms/modules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: moduleId, title: t, content_body: { version: 2, blocks: b } }),
        })
        setSaveStatus("saved")
      } catch { setSaveStatus("unsaved") }
    }, 1500)
  }, [moduleId])

  // ── Block mutations ────────────────────────────────────────────
  function updateBlock(updated: HCBlock) {
    const next = blocks.map(b => b.id === updated.id ? updated : b)
    setBlocks(next); scheduleSave(title, next)
  }

  function deleteBlock(id: string) {
    const next  = blocks.filter(b => b.id !== id)
    const final = next.length === 0 ? [createBlock("text")] : next
    setBlocks(final); scheduleSave(title, final)
  }

  function addBlock(type: HCBType, afterIndex: number | null) {
    const nb = createBlock(type)
    let next: HCBlock[]
    if (afterIndex === null || afterIndex >= blocks.length - 1) {
      next = [...blocks, nb]
    } else {
      next = [...blocks.slice(0, afterIndex + 1), nb, ...blocks.slice(afterIndex + 1)]
    }
    setBlocks(next); scheduleSave(title, next)
    setShowPicker(false)
    // For media blocks, immediately open library picker
    if (type in LIBRARY_TYPES) {
      setPickerFor({ blockId: nb.id, allowedTypes: LIBRARY_TYPES[type] })
      setPickerOpen(true)
    }
  }

  function openPickerFor(blockId: string, type: HCBType) {
    setPickerFor({ blockId, allowedTypes: LIBRARY_TYPES[type] ?? [] })
    setPickerOpen(true)
  }

  function onFilePicked(file: LibraryFile) {
    if (!pickerFor) return
    const next = blocks.map(b => b.id === pickerFor.blockId
      ? { ...b, fileId: file.id, fileName: file.name, fileUrl: file.public_url, fileMime: file.mime_type, url: undefined }
      : b
    )
    setBlocks(next); scheduleSave(title, next)
    setPickerOpen(false); setPickerFor(null)
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = blocks.findIndex(b => b.id === active.id)
    const to   = blocks.findIndex(b => b.id === over.id)
    const next = arrayMove(blocks, from, to)
    setBlocks(next); scheduleSave(title, next)
  }

  return (
    <div className="h-full flex flex-col">

      {/* ── Title bar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 shrink-0">
        <input
          value={title}
          onChange={e => { setTitle(e.target.value); scheduleSave(e.target.value, blocks) }}
          placeholder="Module title…"
          className="flex-1 text-xl font-bold text-slate-900 bg-transparent outline-none placeholder:text-slate-300"
        />
        <span className={cn("text-xs flex items-center gap-1.5 shrink-0 transition-colors",
          saveStatus === "saved"   && "text-emerald-500",
          saveStatus === "saving"  && "text-slate-400",
          saveStatus === "unsaved" && "text-amber-500",
        )}>
          {saveStatus === "saving"  && <><Loader2    className="h-3 w-3 animate-spin" /> Saving…</>}
          {saveStatus === "saved"   && <><CheckCircle2 className="h-3 w-3" /> Saved</>}
          {saveStatus === "unsaved" && "Unsaved"}
        </span>
      </div>

      {/* ── Block canvas ───────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6 space-y-1">

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              {blocks.map((block, i) => (
                <SortableBlock
                  key={block.id}
                  block={block}
                  onChange={updateBlock}
                  onDelete={() => deleteBlock(block.id)}
                  onInsertAfter={() => { setInsertAt(i); setShowPicker(true) }}
                  onPickFile={() => openPickerFor(block.id, block.type)}
                />
              ))}
            </SortableContext>
          </DndContext>

          {/* ── Add Block button ─────────────────────────────── */}
          <div className="pt-2">
            <button
              onClick={() => { setInsertAt(null); setShowPicker(p => !p) }}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-sm font-medium transition-all",
                showPicker
                  ? "border-[#1B4F8A]/50 bg-[#1B4F8A]/5 text-[#1B4F8A]"
                  : "border-slate-200 text-slate-400 hover:border-[#1B4F8A]/30 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/5",
              )}>
              <Plus className="h-4 w-4" />
              Add Block
            </button>

            <AddBlockPicker
              open={showPicker}
              onPick={type => addBlock(type, insertAt)}
              onClose={() => setShowPicker(false)}
            />
          </div>

        </div>
      </div>

      {/* Library picker modal */}
      <LibraryPicker
        open={pickerOpen}
        onClose={() => { setPickerOpen(false); setPickerFor(null) }}
        onSelect={onFilePicked}
        allowedTypes={pickerFor?.allowedTypes}
        title="Pick a file"
      />
    </div>
  )
}
