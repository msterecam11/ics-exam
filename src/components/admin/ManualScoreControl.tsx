"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Sliders, ChevronDown, Loader2, Send, FileText, Eye, Pencil, Trash2 } from "lucide-react"
import { toast } from "sonner"
import Link from "next/link"

export interface ManualScoreRow {
  id: string
  candidate_id: string
  target_score: number
  achieved_score: number
  is_exact_match: boolean
  is_identical_to_original: boolean
  status: "draft" | "confirmed" | "superseded" | "deleted"
}

interface Props {
  candidateId: string
  examId: string
  manualScore: ManualScoreRow | null
  onChange: (candidateId: string, manualScore: ManualScoreRow | null) => void
}

export default function ManualScoreControl({ candidateId, examId, manualScore, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState("")
  const [preview, setPreview] = useState<ManualScoreRow | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const active = manualScore && manualScore.status !== "deleted" && manualScore.status !== "superseded" ? manualScore : null
  const isConfirmed = active?.status === "confirmed"

  function openDialog() {
    setTarget(active ? String(active.target_score) : "")
    setPreview(active && active.status === "draft" ? active : null)
    setOpen(true)
  }

  async function runPreview() {
    const num = Number(target)
    if (!Number.isFinite(num) || num < 0 || num > 100) {
      toast.error("Enter a score between 0 and 100")
      return
    }
    setPreviewing(true)
    const res = await fetch(`/api/candidates/${candidateId}/manual-score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_score: num }),
    })
    setPreviewing(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? "Failed to compute manual score")
      return
    }
    const data = await res.json()
    setPreview(data.manualScore)
    onChange(candidateId, data.manualScore)
  }

  async function confirmScore() {
    if (!preview) return
    setConfirming(true)
    const res = await fetch(`/api/candidates/${candidateId}/manual-score/confirm`, { method: "PATCH" })
    setConfirming(false)
    if (!res.ok) {
      toast.error("Failed to confirm manual score")
      return
    }
    const data = await res.json()
    onChange(candidateId, data.manualScore)
    toast.success(
      data.manualScore.is_exact_match
        ? `Manual score confirmed at ${data.manualScore.achieved_score}%`
        : `Closest achievable score: ${data.manualScore.achieved_score}% (target ${data.manualScore.target_score}% wasn't exactly reachable)`
    )
    setOpen(false)
  }

  async function cancelDialog() {
    // If a draft was just created by Preview but never confirmed, clean it
    // up rather than leaving an orphaned unconfirmed row behind.
    if (preview && preview.status === "draft" && preview.id !== active?.id) {
      await fetch(`/api/candidates/${candidateId}/manual-score`, { method: "DELETE" }).catch(() => {})
      onChange(candidateId, active)
    }
    setOpen(false)
  }

  async function deleteManualScore() {
    if (!confirm("Delete this manual score? This disables Manual Answers/Report/Release for this candidate. The original result is never affected.")) return
    setDeleting(true)
    const res = await fetch(`/api/candidates/${candidateId}/manual-score`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) { toast.error("Failed to delete manual score"); return }
    onChange(candidateId, null)
    toast.success("Manual score deleted")
  }

  async function releaseManual() {
    setReleasing(true)
    const res = await fetch(`/api/candidates/${candidateId}/manual-release`, { method: "POST" })
    setReleasing(false)
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      toast.error(data.error ?? "Failed to send manual release")
      return
    }
    toast.success("Manual result released to candidate")
  }

  return (
    <>
      {isConfirmed ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
              />
            }
          >
            <Sliders className="h-3 w-3" /> Manual <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              render={<Link href={`/exams/${examId}/results/${candidateId}?mode=manual`} />}
            >
              <Eye className="h-3.5 w-3.5 mr-1.5" /> Manual Answers
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<Link href={`/reports/candidate/${candidateId}?mode=manual`} target="_blank" />}
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" /> Manual Report
            </DropdownMenuItem>
            <DropdownMenuItem onClick={releaseManual} disabled={releasing}>
              {releasing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Manual Release
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openDialog}>
              <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Score
            </DropdownMenuItem>
            <DropdownMenuItem onClick={deleteManualScore} disabled={deleting} className="text-red-500">
              {deleting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1 text-muted-foreground"
          onClick={openDialog}
        >
          <Sliders className="h-3 w-3" /> Manual
        </Button>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v) cancelDialog(); else setOpen(v) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Score</DialogTitle>
            <DialogDescription>
              Enter the desired overall score. The system will automatically decide which
              answers need to change so the total matches it, without touching the candidate's real result.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="e.g. 40"
                className="w-32"
              />
              <span className="text-sm text-muted-foreground">%</span>
              <Button variant="outline" size="sm" onClick={runPreview} disabled={previewing}>
                {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Preview"}
              </Button>
            </div>

            {preview && (
              <div className="rounded-lg border p-3 text-sm space-y-1 bg-muted/40">
                {preview.is_identical_to_original ? (
                  <p>Target equals the candidate&apos;s real score — no answers will change.</p>
                ) : preview.is_exact_match ? (
                  <p>
                    Achievable exactly: <span className="font-semibold text-purple-700">{preview.achieved_score}%</span>
                  </p>
                ) : (
                  <p>
                    Target not exactly reachable (all-MCQ paper). Closest achievable score:{" "}
                    <span className="font-semibold text-purple-700">{preview.achieved_score}%</span>
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancelDialog}>Cancel</Button>
            <Button onClick={confirmScore} disabled={!preview || confirming} className="bg-purple-600 hover:bg-purple-700 text-white">
              {confirming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function ManualScoreBadge({ manualScore }: { manualScore: ManualScoreRow | null }) {
  if (!manualScore || manualScore.status !== "confirmed") return null
  return (
    <Badge className="bg-purple-100 text-purple-700 border-0 text-[10px] mt-1">
      Manual: {manualScore.achieved_score}%{!manualScore.is_exact_match ? " (closest)" : ""}
    </Badge>
  )
}
