import { db } from "@/lib/db"
import { FileText } from "lucide-react"

export default async function StudioLibraryPage() {
  const { data: refs } = await db
    .from("cg_reference_materials")
    .select("id, file_name, created_at, cg_courses(title)")
    .order("created_at", { ascending: false })
    .limit(100)

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Reference Library</h1>
        <p className="text-sm text-slate-500 mt-1">
          Uploaded source documents that ground course generation. Files are attached per course from the Create wizard.
        </p>
      </div>

      {(refs ?? []).length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 p-12 text-center text-sm text-slate-500">
          No reference materials uploaded yet.
        </div>
      ) : (
        <div className="space-y-2">
          {(refs ?? []).map((r: any) => (
            <div key={r.id} className="flex items-center gap-3 bg-white rounded-lg border border-slate-200 px-4 py-3">
              <FileText className="h-4 w-4 text-[#0C72C6] shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-700 truncate">{r.file_name}</p>
                <p className="text-xs text-slate-400">{(r.cg_courses as any)?.title ?? "—"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
