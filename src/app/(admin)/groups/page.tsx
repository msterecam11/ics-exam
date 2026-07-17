"use client"

import { useEffect, useState } from "react"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Plus, Pencil, Trash2, BookOpen, Loader2, ImagePlus, X } from "lucide-react"
import { toast } from "sonner"
import type { Group } from "@/types"
import Link from "next/link"
import { cn } from "@/lib/utils"

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [saving, setSaving] = useState(false)
  const [logos, setLogos] = useState<string[]>([])
  const [uploadingLogo, setUploadingLogo] = useState(false)

  async function load() {
    const res = await fetch("/api/groups")
    const data = await res.json()
    setGroups(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setEditing(null)
    setName("")
    setDescription("")
    setLogos([])
    setDialogOpen(true)
  }

  function openEdit(group: Group) {
    setEditing(group)
    setName(group.name)
    setDescription(group.description ?? "")
    setLogos(group.manual_report_logos ?? [])
    setDialogOpen(true)
  }

  async function uploadLogo(file: File) {
    if (!editing) return
    setUploadingLogo(true)
    const form = new FormData()
    form.append("file", file)
    const res = await fetch(`/api/groups/${editing.id}/logo`, { method: "POST", body: form })
    setUploadingLogo(false)
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      toast.error(err.error ?? "Failed to upload logo")
      return
    }
    const data = await res.json()
    setLogos(data.manual_report_logos)
    load()
  }

  async function removeLogo(url: string) {
    if (!editing) return
    const res = await fetch(`/api/groups/${editing.id}/logo`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    })
    if (!res.ok) { toast.error("Failed to remove logo"); return }
    const data = await res.json()
    setLogos(data.manual_report_logos)
    load()
  }

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)

    const url = editing ? `/api/groups/${editing.id}` : "/api/groups"
    const method = editing ? "PUT" : "POST"

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    })

    setSaving(false)

    if (res.ok) {
      toast.success(editing ? "Group updated" : "Group created")
      setDialogOpen(false)
      load()
    } else {
      const err = await res.json()
      toast.error(err.error ?? "Something went wrong")
    }
  }

  async function handleDelete(id: string, groupName: string) {
    if (!confirm(`Delete "${groupName}"? All courses and exams inside will be deleted.`)) return

    const res = await fetch(`/api/groups/${id}`, { method: "DELETE" })
    if (res.ok) {
      toast.success("Group deleted")
      load()
    } else {
      toast.error("Failed to delete group")
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Groups</h2>
          <p className="text-muted-foreground text-sm">Organize your courses into groups</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger
            render={
              <Button
                onClick={openCreate}
                className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2"
              />
            }
          >
            <Plus className="h-4 w-4" /> New Group
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Group" : "Create Group"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Group Name *</Label>
                <Input
                  placeholder="e.g. Aviation Safety"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  placeholder="Optional description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>

              {editing && (
                <div className="space-y-2">
                  <Label>Manual Report Logos</Label>
                  <p className="text-xs text-muted-foreground">
                    Optional — shown alongside the ICS Aviation logo on this group&apos;s manual (client) reports.
                    Falls back to just the ICS logo if none are set. Up to 3.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {logos.map((url) => (
                      <div key={url} className="relative w-16 h-16 border rounded-lg overflow-hidden bg-white group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt="Group logo" className="w-full h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => removeLogo(url)}
                          className="absolute top-0.5 right-0.5 bg-white/90 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3 text-red-500" />
                        </button>
                      </div>
                    ))}
                    {logos.length < 3 && (
                      <label className="w-16 h-16 border border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:bg-muted transition-colors">
                        {uploadingLogo
                          ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          : <ImagePlus className="h-4 w-4 text-muted-foreground" />
                        }
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/svg+xml"
                          className="hidden"
                          disabled={uploadingLogo}
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) uploadLogo(file)
                            e.target.value = ""
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saving || !name.trim()}
                  className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save Changes" : "Create"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">No groups yet. Create your first group.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((group) => (
            <Card key={group.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base truncate">{group.name}</CardTitle>
                    {group.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {group.description}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(group)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => handleDelete(group.id, group.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <Badge variant="secondary" className="text-xs">
                    {group.courses?.length ?? 0} course{group.courses?.length !== 1 ? "s" : ""}
                  </Badge>
                  <Link
                    href={`/courses?group=${group.id}`}
                    className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "text-xs text-[#4B7EC8]")}
                  >
                    View Courses →
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
