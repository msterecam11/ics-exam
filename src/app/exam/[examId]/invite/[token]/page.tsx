"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, AlertTriangle } from "lucide-react"
import { toast } from "sonner"

export default function InvitePage({ params }: { params: Promise<{ examId: string; token: string }> }) {
  const router = useRouter()
  const [examId, setExamId] = useState("")
  const [token, setToken] = useState("")
  const [exam, setExam] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    full_name: "", email: "", job_title: "", years_of_experience: "", company: "",
  })
  const [customValues, setCustomValues] = useState<Record<string, string>>({})

  useEffect(() => {
    params.then(async ({ examId: id, token: t }) => {
      setExamId(id)
      setToken(t)
      const res = await fetch(`/api/exam/${id}/invite/${t}`)
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? "This invite link is not valid.")
        setLoading(false)
        return
      }
      setExam(data.exam)
      setForm({
        full_name: data.invite.full_name ?? "",
        email: data.invite.email ?? "",
        job_title: data.invite.job_title ?? "",
        years_of_experience: data.invite.years_of_experience?.toString() ?? "",
        company: data.invite.company ?? "",
      })
      setCustomValues(data.invite.custom_field_values ?? {})
      setLoading(false)
    })
  }, [params])

  function set(key: string, val: string) {
    setForm((f) => ({ ...f, [key]: val }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // See register/page.tsx for why this must happen synchronously here.
    document.documentElement.requestFullscreen?.().catch(() => {})

    setSubmitting(true)

    const res = await fetch(`/api/exams/${examId}/candidates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        years_of_experience: Number(form.years_of_experience),
        custom_field_values: customValues,
        invite_token: token,
      }),
    })

    setSubmitting(false)

    if (res.ok) {
      const candidate = await res.json()
      sessionStorage.setItem(`exam_${examId}`, JSON.stringify(exam))
      sessionStorage.setItem(`candidate_${examId}`, JSON.stringify(candidate))
      router.push(`/exam/${examId}/take`)
    } else {
      const err = await res.json()
      toast.error(err.error ?? "Registration failed")
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] to-[#4B7EC8] flex items-center justify-center">
        <Loader2 className="h-8 w-8 text-white animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] to-[#4B7EC8] flex items-center justify-center p-4">
        <Card className="shadow-2xl border-0 max-w-md w-full">
          <CardContent className="pt-6 pb-8 px-8 text-center space-y-4">
            <div className="flex justify-center">
              <Image src="/logo/logo-white.png" alt="ICS Aviation" width={140} height={38} className="object-contain opacity-0" />
            </div>
            <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
            <p className="font-semibold">{error}</p>
            <p className="text-sm text-muted-foreground">
              Contact the exam administrator if you believe this is a mistake.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1B4F8A] to-[#4B7EC8] flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-lg space-y-4">
        <div className="flex justify-center">
          <Image src="/logo/logo-white.png" alt="ICS Aviation" width={160} height={44} className="object-contain" />
        </div>

        <Card className="shadow-2xl border-0">
          <CardContent className="pt-6 pb-8 px-8">
            <div className="text-center mb-6">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">
                {exam.courses?.groups?.name} — {exam.courses?.name}
              </p>
              <h1 className="text-lg font-bold text-[#1B4F8A] mt-1">{exam.title}</h1>
              <p className="text-sm text-muted-foreground mt-1">You're personally invited — review your details and begin</p>
            </div>

            <Alert className="mb-4 bg-blue-50 border-blue-100">
              <AlertDescription className="text-xs text-[#1B4F8A]">
                Your info is pre-filled below. Feel free to correct anything before starting.
              </AlertDescription>
            </Alert>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input placeholder="Your full name" value={form.full_name} onChange={(e) => set("full_name", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Email *</Label>
                <Input type="email" placeholder="your@email.com" value={form.email} onChange={(e) => set("email", e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>Job Title *</Label>
                <Input placeholder="e.g. First Officer" value={form.job_title} onChange={(e) => set("job_title", e.target.value)} required />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Years of Experience *</Label>
                  <Input type="number" min={0} placeholder="0" value={form.years_of_experience} onChange={(e) => set("years_of_experience", e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Company *</Label>
                  <Input placeholder="Your company" value={form.company} onChange={(e) => set("company", e.target.value)} required />
                </div>
              </div>

              {(exam.exam_custom_fields ?? []).map((field: any) => (
                <div key={field.id} className="space-y-2">
                  <Label>{field.label}{field.required ? " *" : ""}</Label>
                  {field.field_type === "textarea" ? (
                    <Textarea
                      placeholder="Your answer..."
                      value={customValues[field.id] ?? ""}
                      onChange={(e) => setCustomValues((v) => ({ ...v, [field.id]: e.target.value }))}
                      required={field.required}
                      rows={3}
                    />
                  ) : (
                    <Input
                      type={field.field_type === "number" ? "number" : "text"}
                      value={customValues[field.id] ?? ""}
                      onChange={(e) => setCustomValues((v) => ({ ...v, [field.id]: e.target.value }))}
                      required={field.required}
                    />
                  )}
                </div>
              ))}

              <div className="pt-2">
                <Button
                  type="submit"
                  className="w-full bg-[#1B4F8A] hover:bg-[#163f6e] text-white font-semibold h-11"
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Start Exam ({exam.duration_minutes} min)
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
