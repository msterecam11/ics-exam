"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import {
  Folder, FolderOpen, FolderPlus, Upload, Link2, Search,
  FileVideo, FileText, Image, File, Loader2, Trash2,
  Edit2, Copy, ExternalLink, X, Check, ChevronRight,
  MoreVertical, Plus, Info, Globe,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input }  from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast }  from "sonner"
import { cn }     from "@/lib/utils"

// ─── Types ────────────────────────────────────────────────────────────────────
interface LibFolder {
  id:        string
  name:      string
  parent_id: string | null
  color:     string | null
  created_at: string
}

interface LibFile {
  id:            string
  folder_id:     string | null
  name:          string
  original_name: string
  mime_type:     string
  size_bytes:    number
  public_url:    string
  is_external:   boolean
  description:   string | null
  created_at:    string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatBytes(b: number) {
  if (b === 0) return "—"
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function fileIcon(mime: string, isExt: boolean) {
  if (isExt) return Globe
  if (mime.startsWith("video/"))  return FileVideo
  if (mime.startsWith("image/"))  return Image
  if (mime === "application/pdf") return FileText
  if (mime.includes("word") || mime.includes("document")) return FileText
  if (mime.includes("presentation") || mime.includes("powerpoint")) return FileText
  return File
}

function fileColor(mime: string, isExt: boolean) {
  if (isExt) return "bg-blue-50 text-blue-600"
  if (mime.startsWith("video/"))  return "bg-purple-50 text-purple-600"
  if (mime.startsWith("image/"))  return "bg-pink-50 text-pink-600"
  if (mime === "application/pdf") return "bg-red-50 text-red-600"
  if (mime.includes("word"))      return "bg-blue-50 text-blue-600"
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "bg-orange-50 text-orange-600"
  return "bg-slate-100 text-slate-500"
}

function relative(date: string) {
  const d = new Date(date)
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60)    return "Just now"
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

// Build tree from flat list
interface FolderNode extends LibFolder { children: FolderNode[] }
function buildTree(folders: LibFolder[], parentId: string | null = null): FolderNode[] {
  return folders
    .filter(f => f.parent_id === parentId)
    .map(f => ({ ...f, children: buildTree(folders, f.id) }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

// ─── Folder tree sidebar ──────────────────────────────────────────────────────
function FolderTree({
  nodes, selectedId, onSelect, onRename, onDelete, depth = 0,
}: {
  nodes:      FolderNode[]
  selectedId: string | null
  onSelect:   (id: string | null) => void
  onRename:   (f: LibFolder) => void
  onDelete:   (f: LibFolder) => void
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
              style={{ paddingLeft: 12 + depth * 16 }}
              onClick={() => onSelect(node.id)}
            >
              {hasChildren ? (
                <button onClick={e => { e.stopPropagation(); toggle(node.id) }}
                  className="shrink-0">
                  <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-90")} />
                </button>
              ) : (
                <span className="w-3.5 shrink-0" />
              )}
              {isOpen
                ? <FolderOpen className="h-4 w-4 shrink-0 text-amber-500" />
                : <Folder className="h-4 w-4 shrink-0 text-amber-400" />}
              <span className="flex-1 text-sm truncate font-medium">{node.name}</span>
              <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                <button onClick={e => { e.stopPropagation(); onRename(node) }}
                  className="p-1 rounded hover:bg-white/80 text-slate-400 hover:text-slate-700">
                  <Edit2 className="h-3 w-3" />
                </button>
                <button onClick={e => { e.stopPropagation(); onDelete(node) }}
                  className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            {isOpen && node.children.length > 0 && (
              <FolderTree nodes={node.children} selectedId={selectedId} onSelect={onSelect}
                onRename={onRename} onDelete={onDelete} depth={depth + 1} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── File card ────────────────────────────────────────────────────────────────
function FileCard({ file, onDelete, onRename }: {
  file: LibFile; onDelete: (f: LibFile) => void; onRename: (f: LibFile) => void
}) {
  const [copied, setCopied]   = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const Icon  = fileIcon(file.mime_type, file.is_external)
  const color = fileColor(file.mime_type, file.is_external)

  async function copyUrl() {
    await navigator.clipboard.writeText(file.public_url)
    setCopied(true)
    toast.success("URL copied to clipboard")
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative bg-white rounded-xl border border-slate-200 hover:border-[#1B4F8A]/30 hover:shadow-sm transition-all group flex flex-col overflow-hidden">
      {/* Thumbnail / icon area */}
      <div className="aspect-[4/3] flex items-center justify-center bg-slate-50 border-b border-slate-100 relative">
        {file.mime_type.startsWith("image/") && !file.is_external ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.public_url} alt={file.name} className="w-full h-full object-cover" />
        ) : (
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", color)}>
            <Icon className="h-7 w-7" />
          </div>
        )}
        {file.is_external && (
          <span className="absolute top-2 right-2 text-[10px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
            LINK
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3 flex-1 flex flex-col gap-1">
        <p className="text-sm font-medium text-slate-800 line-clamp-2 leading-tight">{file.name}</p>
        <div className="flex items-center gap-1.5 mt-auto">
          <span className="text-[10px] text-slate-400">{formatBytes(file.size_bytes)}</span>
          <span className="text-slate-200">·</span>
          <span className="text-[10px] text-slate-400">{relative(file.created_at)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex items-center gap-1.5">
        <button onClick={copyUrl}
          className={cn(
            "flex-1 flex items-center justify-center gap-1 text-xs font-medium py-1.5 rounded-lg transition-colors",
            copied ? "bg-emerald-50 text-emerald-700" : "bg-slate-50 text-slate-600 hover:bg-[#1B4F8A]/8 hover:text-[#1B4F8A]"
          )}>
          {copied ? <><Check className="h-3.5 w-3.5" /> Copied!</> : <><Copy className="h-3.5 w-3.5" /> Copy URL</>}
        </button>
        <a href={file.public_url} target="_blank" rel="noreferrer"
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        {/* 3-dot menu */}
        <div className="relative">
          <button onClick={() => setMenuOpen(m => !m)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors">
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 bottom-full mb-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20 text-left">
                <button onClick={() => { setMenuOpen(false); onRename(file) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-slate-700">
                  <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Rename
                </button>
                <button onClick={() => { setMenuOpen(false); onDelete(file) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Upload drop zone ─────────────────────────────────────────────────────────
function UploadZone({ folderId, onUploaded }: { folderId: string | null; onUploaded: (f: LibFile) => void }) {
  const [dragging,   setDragging]   = useState(false)
  const [uploading,  setUploading]  = useState(false)
  const [progress,   setProgress]   = useState<string>("")
  const inputRef = useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setUploading(true)
    setProgress(file.name)
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

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return
    for (const f of Array.from(files)) await uploadFile(f)
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
      onClick={() => !uploading && inputRef.current?.click()}
      className={cn(
        "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
        dragging ? "border-[#1B4F8A] bg-[#1B4F8A]/5 scale-[1.01]" : "border-slate-200 hover:border-[#1B4F8A]/50 hover:bg-slate-50"
      )}
    >
      <input ref={inputRef} type="file" multiple className="hidden"
        onChange={e => handleFiles(e.target.files)} />
      {uploading ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 text-[#1B4F8A] animate-spin" />
          <p className="text-sm text-slate-600 font-medium">Uploading {progress}…</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2">
          <Upload className="h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">Drop files here or click to browse</p>
          <p className="text-xs text-slate-400">PDF, Video, Images, PowerPoint — up to 500 MB each</p>
        </div>
      )}
    </div>
  )
}

// ─── Add external link modal ──────────────────────────────────────────────────
function ExternalLinkModal({ open, folderId, onClose, onAdded }: {
  open: boolean; folderId: string | null; onClose: () => void; onAdded: (f: LibFile) => void
}) {
  const [name,    setName]    = useState("")
  const [url,     setUrl]     = useState("")
  const [desc,    setDesc]    = useState("")
  const [saving,  setSaving]  = useState(false)

  useEffect(() => { if (open) { setName(""); setUrl(""); setDesc("") } }, [open])

  async function save() {
    if (!name.trim()) return toast.error("Name is required")
    if (!url.trim())  return toast.error("URL is required")
    setSaving(true)
    try {
      const res  = await fetch("/api/lms/library/files", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), public_url: url.trim(), folder_id: folderId, description: desc.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success("Link added")
      onAdded(data); onClose()
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Add External Link</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-start gap-3 bg-blue-50 rounded-xl px-4 py-3 text-xs text-blue-700">
            <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
            Use this for SharePoint / OneDrive links, YouTube videos, or any external resource URL.
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Display Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Module 3 Slides (OneDrive)" autoFocus />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">URL *</label>
            <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://..." type="url" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Description</label>
            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional note…" />
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

// ─── New / Rename folder modal ────────────────────────────────────────────────
function FolderModal({ open, onClose, editing, parentId, folders, onSaved }: {
  open: boolean; onClose: () => void; editing: LibFolder | null
  parentId: string | null; folders: LibFolder[]
  onSaved: (f: LibFolder) => void
}) {
  const [name,    setName]    = useState("")
  const [parent,  setParent]  = useState<string>("")
  const [saving,  setSaving]  = useState(false)

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "")
      setParent(editing?.parent_id ?? parentId ?? "")
    }
  }, [open, editing, parentId])

  async function save() {
    if (!name.trim()) return toast.error("Name is required")
    setSaving(true)
    try {
      const method = editing ? "PATCH" : "POST"
      const body: Record<string, unknown> = {
        name:      name.trim(),
        parent_id: parent || null,
      }
      if (editing) body.id = editing.id

      const res  = await fetch("/api/lms/library/folders", {
        method, headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? "Failed"); return }
      toast.success(editing ? "Folder renamed" : "Folder created")
      onSaved(data); onClose()
    } finally { setSaving(false) }
  }

  const parentOptions = folders.filter(f => f.id !== editing?.id)

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{editing ? "Rename Folder" : "New Folder"}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Folder Name *</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Navigation Charts"
              autoFocus onKeyDown={e => e.key === "Enter" && save()} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Parent Folder</label>
            <select value={parent} onChange={e => setParent(e.target.value)}
              className="w-full h-9 rounded-lg border border-input bg-transparent px-3 text-sm">
              <option value="">— Root (no parent) —</option>
              {parentOptions.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Folder className="h-4 w-4" />}
            {saving ? "Saving…" : (editing ? "Rename" : "Create Folder")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Rename file modal ────────────────────────────────────────────────────────
function RenameFileModal({ file, onClose, onRenamed }: {
  file: LibFile; onClose: () => void; onRenamed: (f: LibFile) => void
}) {
  const [name, setName]   = useState(file.name)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) return toast.error("Name is required")
    setSaving(true)
    const res  = await fetch("/api/lms/library/files", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: file.id, name: name.trim() }),
    })
    setSaving(false)
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Renamed")
    onRenamed(data); onClose()
  }

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Rename File</DialogTitle></DialogHeader>
        <div className="py-2 space-y-1.5">
          <Input value={name} onChange={e => setName(e.target.value)} autoFocus
            onKeyDown={e => e.key === "Enter" && save()} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Rename"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Folder card (shown in main panel) ───────────────────────────────────────
function FolderCard({ folder, onClick, onRename, onDelete }: {
  folder: LibFolder
  onClick:  () => void
  onRename: (f: LibFolder) => void
  onDelete: (f: LibFolder) => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div
      className="bg-white rounded-xl border border-slate-200 hover:border-amber-300 hover:shadow-sm transition-all group flex flex-col cursor-pointer overflow-hidden"
      onClick={onClick}
    >
      {/* Icon area */}
      <div className="aspect-[4/3] flex items-center justify-center bg-amber-50/60 border-b border-slate-100">
        <Folder className="h-14 w-14 text-amber-400 group-hover:text-amber-500 transition-colors" />
      </div>
      {/* Name + menu */}
      <div className="px-3 py-2.5 flex items-center gap-1">
        <p className="flex-1 text-sm font-medium text-slate-800 truncate">{folder.name}</p>
        <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(m => !m)}
            className="p-1 rounded text-slate-300 hover:text-slate-500 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 bottom-full mb-1 w-36 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
                <button onClick={() => { setMenuOpen(false); onRename(folder) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 text-slate-700">
                  <Edit2 className="h-3.5 w-3.5 text-slate-400" /> Rename
                </button>
                <button onClick={() => { setMenuOpen(false); onDelete(folder) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Library page ────────────────────────────────────────────────────────
export default function LibraryPage() {
  const [folders,      setFolders]      = useState<LibFolder[]>([])
  const [files,        setFiles]        = useState<LibFile[]>([])
  const [selFolder,    setSelFolder]    = useState<string | null>(null)
  const [search,       setSearch]       = useState("")
  const [loadingF,     setLoadingF]     = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(false)

  // Modals
  const [folderModal, setFolderModal] = useState(false)
  const [editFolder,  setEditFolder]  = useState<LibFolder | null>(null)
  const [linkModal,   setLinkModal]   = useState(false)
  const [renameFile,  setRenameFile]  = useState<LibFile | null>(null)
  const [showUpload,  setShowUpload]  = useState(false)

  // Load all folders once
  useEffect(() => {
    fetch("/api/lms/library/folders")
      .then(r => r.json())
      .then(data => { setFolders(data); setLoadingF(false) })
  }, [])

  // Load files for the current folder (or root) when selection / search changes
  const loadFiles = useCallback(async () => {
    setLoadingFiles(true)
    const params = new URLSearchParams()
    // When searching show all files matching search, otherwise only current folder
    if (search)    params.set("search", search)
    else if (selFolder) params.set("folder_id", selFolder)
    else params.set("folder_id", "root")   // only root-level files (no folder)
    const res = await fetch(`/api/lms/library/files?${params}`)
    if (res.ok) setFiles(await res.json())
    setLoadingFiles(false)
  }, [selFolder, search])

  useEffect(() => { loadFiles() }, [loadFiles])

  // Child folders shown in the main panel at current level
  const childFolders = folders
    .filter(f => f.parent_id === selFolder)
    .sort((a, b) => a.name.localeCompare(b.name))

  async function deleteFolder(f: LibFolder) {
    if (!confirm(`Delete folder "${f.name}"?`)) return
    const res  = await fetch(`/api/lms/library/folders?id=${f.id}`, { method: "DELETE" })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    toast.success("Folder deleted")
    setFolders(prev => prev.filter(x => x.id !== f.id))
    if (selFolder === f.id) setSelFolder(null)
  }

  async function deleteFile(f: LibFile) {
    if (!confirm(`Delete "${f.name}"? This cannot be undone.`)) return
    const res = await fetch(`/api/lms/library/files?id=${f.id}`, { method: "DELETE" })
    if (!res.ok) { toast.error("Failed to delete"); return }
    toast.success("File deleted")
    setFiles(prev => prev.filter(x => x.id !== f.id))
  }

  function onFolderSaved(f: LibFolder) {
    setFolders(prev => editFolder
      ? prev.map(x => x.id === f.id ? f : x)
      : [...prev, f]
    )
  }

  const tree = buildTree(folders)
  const selFolderObj = folders.find(f => f.id === selFolder) ?? null

  // Breadcrumb path
  function buildPath(id: string | null): LibFolder[] {
    if (!id) return []
    const f = folders.find(x => x.id === id)
    if (!f) return []
    return [...buildPath(f.parent_id), f]
  }
  const breadcrumb = selFolder ? buildPath(selFolder) : []

  const isEmpty = !loadingFiles && childFolders.length === 0 && files.length === 0

  return (
    <div className="flex gap-0 h-full -m-6">

      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <aside className="w-60 shrink-0 bg-white border-r border-slate-200 flex flex-col h-full overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <span className="text-sm font-bold text-slate-900">Folders</span>
          <button
            onClick={() => { setEditFolder(null); setFolderModal(true) }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#1B4F8A] hover:bg-[#1B4F8A]/8 transition-colors"
            title="New folder"
          >
            <FolderPlus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          <button
            onClick={() => { setSelFolder(null); setSearch("") }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
              selFolder === null ? "bg-[#1B4F8A]/10 text-[#1B4F8A]" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            <FolderOpen className="h-4 w-4 shrink-0 text-slate-400" />
            Library (Root)
          </button>
          {loadingF ? (
            <div className="flex justify-center pt-4"><Loader2 className="h-4 w-4 animate-spin text-slate-300" /></div>
          ) : (
            <FolderTree
              nodes={tree}
              selectedId={selFolder}
              onSelect={id => { setSelFolder(id); setSearch("") }}
              onRename={f => { setEditFolder(f); setFolderModal(true) }}
              onDelete={deleteFolder}
            />
          )}
        </div>
      </aside>

      {/* ── Right: main explorer panel ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 bg-white flex-wrap">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-sm text-slate-500 flex-wrap">
            <button onClick={() => { setSelFolder(null); setSearch("") }}
              className={cn("hover:text-slate-800 transition-colors", !selFolder && "font-semibold text-slate-800")}>
              Library
            </button>
            {breadcrumb.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                <button onClick={() => { setSelFolder(f.id); setSearch("") }}
                  className={cn("hover:text-slate-800 transition-colors", i === breadcrumb.length - 1 && "font-semibold text-slate-800")}>
                  {f.name}
                </button>
              </span>
            ))}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input placeholder="Search all files…" className="pl-8 h-8 text-sm" value={search}
              onChange={e => setSearch(e.target.value)} />
            {search && (
              <button onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Button size="sm" variant="outline" onClick={() => { setEditFolder(null); setFolderModal(true) }} className="gap-1.5 h-8 text-xs">
            <FolderPlus className="h-3.5 w-3.5" /> New Folder
          </Button>
          <Button size="sm" variant="outline" onClick={() => setLinkModal(true)} className="gap-1.5 h-8 text-xs">
            <Link2 className="h-3.5 w-3.5" /> Add Link
          </Button>
          <Button size="sm" onClick={() => setShowUpload(u => !u)}
            className={cn("gap-1.5 h-8 text-xs", showUpload
              ? "bg-slate-200 text-slate-700 hover:bg-slate-300"
              : "bg-[#1B4F8A] hover:bg-[#163f6f] text-white")}>
            <Upload className="h-3.5 w-3.5" />
            {showUpload ? "Close" : "Upload"}
          </Button>
        </div>

        {/* Upload zone */}
        {showUpload && (
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
            <UploadZone
              folderId={selFolder}
              onUploaded={f => { setFiles(prev => [f, ...prev]); setShowUpload(false) }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {loadingF || loadingFiles ? (
            <div className="flex justify-center pt-20">
              <Loader2 className="h-7 w-7 animate-spin text-slate-300" />
            </div>

          ) : search ? (
            /* ── Search results: flat file list across all folders ── */
            files.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Search className="h-10 w-10 text-slate-200 mb-3" />
                <p className="font-medium text-slate-600">No files match "{search}"</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-400">{files.length} result{files.length !== 1 ? "s" : ""} for "{search}"</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                  {files.map(f => (
                    <FileCard key={f.id} file={f} onDelete={deleteFile} onRename={f => setRenameFile(f)} />
                  ))}
                </div>
              </>
            )

          ) : isEmpty ? (
            /* ── Empty state ── */
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <FolderOpen className="h-8 w-8 text-slate-300" />
              </div>
              <h3 className="font-semibold text-slate-700 text-lg mb-1">This folder is empty</h3>
              <p className="text-sm text-slate-400 mb-6 max-w-xs">
                Create sub-folders or upload files here.
              </p>
              <div className="flex gap-2">
                <Button onClick={() => { setEditFolder(null); setFolderModal(true) }} variant="outline" className="gap-2">
                  <FolderPlus className="h-4 w-4" /> New Folder
                </Button>
                <Button onClick={() => setShowUpload(true)} className="bg-[#1B4F8A] hover:bg-[#163f6f] text-white gap-2">
                  <Upload className="h-4 w-4" /> Upload Files
                </Button>
              </div>
            </div>

          ) : (
            <>
              {/* ── Sub-folders row ── */}
              {childFolders.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Folders ({childFolders.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                    {childFolders.map(f => (
                      <FolderCard
                        key={f.id}
                        folder={f}
                        onClick={() => { setSelFolder(f.id); setSearch("") }}
                        onRename={f => { setEditFolder(f); setFolderModal(true) }}
                        onDelete={deleteFolder}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* ── Files row ── */}
              {files.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Files ({files.length})
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
                    {files.map(f => (
                      <FileCard key={f.id} file={f} onDelete={deleteFile} onRename={f => setRenameFile(f)} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <FolderModal
        open={folderModal}
        onClose={() => { setFolderModal(false); setEditFolder(null) }}
        editing={editFolder}
        parentId={selFolder}
        folders={folders}
        onSaved={onFolderSaved}
      />
      <ExternalLinkModal
        open={linkModal}
        folderId={selFolder}
        onClose={() => setLinkModal(false)}
        onAdded={f => setFiles(prev => [f, ...prev])}
      />
      {renameFile && (
        <RenameFileModal
          file={renameFile}
          onClose={() => setRenameFile(null)}
          onRenamed={f => { setFiles(prev => prev.map(x => x.id === f.id ? f : x)); setRenameFile(null) }}
        />
      )}
    </div>
  )
}
