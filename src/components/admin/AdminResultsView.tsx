"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Progress } from "@/components/ui/progress"
import { Eye, Send, CheckCircle2, XCircle, Clock, Users, BarChart2, Loader2, FileText } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { formatScore } from "@/lib/utils"

interface Props {
  exam: any
  candidates: any[]
}

export default function AdminResultsView({ exam, candidates }: Props) {
  const router = useRouter()
  const [releasing, setReleasing] = useState<string | null>(null)

  const submitted = candidates.filter((c) => c.submitted_at)
  const passed = submitted.filter((c) => c.passed)
  const passRate = submitted.length > 0 ? Math.round((passed.length / submitted.length) * 100) : 0
  const avgScore =
    submitted.length > 0
      ? submitted.reduce((sum, c) => sum + (c.total_score ?? 0), 0) / submitted.length
      : 0

  async function releaseAll() {
    setReleasing("all")
    const res = await fetch(`/api/exams/${exam.id}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    setReleasing(null)
    if (res.ok) { toast.success("Results released to all candidates"); router.refresh() }
    else toast.error("Failed to release results")
  }

  async function releaseOne(candidateId: string) {
    setReleasing(candidateId)
    const res = await fetch(`/api/exams/${exam.id}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidate_id: candidateId }),
    })
    setReleasing(null)
    if (res.ok) { toast.success("Result released"); router.refresh() }
    else toast.error("Failed to release")
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">{exam.title}</h2>
          <p className="text-muted-foreground text-sm">{exam.courses?.groups?.name} → {exam.courses?.name}</p>
        </div>
        {exam.show_results === "admin_release" && (
          <Button
            onClick={releaseAll}
            disabled={releasing === "all" || submitted.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
          >
            {releasing === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Release All Results
          </Button>
        )}
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total Candidates", value: candidates.length, icon: Users, color: "text-[#1B4F8A]" },
          { label: "Submitted", value: submitted.length, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Avg Score", value: `${avgScore.toFixed(1)}%`, icon: BarChart2, color: "text-purple-600" },
          { label: "Pass Rate", value: `${passRate}%`, icon: BarChart2, color: passRate >= 60 ? "text-emerald-600" : "text-red-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Icon className="h-3.5 w-3.5" />
                <span className="text-xs">{label}</span>
              </div>
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Score distribution */}
      {submitted.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-6">0%</span>
              <Progress value={passRate} className="flex-1 h-3" />
              <span className="text-xs text-muted-foreground w-12 text-right">100%</span>
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-xs text-red-500">{submitted.length - passed.length} Failed</span>
              <span className="text-xs text-emerald-600">{passed.length} Passed</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Candidates table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Candidates ({candidates.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {candidates.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No candidates yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Released</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {candidates.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{c.full_name}</p>
                          <p className="text-xs text-muted-foreground">{c.email}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{c.company}</TableCell>
                      <TableCell>
                        {c.submitted_at ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Submitted</Badge>
                        ) : (
                          <Badge className="bg-amber-100 text-amber-700 border-0 text-xs gap-1">
                            <Clock className="h-2.5 w-2.5" /> In progress
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.total_score !== null ? (
                          <span className={`font-semibold text-sm ${c.passed ? "text-emerald-600" : "text-red-500"}`}>
                            {formatScore(c.total_score)}
                          </span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {c.passed !== null ? (
                          c.passed
                            ? <span className="text-emerald-600 text-sm font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Pass</span>
                            : <span className="text-red-500 text-sm font-medium flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />Fail</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell>
                        {c.results_released
                          ? <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Yes</Badge>
                          : <Badge variant="outline" className="text-xs">No</Badge>
                        }
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {c.submitted_at && (
                            <>
                              <Link
                                href={`/exams/${exam.id}/results/${c.id}`}
                                className="inline-flex items-center gap-1 h-7 px-2 text-xs border border-border rounded-md hover:bg-muted transition-colors"
                              >
                                <Eye className="h-3 w-3" /> Answers
                              </Link>
                              <Link
                                href={`/reports/candidate/${c.id}`}
                                target="_blank"
                                className="inline-flex items-center gap-1 h-7 px-2 text-xs border border-[#1B4F8A] text-[#1B4F8A] rounded-md hover:bg-blue-50 transition-colors"
                              >
                                <FileText className="h-3 w-3" /> Report
                              </Link>
                            </>
                          )}

                          {exam.show_results === "admin_release" && !c.results_released && c.submitted_at && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => releaseOne(c.id)}
                              disabled={releasing === c.id}
                            >
                              {releasing === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                              Release
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
