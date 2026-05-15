import type { Metadata } from "next"
import "./globals.css"
import { Toaster } from "@/components/ui/sonner"
import Providers from "@/components/Providers"

export const metadata: Metadata = {
  title: "ICS Hub",
  description: "Integrated Consulting Services — Training & Assessment Platform",
  icons: {
    icon: "/icon/icon-dark-blue.png",
    apple: "/icon/icon-dark-blue.png",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        <Providers>{children}</Providers>
        <Toaster richColors position="top-right" />
      </body>
    </html>
  )
}
