"use client"

import Image from "next/image"
import Link from "next/link"
import { signOut } from "next-auth/react"
import { LogOut, ArrowRight, GraduationCap, Users, BookOpen, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface System {
  id: string
  label: string
  description: string
  icon: React.ElementType
  href: string
  status: "live" | "soon"
  accent: string
  accentBg: string
  accentText: string
}

const SYSTEMS: System[] = [
  {
    id: "exam",
    label: "Exam System",
    description: "Create and manage exams, candidates, groups, and detailed performance reports.",
    icon: GraduationCap,
    href: "/dashboard",
    status: "live",
    accent: "#1B4F8A",
    accentBg: "bg-[#1B4F8A]",
    accentText: "text-[#1B4F8A]",
  },
  {
    id: "interview",
    label: "Panel Interview",
    description: "Structured competency-based panel interviews with live scoring and assessor coordination.",
    icon: Users,
    href: "/interview",
    status: "live",
    accent: "#6366f1",
    accentBg: "bg-indigo-600",
    accentText: "text-indigo-600",
  },
  {
    id: "lms",
    label: "Learning Management",
    description: "Course delivery, progress tracking, and certification management for trainees.",
    icon: BookOpen,
    href: "#",
    status: "soon",
    accent: "#059669",
    accentBg: "bg-emerald-600",
    accentText: "text-emerald-600",
  },
  {
    id: "reports",
    label: "Unified Reports",
    description: "Cross-system analytics and performance insights across all ICS Hub platforms.",
    icon: BarChart3,
    href: "#",
    status: "soon",
    accent: "#d97706",
    accentBg: "bg-amber-600",
    accentText: "text-amber-600",
  },
]

interface Props {
  userName: string
  userEmail: string
  userInitial: string
}

export default function HubPortal({ userName, userEmail, userInitial }: Props) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Top bar */}
      <header className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image
            src="/logo/logo-dark-blue.png"
            alt="ICS Aviation"
            width={140}
            height={38}
            className="object-contain"
            priority
          />
          <div className="h-5 w-px bg-slate-200 mx-1" />
          <span className="text-sm font-semibold text-[#1B4F8A] tracking-wide">HUB</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-[#1B4F8A] flex items-center justify-center text-white text-sm font-bold shrink-0">
              {userInitial}
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-slate-800 leading-tight">{userName}</p>
              <p className="text-xs text-slate-400 leading-tight">{userEmail}</p>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        {/* Heading */}
        <div className="text-center mb-12 max-w-lg">
          <p className="text-sm font-semibold text-[#1B4F8A] uppercase tracking-widest mb-2">ICS Hub</p>
          <h1 className="text-3xl font-bold text-slate-800 mb-3">
            Welcome back, {userName.split(" ")[0]}
          </h1>
          <p className="text-slate-500 text-base leading-relaxed">
            Select a system below to get started. More platforms are on their way.
          </p>
        </div>

        {/* System cards grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 w-full max-w-5xl">
          {SYSTEMS.map((system) => {
            const Icon = system.icon
            const isLive = system.status === "live"

            return (
              <div
                key={system.id}
                className={`bg-white rounded-2xl border flex flex-col p-6 transition-all duration-200 ${
                  isLive
                    ? "border-slate-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5 cursor-pointer group"
                    : "border-slate-100 opacity-70"
                }`}
              >
                {/* Icon */}
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${
                    isLive ? system.accentBg : "bg-slate-100"
                  }`}
                >
                  <Icon className={`h-6 w-6 ${isLive ? "text-white" : "text-slate-400"}`} />
                </div>

                {/* Title + badge */}
                <div className="flex items-start justify-between mb-3">
                  <h2 className={`text-base font-bold ${isLive ? "text-slate-800" : "text-slate-400"}`}>
                    {system.label}
                  </h2>
                  {isLive ? (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full ml-2 shrink-0">
                      Live
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full ml-2 shrink-0">
                      Soon
                    </span>
                  )}
                </div>

                {/* Description */}
                <p className={`text-sm leading-relaxed flex-1 mb-6 ${isLive ? "text-slate-500" : "text-slate-400"}`}>
                  {system.description}
                </p>

                {/* CTA */}
                {isLive ? (
                  <Link
                    href={system.href}
                    className={`flex items-center justify-between text-sm font-semibold ${system.accentText} group-hover:gap-2 transition-all`}
                  >
                    <span>Open System</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ) : (
                  <div className="flex items-center justify-between text-sm font-semibold text-slate-300 cursor-not-allowed">
                    <span>Coming Soon</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center py-5 text-xs text-slate-400 shrink-0">
        ICS Aviation — Integrated Consulting Services &nbsp;·&nbsp; ICS Hub v1.0
      </footer>
    </div>
  )
}
