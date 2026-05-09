"use client"

import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Printer, ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

interface Props {
  children: React.ReactNode
  title: string
  subtitle?: string
  generatedAt?: string
}

export default function ReportLayout({ children, title, subtitle, generatedAt }: Props) {
  const router = useRouter()

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .report-page { box-shadow: none !important; margin: 0 !important; }
          body { background: white !important; }
          @page { size: A4; margin: 15mm 15mm 20mm 15mm; }
        }
      `}</style>

      {/* Toolbar — hidden on print */}
      <div className="no-print sticky top-0 z-50 bg-white border-b shadow-sm px-6 py-3 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={() => router.back()}
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <Button
          onClick={() => window.print()}
          className="gap-2 bg-[#1B4F8A] hover:bg-[#163f6e] text-white"
          size="sm"
        >
          <Printer className="h-4 w-4" /> Download PDF
        </Button>
      </div>

      {/* A4 report container */}
      <div className="bg-slate-100 min-h-screen py-8 px-4 print:bg-white print:p-0 print:m-0">
        <div className="report-page max-w-[794px] mx-auto bg-white shadow-xl rounded-sm print:rounded-none print:shadow-none">

          {/* Report Header — appears on every logical section */}
          <header className="flex items-center justify-between px-10 pt-8 pb-6 border-b-2 border-[#1B4F8A]">
            <Image
              src="/logo/logo-dark-blue.png"
              alt="ICS Aviation"
              width={130}
              height={36}
              className="object-contain"
            />
            <div className="text-right">
              <p className="text-xs font-semibold text-[#1B4F8A] uppercase tracking-widest">{title}</p>
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
              {generatedAt && (
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Generated {new Date(generatedAt).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", year: "numeric"
                  })}
                </p>
              )}
            </div>
          </header>

          {/* Report body */}
          <main className="px-10 py-8 space-y-8">
            {children}
          </main>

          {/* Footer */}
          <footer className="px-10 py-5 border-t border-slate-200 flex items-center justify-between">
            <p className="text-[10px] text-slate-400">
              ICS Aviation — Integrated Consulting Services · Confidential
            </p>
            <p className="text-[10px] text-slate-400">
              {new Date().getFullYear()} · For internal use only
            </p>
          </footer>
        </div>
      </div>
    </>
  )
}
