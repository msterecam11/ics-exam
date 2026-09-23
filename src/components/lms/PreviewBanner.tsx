import { Eye } from "lucide-react"

// Shown on every portal page during "Preview as student", so staff can't
// mistake the preview for the student's real session. Nothing is saved while
// it shows (see PREVIEW_READ_ONLY in lms-auth).
export default function PreviewBanner({ name }: { name: string }) {
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] max-w-[calc(100vw-2rem)]
                    flex items-center gap-2 rounded-full bg-amber-500 text-white shadow-lg px-4 py-2 text-xs font-semibold">
      <Eye className="h-4 w-4 shrink-0" />
      <span className="truncate">Previewing as {name} — nothing you do here is saved</span>
    </div>
  )
}
