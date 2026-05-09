"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Users, Loader2, Search, CheckCircle, XCircle, Clock } from "lucide-react"
import { formatScore } from "@/lib/utils"

export default function CandidatesPage() {
  const [candidates, setCandidates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetch("/api/candidates")
      .then((r) => r.json())
      .then((data) => { setCandidates(data); setLoading(false) })
  }, [])

  const filtered = candidates.filter((c) =>
    c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.exams?.title?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-bold">Candidates</h2>
        <p className="text-muted-foreground text-sm">All exam submissions across all exams</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, email, or exam…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-[#1B4F8A]" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-muted-foreground">
              {search ? "No candidates match your search." : "No candidates yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Candidate</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Exam</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Company</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Score</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium">{c.full_name}</p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.exams?.title ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.company}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {c.submitted_at ? formatScore(c.total_score) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {!c.submitted_at ? (
                      <Badge className="bg-amber-100 text-amber-700 border-0 gap-1">
                        <Clock className="h-3 w-3" /> In Progress
                      </Badge>
                    ) : c.passed ? (
                      <Badge className="bg-emerald-100 text-emerald-700 border-0 gap-1">
                        <CheckCircle className="h-3 w-3" /> Passed
                      </Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-700 border-0 gap-1">
                        <XCircle className="h-3 w-3" /> Failed
                      </Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
