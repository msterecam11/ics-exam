"use client"

import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Plus, Search, MoreHorizontal, Trash2, Edit,
  Mail, Eye, EyeOff, Loader2, Upload,
  User, Building2, RefreshCw, BarChart2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"

interface Student {
  id:         string
  name:       string
  email:      string
  job_title:  string | null
  company:    string | null
  language:   string
  last_login: string | null
  created_at: string
}

interface Pagination {
  total: number
  page:  number
  limit: number
}

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#"
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

// ─── Create / Edit Student Modal ─────────────────────────────
function StudentModal({
  open, onClose, onSaved, student,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  student?: Student | null
}) {
  const isEdit = !!student

  const [name,       setName]       = useState(student?.name       ?? "")
  const [email,      setEmail]      = useState(student?.email      ?? "")
  const [jobTitle,   setJobTitle]   = useState(student?.job_title  ?? "")
  const [company,    setCompany]    = useState(student?.company    ?? "")
  const [password,   setPassword]   = useState("")
  const [showPw,     setShowPw]     = useState(false)
  const [sendEmail,  setSendEmail]  = useState(true)
  const [saving,     setSaving]     = useState(false)

  // Reset when student changes
  useEffect(() => {
    setName(student?.name      ?? "")
    setEmail(student?.email    ?? "")
    setJobTitle(student?.job_title ?? "")
    setCompany(student?.company    ?? "")
    setPassword("")
  }, [student])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const body: any = { name, email, job_title: jobTitle || null, company: company || null }
    if (!isEdit) { body.password = password; body.sendEmail = sendEmail }
    else if (password) { body.password = password }

    const res  = await fetch("/api/lms/students", {
      method:  isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(isEdit ? { ...body, id: student!.id } : body),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { toast.error(data.error ?? "Failed"); return }
    if (!isEdit && data.emailError) toast.error(`Student created but email failed: ${data.emailError}`)
    else if (!isEdit && data.emailSent) toast.success("Student created and credentials emailed")
    else toast.success(isEdit ? "Student updated" : "Student created")
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Student" : "Add Student"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Full Name <span className="text-red-500">*</span></Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Jane Smith" required />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Email <span className="text-red-500">*</span></Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@example.com" required />
            </div>
            <div className="space-y-1">
              <Label>Job Title</Label>
              <Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Pilot" />
            </div>
            <div className="space-y-1">
              <Label>Company</Label>
              <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="Airline Co." />
            </div>
          </div>

          {/* Password */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label>{isEdit ? "New Password (leave blank to keep)" : "Password *"}</Label>
              {!isEdit && (
                <button type="button" onClick={() => setPassword(generatePassword())}
                  className="text-xs text-[#1B4F8A] hover:underline flex items-center gap-1">
                  <RefreshCw className="h-3 w-3" /> Generate
                </button>
              )}
            </div>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder={isEdit ? "Leave blank to keep current" : "Min. 8 characters"}
                required={!isEdit}
                minLength={8}
                className="pr-10"
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {!isEdit && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <Checkbox
                id="send-email"
                checked={sendEmail}
                onCheckedChange={v => setSendEmail(!!v)}
              />
              <label htmlFor="send-email" className="text-sm text-blue-800 cursor-pointer flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" />
                Email login credentials to student
              </label>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "Save Changes" : "Add Student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ─── CSV Import Modal ────────────────────────────────────────
function CsvImportModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [file,       setFile]       = useState<File | null>(null)
  const [courseId,   setCourseId]   = useState("")
  const [courses,    setCourses]    = useState<{ id: string; title: string }[]>([])
  const [uploading,  setUploading]  = useState(false)
  const [result,     setResult]     = useState<{
    total: number; success: number; errors: number; skipped: number;
    results: { row: number; email: string; status: string; error?: string }[]
  } | null>(null)

  useEffect(() => {
    if (!open) return
    fetch("/api/lms/courses").then(r => r.json()).then(d => setCourses(d.courses ?? []))
  }, [open])

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { toast.error("Select a CSV file"); return }
    setUploading(true)
    const fd = new FormData()
    fd.append("file", file)
    if (courseId) fd.append("enroll_course_id", courseId)
    const res  = await fetch("/api/lms/import", { method: "POST", body: fd })
    const data = await res.json()
    setUploading(false)
    if (!res.ok) { toast.error(data.error ?? "Import failed"); return }
    setResult(data)
    if (data.success > 0) onDone()
  }

  function reset() { setFile(null); setCourseId(""); setResult(null) }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset() } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Students from CSV</DialogTitle>
        </DialogHeader>

        {!result ? (
          <form onSubmit={handleUpload} className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>CSV File <span className="text-red-500">*</span></Label>
              <input
                type="file"
                accept=".csv"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#1B4F8A]/10 file:text-[#1B4F8A] hover:file:bg-[#1B4F8A]/20 cursor-pointer"
                required
              />
              <p className="text-xs text-slate-400">
                Required columns: <code className="bg-slate-100 px-1 rounded">name</code>,{" "}
                <code className="bg-slate-100 px-1 rounded">email</code>.
                Optional: <code className="bg-slate-100 px-1 rounded">password</code>,{" "}
                <code className="bg-slate-100 px-1 rounded">job_title</code>,{" "}
                <code className="bg-slate-100 px-1 rounded">company</code>,{" "}
                <code className="bg-slate-100 px-1 rounded">department</code>.
                Passwords auto-generated if not provided.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Auto-enroll in Course (optional)</Label>
              <select
                className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm bg-white text-slate-700"
                value={courseId}
                onChange={e => setCourseId(e.target.value)}
              >
                <option value="">No auto-enrollment</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { onClose(); reset() }}>Cancel</Button>
              <Button type="submit" disabled={uploading} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Importing…" : "Import"}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-4 gap-2 text-center">
              {[
                { label: "Total",   value: result.total,   color: "text-slate-700" },
                { label: "Created", value: result.success,  color: "text-emerald-600" },
                { label: "Skipped", value: result.skipped,  color: "text-amber-600" },
                { label: "Errors",  value: result.errors,   color: "text-red-500" },
              ].map(s => (
                <div key={s.label} className="bg-slate-50 rounded-lg p-3">
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
            {result.errors > 0 && (
              <div className="max-h-40 overflow-y-auto space-y-1">
                {result.results.filter(r => r.status === "error").map(r => (
                  <p key={r.row} className="text-xs text-red-600">
                    Row {r.row} ({r.email}): {r.error}
                  </p>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => { onClose(); reset() }} className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white">
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Main Page ───────────────────────────────────────────────
export default function StudentsPage() {
  const router = useRouter()
  const [students,   setStudents]   = useState<Student[]>([])
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 50 })
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState("")
  const [searchQ,    setSearchQ]    = useState("")
  const [modalOpen,  setModalOpen]  = useState(false)
  const [editTarget, setEditTarget] = useState<Student | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [csvOpen,    setCsvOpen]    = useState(false)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function load(page = 1, q = searchQ) {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: "50" })
    if (q) params.set("q", q)
    const res  = await fetch(`/api/lms/students?${params}`)
    const data = await res.json()
    setStudents(data.students ?? [])
    setPagination({ total: data.total ?? 0, page, limit: 50 })
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function handleSearchChange(val: string) {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => {
      setSearchQ(val)
      load(1, val)
    }, 300)
  }

  async function deleteStudent(id: string, name: string) {
    if (!confirm(`Remove student "${name}"? This cannot be undone.`)) return
    setDeletingId(id)
    const res  = await fetch(`/api/lms/students?id=${id}`, { method: "DELETE" })
    const data = await res.json()
    setDeletingId(null)
    if (!res.ok) { toast.error(data.error ?? "Failed to delete"); return }
    toast.success(`${name} removed`)
    load()
  }

  function openCreate()          { setEditTarget(null); setModalOpen(true) }
  function openEdit(s: Student)  { setEditTarget(s);    setModalOpen(true) }

  const totalPages = Math.ceil(pagination.total / pagination.limit)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Students</h1>
          <p className="text-sm text-slate-500 mt-1">
            {pagination.total} student{pagination.total !== 1 ? "s" : ""} registered
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" className="gap-2 text-xs sm:text-sm" onClick={() => setCsvOpen(true)}>
            <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Import </span>CSV
          </Button>
          <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2 text-xs sm:text-sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Add </span>Student
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          placeholder="Search by name, email or company…"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : students.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <User className="h-12 w-12 text-slate-200 mb-3" />
          <p className="text-slate-500 font-medium">No students found</p>
          {!searchQ && (
            <Button size="sm" className="mt-4 bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2" onClick={openCreate}>
              <Plus className="h-4 w-4" /> Add First Student
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-slate-600">Student</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">Company</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">Lang</th>
                  <th className="text-left px-4 py-3 font-medium text-slate-600 hidden xl:table-cell">Last Login</th>
                  <th className="px-4 py-3 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#1B4F8A]/10 flex items-center justify-center text-[#1B4F8A] font-bold text-xs shrink-0">
                          {s.name[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{s.name}</p>
                          <p className="text-xs text-slate-500">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-1.5 text-slate-600">
                        {s.company && <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                        <span>{s.company ?? <span className="text-slate-300">—</span>}</span>
                      </div>
                      {s.job_title && <p className="text-xs text-slate-400">{s.job_title}</p>}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <Badge variant="outline" className="text-xs uppercase">{s.language}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell text-slate-500 text-xs">
                      {s.last_login
                        ? new Date(s.last_login).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : <span className="text-slate-300">Never</span>}
                    </td>
                    <td className="px-4 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon" className="h-8 w-8" />}
                        >
                          {deletingId === s.id
                            ? <Loader2 className="h-4 w-4 animate-spin" />
                            : <MoreHorizontal className="h-4 w-4" />}
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                          <DropdownMenuItem
                            onClick={() => router.push(`/lms-admin/progress/${s.id}`)}
                            className="gap-2 cursor-pointer"
                          >
                            <BarChart2 className="h-4 w-4" /> View Progress
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openEdit(s)} className="gap-2">
                            <Edit className="h-4 w-4" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => deleteStudent(s.id, s.name)}
                            className="gap-2 text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm text-slate-500">
              <span>
                Showing {(pagination.page - 1) * pagination.limit + 1}–
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm"
                  disabled={pagination.page <= 1}
                  onClick={() => load(pagination.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline" size="sm"
                  disabled={pagination.page >= totalPages}
                  onClick={() => load(pagination.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <StudentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={load}
        student={editTarget}
      />

      <CsvImportModal
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onDone={load}
      />
    </div>
  )
}
