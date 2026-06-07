"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, BookOpen, Globe, Monitor, Layers,
  Loader2, CheckCircle2, Info,
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type DeliveryMode = "online" | "onsite" | "hybrid"

const DELIVERY_OPTIONS: { value: DeliveryMode; label: string; icon: React.ElementType; desc: string }[] = [
  { value: "online",  icon: Globe,    label: "Online",  desc: "Fully virtual — videos, PDFs, quizzes" },
  { value: "onsite",  icon: Monitor,  label: "On-site", desc: "Classroom — QR attendance, live sessions" },
  { value: "hybrid",  icon: Layers,   label: "Hybrid",  desc: "Mix of online and on-site modules" },
]

export default function NewCoursePage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  // Basic
  const [title,        setTitle]        = useState("")
  const [description,  setDescription]  = useState("")
  const [language,     setLanguage]     = useState("en")
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>("online")

  // Dates & capacity
  const [startDate, setStartDate] = useState("")
  const [endDate,   setEndDate]   = useState("")
  const [capacity,  setCapacity]  = useState("")
  const [dripDays,  setDripDays]  = useState("")

  // Settings
  const [progressEnforcement,    setProgressEnforcement]    = useState(true)
  const [minAttendancePct,       setMinAttendancePct]       = useState(80)
  const [finalExamPassMark,      setFinalExamPassMark]      = useState(70)
  const [certificateEnabled,     setCertificateEnabled]     = useState(true)
  const [certificateAutoRelease, setCertificateAutoRelease] = useState(false)
  const [feedbackEnabled,        setFeedbackEnabled]        = useState(true)
  const [feedbackMandatory,      setFeedbackMandatory]      = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error("Course title is required"); return }

    setSaving(true)
    const res  = await fetch("/api/lms/courses", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        title:                    title.trim(),
        description:              description.trim() || null,
        language,
        delivery_mode:            deliveryMode,
        start_date:               startDate || null,
        end_date:                 endDate   || null,
        capacity:                 capacity  ? parseInt(capacity)  : null,
        drip_days:                dripDays  ? parseInt(dripDays)  : null,
        progress_enforcement:     progressEnforcement,
        min_attendance_pct:       minAttendancePct,
        final_exam_pass_mark:     finalExamPassMark,
        certificate_enabled:      certificateEnabled,
        certificate_auto_release: certificateAutoRelease,
        feedback_enabled:         feedbackEnabled,
        feedback_mandatory:       feedbackMandatory,
      }),
    })
    const data = await res.json()
    setSaving(false)

    if (!res.ok) { toast.error(data.error ?? "Failed to create course"); return }
    toast.success("Course created!")
    router.push(`/lms-admin/courses/${data.id}`)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/lms-admin/courses">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">New Course</h1>
          <p className="text-sm text-slate-500">Fill in the details to create a new LMS course</p>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-8">

        {/* ─── Basic Info ─────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-[#1B4F8A]" /> Basic Information
          </h2>

          <div className="space-y-2">
            <Label htmlFor="title">Course Title <span className="text-red-500">*</span></Label>
            <Input
              id="title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Aviation Safety Management"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Brief overview of the course objectives and content…"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Language</Label>
              <Select value={language} onValueChange={v => setLanguage(v ?? "en")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ar">Arabic</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ─── Delivery Mode ───────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Delivery Mode</h2>
          <div className="grid grid-cols-3 gap-3">
            {DELIVERY_OPTIONS.map(opt => {
              const Icon = opt.icon
              const active = deliveryMode === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDeliveryMode(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 text-center transition-all",
                    active
                      ? "border-[#1B4F8A] bg-blue-50 text-[#1B4F8A]"
                      : "border-slate-200 hover:border-slate-300 text-slate-600"
                  )}
                >
                  <Icon className="h-6 w-6" />
                  <span className="text-sm font-semibold">{opt.label}</span>
                  <span className="text-xs text-slate-500 leading-tight">{opt.desc}</span>
                </button>
              )
            })}
          </div>
        </section>

        {/* ─── Schedule & Capacity ────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">Schedule &amp; Capacity</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start">Start Date</Label>
              <Input id="start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end">End Date</Label>
              <Input id="end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cap">Max Capacity</Label>
              <Input
                id="cap"
                type="number"
                min={1}
                value={capacity}
                onChange={e => setCapacity(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="drip" className="flex items-center gap-1">
                Drip Days
                <span className="text-slate-400" title="Unlock new modules every N days after enrollment">
                  <Info className="h-3.5 w-3.5" />
                </span>
              </Label>
              <Input
                id="drip"
                type="number"
                min={1}
                value={dripDays}
                onChange={e => setDripDays(e.target.value)}
                placeholder="No drip"
              />
            </div>
          </div>
        </section>

        {/* ─── Learning Settings ──────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
          <h2 className="text-base font-semibold text-slate-900">Learning Settings</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="att">Min. Attendance %</Label>
              <Input
                id="att"
                type="number"
                min={0} max={100}
                value={minAttendancePct}
                onChange={e => setMinAttendancePct(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pass">Final Exam Pass Mark %</Label>
              <Input
                id="pass"
                type="number"
                min={0} max={100}
                value={finalExamPassMark}
                onChange={e => setFinalExamPassMark(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Toggle settings */}
          <div className="space-y-3 pt-1">
            {[
              {
                id:      "progEnf",
                label:   "Enforce sequential progress",
                desc:    "Students must complete each item before moving on",
                value:   progressEnforcement,
                setter:  setProgressEnforcement,
              },
              {
                id:      "certEn",
                label:   "Enable certificates",
                desc:    "Generate a certificate on course completion",
                value:   certificateEnabled,
                setter:  setCertificateEnabled,
              },
              {
                id:      "certAuto",
                label:   "Auto-release certificate",
                desc:    "Issue certificate automatically when all criteria are met",
                value:   certificateAutoRelease,
                setter:  setCertificateAutoRelease,
                disabled: !certificateEnabled,
              },
              {
                id:      "fbEn",
                label:   "Enable feedback",
                desc:    "Students can rate and review the course",
                value:   feedbackEnabled,
                setter:  setFeedbackEnabled,
              },
              {
                id:      "fbMand",
                label:   "Mandatory feedback",
                desc:    "Require feedback before issuing certificate",
                value:   feedbackMandatory,
                setter:  setFeedbackMandatory,
                disabled: !feedbackEnabled,
              },
            ].map(item => (
              <div
                key={item.id}
                className={cn(
                  "flex items-center justify-between py-3 border-b border-slate-100 last:border-0",
                  item.disabled && "opacity-50"
                )}
              >
                <div>
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  <p className="text-xs text-slate-500">{item.desc}</p>
                </div>
                <Switch
                  checked={item.value}
                  onCheckedChange={item.setter}
                  disabled={item.disabled}
                />
              </div>
            ))}
          </div>
        </section>

        {/* ─── Actions ────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 pb-8">
          <Link href="/lms-admin/courses">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button
            type="submit"
            disabled={saving || !title.trim()}
            className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2 min-w-[140px]"
          >
            {saving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating…</>
              : <><CheckCircle2 className="h-4 w-4" /> Create Course</>}
          </Button>
        </div>
      </form>
    </div>
  )
}
