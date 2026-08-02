import { db } from "@/lib/db"
import { FileText, Library } from "lucide-react"

export default async function StudioLibraryPage() {
  const { data: refs } = await db
    .from("cg_reference_materials")
    .select("id, file_name, file_url, created_at, extracted_text, cg_courses(id, title)")
    .order("created_at", { ascending: false })
    .limit(100)

  const list = refs ?? []

  return (
    <div className="s-fade" style={{ maxWidth: 1160, margin: "0 auto" }}>
      <div style={{ marginBottom: 22 }}>
        <h1 className="s-h1">Reference Library</h1>
        <p className="s-body" style={{ marginTop: 4 }}>
          Source documents that ground generation. Files marked <strong>READ</strong> had their text extracted and are fed to the Content Agent; others are stored but not readable.
        </p>
      </div>

      {list.length === 0 ? (
        <div className="s-card flex flex-col items-center text-center"
          style={{ padding: "52px 30px", borderStyle: "dashed", borderColor: "#A9CFF0" }}>
          <Library className="h-7 w-7" style={{ color: "var(--s-primary)" }} />
          <p className="s-h2" style={{ marginTop: 14 }}>No reference materials yet</p>
          <p className="s-body" style={{ marginTop: 6, maxWidth: 430 }}>
            Attach regulatory documents or past courses when creating a course — generation is noticeably more accurate when grounded.
          </p>
        </div>
      ) : (
        <div className="s-card overflow-hidden">
          {list.map((r: any, i: number) => (
            <div key={r.id} className="flex items-center gap-3"
              style={{ padding: "12px 18px", borderBottom: i === list.length - 1 ? "none" : "1px solid var(--s-line-soft)" }}>
              <span className="shrink-0 flex items-center justify-center"
                style={{ width: 32, height: 32, borderRadius: 8, background: "var(--s-tint)" }}>
                <FileText className="h-4 w-4" style={{ color: "var(--s-primary)" }} />
              </span>
              <div className="flex-1 min-w-0">
                <a href={r.file_url} target="_blank" rel="noreferrer" className="s-h3 truncate block">{r.file_name}</a>
                <p className="s-meta" style={{ fontSize: 11.5 }}>{(r.cg_courses as any)?.title ?? "—"}</p>
              </div>
              <span className="s-meta shrink-0" style={{ fontSize: 11.5 }}>
                {new Date(r.created_at).toLocaleDateString("en-GB")}
              </span>
              <span className={`s-pill ${r.extracted_text ? "s-pill-ready" : "s-pill-neutral"}`} style={{ fontSize: 10, padding: "2px 9px" }}>
                {r.extracted_text ? "READ" : "STORED"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
