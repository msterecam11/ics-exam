"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Clock, BookOpen, Lock, Loader2, AlertTriangle } from "lucide-react"
import { formatDuration } from "@/lib/utils"

export default function ExamLandingPage({ params }: { params: Promise<{ examId: string }> }) {
  const router = useRouter()
  const [examId, setExamId] = useState<string>("")
  const [examInfo, setExamInfo] = useState<any>(null)
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [verifying, setVerifying] = useState(false)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    params.then(({ examId: id }) => {
      setExamId(id)
      fetch(`/api/exam/${id}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) setNotFound(true)
          else setExamInfo(data)
          setLoading(false)
        })
        .catch(() => { setNotFound(true); setLoading(false) })
    })
  }, [params])

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setVerifying(true)

    const res = await fetch(`/api/exam/${examId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })

    setVerifying(false)

    if (res.ok) {
      const data = await res.json()
      sessionStorage.setItem(`exam_${examId}`, JSON.stringify(data))
      router.push(`/exam/${examId}/register`)
    } else {
      const err = await res.json()
      setError(err.error ?? "Invalid password")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] to-[#4B7EC8] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    )
  }

  if (notFound || (examInfo && examInfo.status === "closed")) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] to-[#4B7EC8] flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-8">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-bold">Exam Not Available</h2>
            <p className="text-muted-foreground text-sm mt-2">
              This exam is no longer active or does not exist.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] to-[#4B7EC8] flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="flex justify-center mb-2">
          <Image src="/logo/logo-white.png" alt="ICS Aviation" width={180} height={50} className="object-contain" />
        </div>

        <Card className="shadow-2xl border-0">
          <CardContent className="pt-8 pb-8 px-8 space-y-5">
            {/* Exam info */}
            <div className="text-center space-y-1">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {examInfo?.courses?.groups?.name} — {examInfo?.courses?.name}
              </p>
              <h1 className="text-xl font-bold text-[#1B4F8A]">{examInfo?.title}</h1>
              {examInfo?.description && (
                <p className="text-sm text-muted-foreground">{examInfo.description}</p>
              )}
            </div>

            <div className="flex justify-center gap-4">
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>{formatDuration(examInfo?.duration_minutes)}</span>
              </div>
              <Badge
                variant={examInfo?.status === "active" ? "default" : "secondary"}
                className="bg-emerald-100 text-emerald-700 border-0"
              >
                Open
              </Badge>
            </div>

            <div className="border-t pt-4">
              <form onSubmit={handleVerify} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">Enter Exam Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="text"
                      placeholder="e.g. ABC123"
                      value={password}
                      onChange={(e) => setPassword(e.target.value.toUpperCase())}
                      className="pl-9 tracking-widest font-bold text-center text-lg"
                      required
                      autoComplete="off"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">
                    Password provided by your instructor
                  </p>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button
                  type="submit"
                  className="w-full bg-[#1B4F8A] hover:bg-[#163f6e] text-white font-semibold h-11"
                  disabled={verifying || !password.trim()}
                >
                  {verifying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Continue
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-white/60 text-xs">
          ICS Aviation — Integrated Consulting Services
        </p>
      </div>
    </div>
  )
}
