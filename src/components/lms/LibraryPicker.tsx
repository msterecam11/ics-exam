"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  X, Search, Upload, Link2, FileText, FileVideo, Music,
  Image as ImageIcon, File, Check, Loader2, AlertCircle,
  Folder, FolderOpen, FolderPlus, ChevronRight, Globe,
  MoreVertical, Edit2, Trash2, Info, Plus,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"

// ── Types ──────────────────────────────────────────────────────
export interface LibraryFile {
  id:            string
  folder_id?:    string | null
  name:          string
  original_name: string
  mime_type:     string
  file_type?:    string
  size_bytes:    number
  public_url:    string
  is_external:   boolean
  created_at:    string
}

interface LibFolder {
  id:        string
  name:      string
  parent_id: string | null
  color:     string | null
  created_at: string
}

// ── File type helpers ──────────────────────────────────────────
export function mimeToFileType(mime: string): string {
  if (mime.startsWith("video/"))                                       return "mp4"
  if (mime.startsWith("audio/"))                                       return "mp3"
  if (mime === "application/pdf")                                      return "pdf"
  if (mime.includes("powerpoint") || mime.includes("presentationml")) return "pptx"
  if (mime.includes("msword") || mime.includes("wordprocessingml"))   return "docx"
  if (mime.startsWith("image/"))                                       return "image"
  return "other"
}

export function getFileType(file: LibraryFile): string {
  // Don't trust file_type = "other" — it's the DB default for rows inserted
  // before the column existed. Always derive from mime_type in that case.
  if (file.file_type && file.file_type !== "other") return file.file_type
  return mimeToFileType(file.mime_type || "")
}

function formatBytes(b: number) {
  if (!b) return "—"
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function relative(date: string) {
  const d = new Date(date)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60)    return "Just now"
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

function fileIcon(mime: string, isExt: boolean) {
  if (isExt) return Globe
  if (mime.startsWith("video/"))                                       return FileVideo
  if (mime.startsWith("audio/"))                                       return Music
  if (mime.startsWith("image/"))                                       return ImageIcon
  if (mime === "application/pdf")                                      return FileText
  if (mime.includes("word") || mime.includes("document"))             return FileText
  if (mime.includes("presentation") || mime.includes("powerpoint"))   return FileText
  return File
}

function fileColor(mime: string, isExt: boolean) {
  if (isExt) return "bg-blue-50 text-blue-600"
  if (mime.startsWith("video/"))                                       return "bg-purple-50 text-purple-600"
  if (mime.startsWith("audio/"))                                       return "bg-pink-50 text-pink-600"
  if (mime.startsWith("image/"))                                       return "bg-green-50 text-green-600"
  if (mime === "application/pdf")                                      return "bg-red-50 text-red-600"
  if (mime.includes("word"))                                           return "bg-blue-50 text-blue-600"
  if (mime.includes("presentation") || mime.includes("powerpoint"))   return "bg-orange-50 text-orange-600"
  return "bg-slate-100 text-slate-500"
}

function buildAccept(allowedTypes: string[]): string {
  const map: Record<string, string> = {
    mp4:   "video/*",
    mp3:   "audio/*",
    pdf:   ".pdf,application/pdf",
    pptx:  ".ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ppt:   ".ppt,.pptx",
    docx:  ".docx,.doc,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    image: "image/*",
  }
  const parts = allowedTypes.flatMap(t => map[t] ? [map[t]] : [])
  return [...new Set(parts)].join(",") || "*"
}

// ── Folder tree ────────────────────────────────────────────────
interface FolderNode extends LibFolder { children: FolderNode[] }
function buildTree(folders: LibFolder[], parentId: string | null = null): FolderNode[] {
  return folders
    .filter(f => f.parent_id === parentId)
    .map(f => ({ ...f, children: buildTree(folders, f.id) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function FolderTree({
  nodes, selectedId, onSelect, depth = 0,
}: {
  nodes:      FolderNode[]
  selectedId: string | null
  onSelect:   (id: string) => void
  depth?:     number
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (id: string) => setExpanded(e => ({ ...e, [id]: !e[id] }))

  return (
    <div>
      {nodes.map(node => {
        const isOpen     = !!expanded[node.id]
        const isSelected = selectedId === node.id
        const hasChildren = node.children.length > 0

        return (
          <div key={node.id}>
            <div
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer group transition-colors select-none",
                isSelected ? "bg-[#1B4F8A]/10 text-[#1B4F8A]" : "text-slate-600 hover:bg-slate-100"
              )}
              style={{ paddingLeft: 12 + depth * 14 }}
              onClick={() => onSelect(node.id)}
            >
              {hasChildren ? (
                <button onClick={e => { e.stopPropagation(); toggle(node.id) }} className="shrink-0">
                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
                </button>
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              {isOpen
                ? <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                : <Folder className="h-4 w-4 shrink-0 text-amber-400" />}
              <span className="flex-1 text-sm truncate font-medium">{node.name}</span>
            </div>
            {isOpen && node.children.length > 0 && (
              <FolderTree nodes={node.children} selectedId={selectedId}
                onSelect={onSelect} depth={depth + 1} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Folder card ────────────────────────────────────────────────
function FolderCard({ folder, onClick }: { folder: LibFolder; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 hover:border-amber-300 hover:shadow-sm transition-all group flex flex-col cursor-pointer overflow-hidden"
    >
      <div className="aspect-[4/3] flex items-center justify-center bg-amber-50/60 border-b border-slate-100">
        <Folder className="h-12 w-12 text-amber-400 group-hover:text-amber-500 transition-colors" />
      </div>
      <div className="px-3 py-2.5">
        <p className="text-sm font-medium text-slate-800 truncate">{folder.name}</p>
      </div>
    </div>
  )
}

// ── Selectable file card ───────────────────────────────────────
function FileCard({ file, selected, allowed, onSelect }: {
  file:     LibraryFile
  selected: boolean
  allowed:  boolean
  onSelect: (f: LibraryFile) => void
}) {
  const Icon  = fileIcon(file.mime_type, file.is_external)
  const color = fileColor(file.mime_type, file.is_external)

  return (
    <button
      onClick={() => allowed && onSelect(file)}
      disabled={!allowed}
      className={cn(
        "relative text-left rounded-xl border-2 flex flex-col overflow-hidden transition-all",
        !allowed && "opacity-40 cursor-not-allowed",
        allowed && selected  && "border-[#1B4F8A] bg-[#1B4F8A]/5 shadow-sm",
        allowed && !selected && "border-slate-200 hover:border-[#1B4F8A]/40 hover:shadow-sm bg-white",
      )}
    >
      {selected && (
        <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full bg-[#1B4F8A] flex items-center justify-center">
          <Check className="h-3 w-3 text-white" />
        </div>
      )}

      {/* Thumbnail */}
      <div className={cn("aspect-[4/3] flex items-center justify-center border-b border-slate-100", color.split(" ")[0] || "bg-slate-50")}>
        {file.mime_type.startsWith("image/") && !file.is_external ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.public_url} alt={file.name} className="w-full h-full object-cover" />
        ) : (
          <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center", color)}>
            <Icon className="h-6 w-6" />
          </div>
        )}
        {file.is_external && (
          <span className="absolute top-2 left-2 text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
            LINK
          </span>
        )}
      </div>

      {/* Info */}
      <div className="px-2.5 py-2 flex-1">
        <p className="text-xs font-semibold text-slate-800 line-clamp-2 leading-tight">{file.name}</p>
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[10px] text-slate-400">{formatBytes(file.size_bytes)}</span>
          <span className="text-slate-200 text-[10px]">·</span>
          <span className="text-[10px] text-slate-400">{relative(file.created_at)}</span>
        </div>
      </div>
    </button>
  )
}

// ── Upload zone (picker version) ───────────────────────────────
function PickerUploadZone({ folderId, accept, onUploaded }: {
  folderId: string | null
  accept:   string
  onUploaded: (f: LibraryFile) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging,  setDragging]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress,  setProgress]  = useState("")

  async function upload(file: File) {
    setUploading(true); setProgress(file.name)
    const fd = new FormData()
    fd.append("file", file)
    if (folderId) fd.append("folder_id", folderId)
    try {
      const res  = await fetch("/api/lms/library/files", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Upload failed"); return }
      toast.success(`${file.name} uploaded`)
      onUploaded(data)
    } finally { setUploading(false); setProgress("") }
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) upload(f) }}
      onClick={() => !uploading && inputRef.current?.click()}
      className={cn(
        "border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
        dragging    ? "border-[#1B4F8A] bg-[#1B4F8A]/5 scale-[1.01]" : "border-slate-200 hover:border-[#1B4F8A]/50 hover:bg-slate-50",
        uploading   && "pointer-events-none opacity-70",
      )}
    >
      <input ref={inputRef} type="file" accept={accept} className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-7 w-7 animate-spin text-[#1B4F8A]" />
          <p className="text-sm text-slate-600 font-medium">Uploading {progress}…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-7 w-7 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">Drop file here or <span className="text-[#1B4F8A] underline">browse</span></p>
          <p className="text-xs text-slate-400">Max 500 MB</p>
        </div>
      )}
    </div>
  )
}

// ── External link mini-modal ───────────────────────────────────
function ExternalLinkModal({ open, folderId, onClose, onAdded }: {
  open: boolean; folderId: string | null; onClose: () => void; onAdded: (f: LibraryFile) => void
}) {
  const [name,   setName]   = useState("")
  const [url,    setUrl]    = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) { setName(""); setUrl("") } }, [open])

  async function save() {
    if (!name.trim()) return toast.error("Name is required")
    if (!url.trim())  return toast.error("URL is required")
    setSaving(true)
    try {
      const res  = await fetch("/api/lms/library/files", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), public_url: url.trim(), folder_id: folderId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success("Link added")
      onAdded(data); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md z-[70]">
        <DialogHeader><DialogTitle>Add External Link</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700">
            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            Use for SharePoint / OneDrive links, YouTube videos, or any external resource URL.
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Display Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Module 3 Slides (OneDrive)" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">URL *</label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" type="url" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
            {saving ? "Saving…" : "Add Link"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── New folder mini-modal ──────────────────────────────────────
function NewFolderModal({ open, parentId, onClose, onCreated }: {
  open: boolean; parentId: string | null; onClose: () => void; onCreated: (f: LibFolder) => void
}) {
  const [name,   setName]   = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) setName("") }, [open])

  async function save() {
    if (!name.trim()) return toast.error("Name is required")
    setSaving(true)
    try {
      const res  = await fetch("/api/lms/library/folders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parent_id: parentId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success("Folder created")
      onCreated(data); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm z-[70]">
        <DialogHeader><DialogTitle>New Folder</DialogTitle></DialogHeader>
        <div className="py-2 space-y-1.5">
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Folder name…"
            autoFocus onKeyDown={e => e.key === "Enter" && save()} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Folder className="h-4 w-4" />}
            {saving ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Main component ─────────────────────────────────────────────
export default function LibraryPicker({
  open, onClose, onSelect,
  allowedTypes, title = "Library",
}: {
  open:          boolean
  onClose:       () => void
  onSelect:      (file: LibraryFile) => void
  allowedTypes?: string[]
  title?:        string
}) {
  // Data
  const [folders,    setFolders]    = useState<LibFolder[]>([])
  const [files,      setFiles]      = useState<LibraryFile[]>([])
  // Navigation
  const [selFolder,  setSelFolder]  = useState<string | null>(null)
  const [search,     setSearch]     = useState("")
  // Selection
  const [selected,   setSelected]   = useState<LibraryFile | null>(null)
  // Loading / errors
  const [loadingF,   setLoadingF]   = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(false)
  const [loadErr,    setLoadErr]    = useState<string | null>(null)
  // Panels
  const [showUpload, setShowUpload] = useState(false)
  const [linkModal,  setLinkModal]  = useState(false)
  const [folderModal, setFolderModal] = useState(false)

  const accept = allowedTypes?.length ? buildAccept(allowedTypes) : "*"

  // Load all folders once when modal opens
  useEffect(() => {
    if (!open) return
    setSelFolder(null); setSearch(""); setSelected(null); setShowUpload(false)
    setLoadingF(true)
    fetch("/api/lms/library/folders")
      .then(r => r.json())
      .then(data => { setFolders(Array.isArray(data) ? data : []); setLoadingF(false) })
      .catch(() => setLoadingF(false))
  }, [open])

  // Load files for current folder / search
  const loadFiles = useCallback(async () => {
    setLoadingFiles(true); setLoadErr(null)
    try {
      const params = new URLSearchParams()
      if (search)          params.set("search", search)
      else if (selFolder)  params.set("folder_id", selFolder)
      else                 params.set("folder_id", "root")
      const res  = await fetch(`/api/lms/library/files?${params}`)
      const data = await res.json()
      if (!res.ok) { setLoadErr(data.error ?? `HTTP ${res.status}`); setFiles([]) }
      else setFiles(Array.isArray(data) ? data : [])
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Network error"); setFiles([])
    } finally {
      setLoadingFiles(false)
    }
  }, [selFolder, search])

  useEffect(() => { if (open) loadFiles() }, [open, loadFiles])

  // Sub-folders shown in the main panel at current level (not when searching)
  const childFolders = search ? [] : folders
    .filter(f => f.parent_id === selFolder)
    .sort((a, b) => a.name.localeCompare(b.name))

  // Files filtered by allowedTypes
  const visibleFiles = files.filter(f => {
    if (!allowedTypes?.length) return true
    const ft = getFileType(f)
    return allowedTypes.some(at => at === ft
      || (at === "pptx" && ft === "ppt")
      || (at === "ppt"  && ft === "pptx"))
  })

  // Breadcrumb
  function buildPath(id: string | null): LibFolder[] {
    if (!id) return []
    const f = folders.find(x => x.id === id)
    if (!f) return []
    return [...buildPath(f.parent_id), f]
  }
  const breadcrumb = selFolder ? buildPath(selFolder) : []

  const tree      = buildTree(folders)
  const isEmpty   = !loadingFiles && childFolders.length === 0 && files.length === 0

  function navigate(id: string | null) {
    setSelFolder(id); setSearch(""); setSelected(null)
  }

  function confirm() {
    if (!selected) return
    onSelect(selected); onClose()
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] flex flex-col overflow-hidden">

        {/* ── Header ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#1B4F8A]/10 flex items-center justify-center">
              <FolderOpen className="h-4 w-4 text-[#1B4F8A]" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">{title}</h2>
              {allowedTypes?.length && (
                <p className="text-xs text-slate-400">
                  Accepting: {allowedTypes.map(t => t.toUpperCase()).join(", ")}
                </p>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Left sidebar — folder tree */}
          <aside className="w-56 shrink-0 bg-white border-r border-slate-100 flex flex-col overflow-hidden">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Folders</span>
              <button onClick={() => setFolderModal(true)}
                className="p-1 rounded text-slate-400 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/8 transition-colors"
                title="New folder">
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2 px-2">
              {/* Root entry */}
              <button
                onClick={() => navigate(null)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                  selFolder === null
                    ? "bg-[#1B4F8A]/10 text-[#1B4F8A]"
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-slate-400" />
                Library (Root)
              </button>
              {loadingF ? (
                <div className="flex justify-center pt-4">
                  <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
                </div>
              ) : (
                <FolderTree
                  nodes={tree}
                  selectedId={selFolder}
                  onSelect={id => navigate(id)}
                />
              )}
            </div>
          </aside>

          {/* Right — main panel */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Toolbar: breadcrumb + search + actions */}
            <div className="flex items-center gap-3 px-5 py-2.5 border-b border-slate-100 flex-wrap shrink-0 bg-slate-50/50">
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 text-sm text-slate-500 flex-wrap min-w-0">
                <button onClick={() => navigate(null)}
                  className={cn("hover:text-slate-800 transition-colors shrink-0",
                    !selFolder && "font-semibold text-slate-800")}>
                  Library
                </button>
                {breadcrumb.map((f, i) => (
                  <span key={f.id} className="flex items-center gap-1 min-w-0">
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                    <button onClick={() => navigate(f.id)}
                      className={cn("hover:text-slate-800 transition-colors truncate max-w-[120px]",
                        i === breadcrumb.length - 1 && "font-semibold text-slate-800")}>
                      {f.name}
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex-1" />
              {/* Search */}
              <div className="relative w-44">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search all files…"
                  className="w-full pl-8 pr-3 h-8 text-xs bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1B4F8A]/20 focus:border-[#1B4F8A]/40" />
              </div>
              <button onClick={() => setLinkModal(true)}
                className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors">
                <Link2 className="h-3.5 w-3.5" /> Add Link
              </button>
              <button onClick={() => setShowUpload(u => !u)}
                className={cn(
                  "flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg transition-colors",
                  showUpload
                    ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
                    : "bg-[#1B4F8A] hover:bg-[#163f6f] text-white"
                )}>
                <Upload className="h-3.5 w-3.5" />
                {showUpload ? "Close" : "Upload"}
              </button>
            </div>

            {/* Upload zone (collapsible) */}
            {showUpload && (
              <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
                <PickerUploadZone
                  folderId={selFolder}
                  accept={accept}
                  onUploaded={f => { setFiles(prev => [f, ...prev]); setShowUpload(false); setSelected(f) }}
                />
              </div>
            )}

            {/* Error banner */}
            {loadErr && (
              <div className="mx-5 mt-3 flex items-start gap-2.5 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700 shrink-0">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Failed to load files</p>
                  <p className="text-xs text-red-500 mt-0.5">{loadErr}</p>
                </div>
              </div>
            )}

            {/* Content grid */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {loadingFiles ? (
                <div className="flex justify-center pt-20">
                  <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
                </div>

              ) : search ? (
                /* Search results — flat file list */
                visibleFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <Search className="h-10 w-10 text-slate-200 mb-3" />
                    <p className="font-medium text-slate-600">No files match "{search}"</p>
                  </div>
                ) : (
                  <>
                    <p className="text-xs text-slate-400">{visibleFiles.length} result{visibleFiles.length !== 1 ? "s" : ""} for "{search}"</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                      {files.map(f => {
                        const ft = getFileType(f)
                        const allowed = !allowedTypes?.length || allowedTypes.some(at =>
                          at === ft || (at === "pptx" && ft === "ppt") || (at === "ppt" && ft === "pptx"))
                        return (
                          <FileCard key={f.id} file={f} selected={selected?.id === f.id}
                            allowed={allowed} onSelect={setSelected} />
                        )
                      })}
                    </div>
                  </>
                )

              ) : isEmpty ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                    <FolderOpen className="h-8 w-8 text-slate-300" />
                  </div>
                  <h3 className="font-semibold text-slate-700 mb-1">This folder is empty</h3>
                  <p className="text-sm text-slate-400 mb-5">Create sub-folders or upload files here.</p>
                  <div className="flex gap-2">
                    <button onClick={() => setFolderModal(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors">
                      <FolderPlus className="h-4 w-4" /> New Folder
                    </button>
                    <button onClick={() => setShowUpload(true)}
                      className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-xl bg-[#1B4F8A] hover:bg-[#163f6f] text-white transition-colors">
                      <Upload className="h-4 w-4" /> Upload Files
                    </button>
                  </div>
                </div>

              ) : (
                <>
                  {/* Sub-folders */}
                  {childFolders.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Folders ({childFolders.length})
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {childFolders.map(f => (
                          <FolderCard key={f.id} folder={f} onClick={() => navigate(f.id)} />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Files */}
                  {files.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                        Files ({files.length})
                        {allowedTypes?.length && visibleFiles.length !== files.length && (
                          <span className="ml-2 text-amber-500 normal-case font-normal">
                            ({files.length - visibleFiles.length} hidden — wrong type)
                          </span>
                        )}
                      </p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                        {files.map(f => {
                          const ft = getFileType(f)
                          const allowed = !allowedTypes?.length || allowedTypes.some(at =>
                            at === ft || (at === "pptx" && ft === "ppt") || (at === "ppt" && ft === "pptx"))
                          return (
                            <FileCard key={f.id} file={f} selected={selected?.id === f.id}
                              allowed={allowed} onSelect={setSelected} />
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50 shrink-0">
          <p className="text-xs text-slate-400">
            {selected ? (
              <span className="flex items-center gap-1.5 text-[#1B4F8A] font-medium">
                <Check className="h-3.5 w-3.5" /> {selected.name}
              </span>
            ) : (
              "Click a file to select it"
            )}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="px-4 py-2 text-sm font-medium rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 transition-colors">
              Cancel
            </button>
            <button onClick={confirm} disabled={!selected}
              className="px-5 py-2 text-sm font-semibold rounded-xl bg-[#1B4F8A] hover:bg-[#163f6f] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Select File
            </button>
          </div>
        </div>
      </div>

      {/* Sub-modals */}
      <ExternalLinkModal
        open={linkModal}
        folderId={selFolder}
        onClose={() => setLinkModal(false)}
        onAdded={f => { setFiles(prev => [f, ...prev]); setSelected(f) }}
      />
      <NewFolderModal
        open={folderModal}
        parentId={selFolder}
        onClose={() => setFolderModal(false)}
        onCreated={f => setFolders(prev => [...prev, f])}
      />
    </div>
  )
}
