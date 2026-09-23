import { FileText, FileArchive, FileSpreadsheet, Image as ImageIcon, Film } from "lucide-react"

// Shared by the admin materials manager and the participant's course page.

export const fmtSize = (b: number | null | undefined) =>
  !b ? "" : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(b >= 10 * 1024 * 1024 ? 0 : 1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`

export function FileIcon({ name, className }: { name: string; className?: string }) {
  const ext = (name.split(".").pop() ?? "").toLowerCase()
  const Icon = ext === "zip" ? FileArchive : ["xls", "xlsx", "csv"].includes(ext) ? FileSpreadsheet
    : ["png", "jpg", "jpeg"].includes(ext) ? ImageIcon : ext === "mp4" ? Film : FileText
  return <Icon className={className} />
}
