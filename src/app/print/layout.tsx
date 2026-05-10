import { Suspense } from "react"
import PrintTrigger from "@/components/reports/PrintTrigger"

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "white", minHeight: "100vh" }}>
      <Suspense>
        <PrintTrigger />
      </Suspense>
      {children}
    </div>
  )
}
