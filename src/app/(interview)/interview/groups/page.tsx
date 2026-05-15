"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, Users, CalendarDays, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-slate-100 text-slate-600",
  active:    "bg-emerald-100 text-emerald-700",
  complete:  "bg-blue-100 text-blue-700",
  published: "bg-purple-100 text-purple-700",
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/interview/groups")
      .then(r => r.json())
      .then(d => { setGroups(Array.isArray(d) ? d : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground">Interview Groups</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage cohort sessions — candidates, assessors, and scoring.</p>
        </div>
        <Link href="/interview/groups/new">
          <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
            <Plus className="h-4 w-4" /> New Group
          </Button>
        </Link>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-20 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      )}

      {!loading && groups.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-slate-100 p-4 rounded-2xl mb-4">
              <Users className="h-8 w-8 text-slate-400" />
            </div>
            <p className="text-base font-semibold text-slate-700">No groups yet</p>
            <p className="text-sm text-muted-foreground mt-1 mb-5">Create an interview group to start managing candidates and scoring.</p>
            <Link href="/interview/groups/new">
              <Button className="bg-[#1B4F8A] hover:bg-[#163f6e] text-white gap-2">
                <Plus className="h-4 w-4" /> Create Group
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {!loading && groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((g: any) => (
            <Link key={g.id} href={`/interview/groups/${g.id}`}>
              <div className="bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md hover:border-[#1B4F8A]/30 transition-all group flex items-center gap-4">
                <div className="bg-[#1B4F8A]/8 p-3 rounded-xl shrink-0">
                  <Users className="h-5 w-5 text-[#1B4F8A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-800">{g.name}</p>
                    <Badge className={cn("text-xs border-0 capitalize", STATUS_STYLES[g.status] ?? "bg-slate-100")}>
                      {g.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-muted-foreground">{(g.assessment_configs as any)?.name}</span>
                    {g.scheduled_date && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {new Date(g.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" />
                    {(g.interview_candidates as any[])?.length ?? 0} candidates
                  </span>
                  <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-[#1B4F8A] transition-colors" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
