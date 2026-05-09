"use client"

import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Printer, Download } from "lucide-react"
import QRCode from "@/components/shared/QRCode"
import Image from "next/image"

interface Props {
  exam: any
  examUrl: string
}

export default function InvitationView({ exam, examUrl }: Props) {
  const printRef = useRef<HTMLDivElement>(null)

  function handlePrint() {
    window.print()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Exam Invitation</h2>
          <p className="text-muted-foreground text-sm">Print or share this with candidates</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> Print
          </Button>
        </div>
      </div>

      {/* Printable card */}
      <div ref={printRef} id="invitation-card">
        <Card className="border-2 border-[#1B4F8A] print:shadow-none print:border">
          <CardContent className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <Image
                src="/logo/logo-dark-blue.png"
                alt="ICS Aviation"
                width={180}
                height={50}
                className="object-contain"
              />
              <div className="text-right">
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Examination Notice</p>
                <p className="text-xs text-muted-foreground">
                  {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
                </p>
              </div>
            </div>

            <Separator className="mb-6" />

            <div className="grid grid-cols-[1fr_auto] gap-8 items-start">
              {/* Left: exam info */}
              <div className="space-y-4">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Course</p>
                  <p className="font-semibold text-sm">
                    {exam.courses?.groups?.name} — {exam.courses?.name}
                  </p>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Examination</p>
                  <h3 className="text-2xl font-bold text-[#1B4F8A]">{exam.title}</h3>
                  {exam.description && (
                    <p className="text-sm text-muted-foreground mt-1">{exam.description}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Duration</p>
                    <p className="text-xl font-bold text-[#1B4F8A]">{exam.duration_minutes} min</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Pass Score</p>
                    <p className="text-xl font-bold text-[#1B4F8A]">{exam.passing_score}%</p>
                  </div>
                </div>

                <div className="bg-[#1B4F8A] text-white rounded-xl p-4">
                  <p className="text-xs uppercase tracking-widest opacity-70 mb-1">Access Password</p>
                  <p className="text-3xl font-bold tracking-[0.3em]">{exam.password}</p>
                  <p className="text-xs opacity-70 mt-1">Enter this when prompted</p>
                </div>

                <div className="pt-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">How to start</p>
                  <ol className="text-sm space-y-1 text-muted-foreground list-decimal list-inside">
                    <li>Scan the QR code with your phone, or visit the URL below</li>
                    <li>Enter the password shown above</li>
                    <li>Fill in your details and begin the exam</li>
                  </ol>
                </div>
              </div>

              {/* Right: QR code */}
              <div className="flex flex-col items-center gap-3">
                <div className="bg-white border-2 border-[#1B4F8A] rounded-2xl p-4">
                  <QRCode url={examUrl} size={180} />
                </div>
                <p className="text-xs text-muted-foreground text-center max-w-[140px] break-all">
                  {examUrl.replace("https://", "")}
                </p>
              </div>
            </div>

            <Separator className="mt-6 mb-4" />

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <p>ICS Aviation — Integrated Consulting Services</p>
              <p>Good luck!</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <style>{`
        @media print {
          body * { visibility: hidden; }
          #invitation-card, #invitation-card * { visibility: visible; }
          #invitation-card { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  )
}
