"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, ClipboardList, ChevronRight, Layers, Settings2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function ConfigsPage() {
  const [configs, setConfigs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/interview/configs")
      .then(r => r.json())
      .then(d => { setConfigs(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Assessment Configs</h2>
          <p className="text-muted-foreground text-sm mt-1">Reusable competency frameworks — define pillars, competencies, and scoring weights.</p>
        </div>
        <Link href="/interview/configs/new">
          <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
            <Plus className="h-4 w-4" /> New Config
          </Button>
        </Link>
      </div>

      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="h-36 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {!loading && configs.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-slate-100 p-4 rounded-2xl mb-4">
              <ClipboardList className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-base font-semibold text-slate-700">No configs yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">Create your first assessment config to define the competency framework.</p>
            <Link href="/interview/configs/new">
              <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
                <Plus className="h-4 w-4" /> Create Config
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && configs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {configs.map((cfg: any) => {
            const pillarCount = cfg.pillars?.length ?? 0
            const competencyCount = cfg.pillars?.reduce((s: number, p: any) => s + (p.competencies?.length ?? 0), 0) ?? 0
            return (
              <Link key={cfg.id} href={`/interview/configs/${cfg.id}`}>
                <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md hover:border-[#1B4F8A]/30 transition-all group cursor-pointer h-full flex flex-col">
                  <div className="flex items-start justify-between mb-3">
                    <div className="bg-[#1B4F8A]/8 p-2.5 rounded-lg">
                      <Settings2 className="h-5 w-5 text-[#1B4F8A]" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] transition-colors mt-1" />
                  </div>
                  <p className="text-base font-bold text-slate-800 mb-1">{cfg.name}</p>
                  {cfg.description && (
                    <p className="text-xs text-slate-500 mb-3 line-clamp-2">{cfg.description}</p>
                  )}
                  <div className="mt-auto flex items-center gap-3">
                    <Badge variant="secondary" className="gap-1 text-xs">
                      <Layers className="h-3 w-3" /> {pillarCount} pillar{pillarCount !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {competencyCount} competenc{competencyCount !== 1 ? "ies" : "y"}
                    </Badge>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
