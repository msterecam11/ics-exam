import { db } from "@/lib/db"
import { Palette } from "lucide-react"

export default async function StudioThemesPage() {
  const { data: themes } = await db
    .from("cg_themes")
    .select("id, name, is_main, tokens, layout_templates, created_at")
    .order("created_at")

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Themes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Slide masters, brand tokens, and layout templates. New themes can be added later — every course binds to one theme.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {(themes ?? []).map((t: any) => {
          const masters = Object.keys(t.layout_templates ?? {})
          const colors: Record<string, string> = t.tokens?.colors ?? {}
          return (
            <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-[#0C72C6]" />
                  <p className="text-sm font-semibold text-slate-800">{t.name}</p>
                </div>
                {t.is_main && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-[#0C72C6]/10 text-[#0C72C6] px-2 py-0.5 rounded-full">
                    Main theme
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 mb-3">
                {["primary", "primary-dark", "primary-light", "accent-warm", "navy"].map(k =>
                  colors[k] ? (
                    <span key={k} title={k} className="w-6 h-6 rounded-full border border-slate-200" style={{ background: colors[k] }} />
                  ) : null
                )}
              </div>
              <p className="text-xs text-slate-400">
                {masters.length} slide masters: {masters.join(", ")}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
