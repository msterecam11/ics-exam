"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BarChart3, CalendarDays, MapPin, Users, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

export default function ReportsIndexPage() {
  const [groups, setGroups] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/interview/groups")
      .then(r => r.json())
      .then(data => {
        const reportable = (Array.isArray(data) ? data : [])
          .filter((g: any) => ["complete", "published"].includes(g.status))
        setGroups(reportable)
      })
      .catch(() => toast.error("Failed to load groups"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-xl font-bold">Reports</h2>
        <p className="text-sm text-muted-foreground mt-1">Assessment reports for completed and published groups</p>
      </div>

      {groups.length === 0 && (
        <div className="text-center py-16 text-slate-400">
          <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">No completed groups yet</p>
          <p className="text-xs mt-1">Groups must be marked Complete or Published to generate reports</p>
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g: any) => (
          <Link key={g.id} href={`/interview/reports/${g.id}`}>
            <Card className="hover:border-[#1B4F8A]/30 hover:shadow-md transition-all cursor-pointer group">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="w-10 h-10 rounded-xl bg-[#1B4F8A]/10 flex items-center justify-center shrink-0">
                  <BarChart3 className="h-5 w-5 text-[#1B4F8A]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-700 group-hover:text-[#1B4F8A] transition-colors">{g.name}</p>
                    <Badge className={cn("border-0 text-[10px] capitalize", g.status === "published" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700")}>
                      {g.status}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                    {g.location        && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{g.location}</span>}
                    {g.scheduled_date  && <span className="flex items-center gap-1"><CalendarDays className="h-3 w-3" />{new Date(g.scheduled_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="shrink-0 text-slate-400 group-hover:text-[#1B4F8A]">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
