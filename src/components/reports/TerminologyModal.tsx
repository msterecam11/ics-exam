"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Users, Building2, BookOpen, Navigation } from "lucide-react"

export type EntityTerm = "Group" | "Organization"
export type ContentTerm = "Course" | "Path"

interface Props {
  onConfirm: (entity: EntityTerm, content: ContentTerm) => void
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

        {/* Confirm */}
        <Button
          onClick={() => onConfirm(entity, content)}
          className="w-full bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
          size="lg"
        >
          Continue to Report →
        </Button>
      </div>
    </div>
  )
}
