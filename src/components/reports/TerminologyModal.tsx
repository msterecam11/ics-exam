"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Users, Building2, BookOpen, Navigation, ShieldAlert } from "lucide-react"

export type EntityTerm = "Group" | "Organization"
export type ContentTerm = "Course" | "Path"

interface Props {
  onConfirm: (entity: EntityTerm, content: ContentTerm, includeSecurity: boolean) => void
}

function OptionCard({
  label, icon, selected, onClick,
}: {
  label: string
  icon: React.ReactNode
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left w-full transition-all duration-150 ${
        selected
          ? "border-[#1B4F8A] bg-[#1B4F8A]/5"
          : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50"
      }`}
    >
      <div className={`shrink-0 ${selected ? "text-[#1B4F8A]" : "text-slate-400"}`}>{icon}</div>
      <span className={`text-sm font-semibold ${selected ? "text-[#1B4F8A]" : "text-slate-500"}`}>{label}</span>
      {selected && (
        <span className="ml-auto w-2 h-2 rounded-full bg-[#1B4F8A] shrink-0" />
      )}
    </button>
  )
}

export default function TerminologyModal({ onConfirm }: Props) {
  const [entity, setEntity] = useState<EntityTerm>("Group")
  const [content, setContent] = useState<ContentTerm>("Course")
  const [includeSecurity, setIncludeSecurity] = useState(false)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">

        {/* Header */}
        <div className="mb-6">
          <h2 className="text-lg font-bold text-slate-800">Report Terminology</h2>
          <p className="text-sm text-slate-400 mt-1">
            Customize how terms appear throughout this report before viewing or downloading.
          </p>
        </div>

        {/* Entity choice */}
        <div className="mb-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
            How to refer to the group?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <OptionCard
              label="Group"
              icon={<Users className="h-4 w-4" />}
              selected={entity === "Group"}
              onClick={() => setEntity("Group")}
            />
            <OptionCard
              label="Organization"
              icon={<Building2 className="h-4 w-4" />}
              selected={entity === "Organization"}
              onClick={() => setEntity("Organization")}
            />
          </div>
        </div>

        {/* Content choice */}
        <div className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
            How to refer to the training?
          </p>
          <div className="grid grid-cols-2 gap-2">
            <OptionCard
              label="Course"
              icon={<BookOpen className="h-4 w-4" />}
              selected={content === "Course"}
              onClick={() => setContent("Course")}
            />
            <OptionCard
              label="Path"
              icon={<Navigation className="h-4 w-4" />}
              selected={content === "Path"}
              onClick={() => setContent("Path")}
            />
          </div>
        </div>

        {/* Security Analysis toggle */}
        <div className="mb-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-3">
            Report Options
          </p>
          <button
            onClick={() => setIncludeSecurity(v => !v)}
            className={`flex items-start gap-3 p-4 rounded-xl border-2 text-left w-full transition-all duration-150 ${
              includeSecurity
                ? "border-red-400 bg-red-50"
                : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50"
            }`}
          >
            <div className={`mt-0.5 shrink-0 ${includeSecurity ? "text-red-500" : "text-slate-400"}`}>
              <ShieldAlert className="h-4 w-4" />
            </div>
            <div className="flex-1">
              <p className={`text-sm font-semibold ${includeSecurity ? "text-red-700" : "text-slate-500"}`}>
                Include Security Analysis
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Adds an AI-generated behavioral assessment based on tab switches, fullscreen exits, and interaction events
              </p>
            </div>
            <div className={`mt-1 w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
              includeSecurity ? "bg-red-500 border-red-500" : "border-slate-300"
            }`}>
              {includeSecurity && <span className="text-white text-[10px] font-bold leading-none">✓</span>}
            </div>
          </button>
        </div>

        {/* Confirm */}
        <Button
          onClick={() => onConfirm(entity, content, includeSecurity)}
          className="w-full bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
          size="lg"
        >
          Continue to Report →
        </Button>
      </div>
    </div>
  )
}
